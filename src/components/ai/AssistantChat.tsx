import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ReactMarkdown from 'react-markdown';
import { Bot, Send, Sparkles, User, Loader2, LogIn, Wrench, FileDown, Paperclip, X, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/authContext';
import { useNavigate } from 'react-router-dom';
import { useGuestTrial } from '@/lib/guestTrialContext';
import { toast } from 'sonner';
import { useSupabaseFanDatabase } from '@/hooks/useSupabaseFanDatabase';
import { useAllFanDimensions } from '@/hooks/useFanDatabase';
import {
  findOptimalSelections,
  FanSelection,
  AIRFLOW_UNITS,
  PRESSURE_UNITS,
  calculateAirDensity,
} from '@/lib/fanData';
import { generateDatasheetForSelection } from '@/lib/chatDatasheet';
import { downloadCombinedScheduleDatasheet } from '@/lib/chatScheduleDatasheet';
import { generateAirCurtainDatasheetForSelection } from '@/lib/chatAirCurtainDatasheet';
import {
  downloadFanDrawing,
  downloadFanNoiseData,
  downloadAirCurtainDrawing,
  downloadAirCurtainNoiseData,
} from '@/lib/chatPartialDatasheet';
import {
  rankFanSelections,
  rankAirCurtains,
  FAN_OPTIMIZE_LABEL,
  AC_OPTIMIZE_LABEL,
  type FanOptimizeFor,
  type AcOptimizeFor,
} from '@/lib/chatOptimize';
import {
  useAirCurtainModels,
  useAirCurtainBrands,
  useAirCurtainSeries,
  useAirCurtainDimensions,
} from '@/hooks/useAirCurtains';
import { useTenantData } from '@/hooks/useFanDatabase';
import {
  selectAirCurtains,
  rebuildAirCurtainSelection,
  type AirCurtainSelection,
  type AirCurtainModel,
  type AirCurtainCategory,
  type AirCurtainSpeed,
  type AirCurtainMotorType,
} from '@/lib/airCurtainData';

/**
 * Selection defaults that mirror the Fan Selector / Air Curtain Selector forms,
 * so an AI selection always matches a manual one for the same duty.
 */
function fanSelectorDefaults(db: any, series?: any) {
  return {
    safetyFactor: series?.defaultSafetyFactor ?? 1.15,
    frequency: 50 as const,
    fireClass: '' as const,
    accessory: '' as const,
    atexRating: '' as const,
    toleranceMin: db?.unitPreferences?.defaultToleranceMin ?? 95,
    toleranceMax: db?.unitPreferences?.defaultToleranceMax ?? 105,
    airDensity: calculateAirDensity(0, 20),
    temperature: 20,
  };
}

/** Exact defaults used by AirCurtainSelectorPage. */
const AC_MIN_MATCH_PERCENT = 95;
const AC_MAX_MATCH_PERCENT = 200;
const BACKGROUND_SCHEDULE_MARKER = '<<<KINAIR_BACKGROUND_SCHEDULE_DATA>>>';

/**
 * Customer promotion is post-selection: the normal engine selects first.
 * Only a selected FM35 model in N-Centrifugal or XD-Centrifugal can be
 * promoted, and it must keep the same series, suffix, quantity and mounting.
 */
function isFm35ToFm45PromotionRequest(userText: string): boolean {
  const compact = userText.toUpperCase().replace(/[\s–—-]+/g, '');
  const hasModelInstruction = compact.includes('FM35') && compact.includes('FM45');
  const hasHeightInstruction =
    /3(?:\.0)?\s*(?:-|–|—|TO)\s*3\.5\s*M?/i.test(userText) &&
    /4(?:\.0)?\s*(?:-|–|—|TO)\s*4\.5\s*M?/i.test(userText);
  const asksForPromotion =
    /\b(promote|upgrade|change|replace|switch|revise|convert)\b/i.test(userText);
  return asksForPromotion && (hasModelInstruction || hasHeightInstruction);
}

function promoteSelectedFm35ToFm45(
  selection: AirCurtainSelection,
  models: AirCurtainModel[],
  seriesRecords: Array<{ id: string; name: string }>,
  criteria: {
    doorWidthMm: number;
    doorHeightM: number;
    minFloorVelocity: number;
  },
): AirCurtainSelection {
  let changed = false;
  const promotedUnits = selection.units.map((unit) => {
    const seriesName =
      seriesRecords.find((series) => series.id === unit.model.seriesId)?.name ?? '';
    const isN = /^N-Centrifugal flow$/i.test(seriesName);
    const isXd = /^XD-Centrifugal Flow$/i.test(seriesName);
    if (!isN && !isXd) return unit; // N-Cross Flow and every other series stay untouched.

    const suffix = isXd
      ? String(unit.model.model).match(/^FM-?35(09|10|12|15|18|20)XD/i)?.[1]
      : String(unit.model.model).match(/^FM-?35(09|10|12|15|18|20)-L/i)?.[1];
    if (!suffix) return unit;

    const replacement = models.find((model) => {
      if (model.seriesId !== unit.model.seriesId) return false;
      return isXd
        ? new RegExp(`^FM-?45${suffix}XD`, 'i').test(model.model)
        : new RegExp(`^FM-?45${suffix}-L`, 'i').test(model.model);
    });
    if (!replacement) return unit;
    changed = true;
    return { model: replacement, qty: unit.qty };
  });

  if (!changed) return selection;
  const rebuilt = rebuildAirCurtainSelection(promotedUnits, {
    doorWidthMm: criteria.doorWidthMm,
    doorHeightM: criteria.doorHeightM,
    category: selection.model.category,
    speed: 'high',
    minNozzleVelocity: 0,
    minAirflowCmh: 0,
    motorType: selection.model.motorType,
    brand: selection.model.brand,
    seriesId: selection.model.seriesId ?? 'any',
    allowCombinations: true,
    minFloorVelocity: criteria.minFloorVelocity,
    supplyFrequencyHz: 50,
    minMatchPercent: AC_MIN_MATCH_PERCENT,
    maxMatchPercent: AC_MAX_MATCH_PERCENT,
    selectionBasis: 'door',
  });
  return rebuilt ?? selection;
}

function normalizeAirCurtainModelToken(value: string): string | null {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.match(/FM(?:12|35|45|55)(?:09|10|12|15|18|20)(?:XD)?/)?.[0] ?? null;
}

/**
 * Extract only models the customer explicitly marks unavailable. Replacement
 * models mentioned after "with/to" are not treated as unavailable.
 */
function explicitlyUnavailableAirCurtainModels(userText: string): Set<string> {
  const unavailable = new Set<string>();
  const modelPattern = /FM[\s-]?(?:12|35|45|55)[\s-]?(?:09|10|12|15|18|20)(?:\s*XD)?/gi;
  for (const match of userText.matchAll(modelPattern)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const before = userText.slice(Math.max(0, index - 45), index);
    const after = userText.slice(index + raw.length, index + raw.length + 45);
    const unavailableAfter =
      /^[^.;,]{0,20}\b(?:is|if|as)?\s*(?:(?:not|out\s+of)\s+stock|unavailable)\b/i.test(after);
    const unavailableBefore =
      /\b(?:do(?:n't|\s+not)\s+have(?:\s+in)?\s+stock|no\s+stock\s+(?:for|of)?|out\s+of\s+stock|unavailable)\s*[:=-]?\s*$/i.test(before);
    if (unavailableAfter || unavailableBefore) {
      const token = normalizeAirCurtainModelToken(raw);
      if (token) unavailable.add(token);
    }
  }
  return unavailable;
}

function hasExplicitUnavailableAirCurtainModelRequest(userText: string): boolean {
  return explicitlyUnavailableAirCurtainModels(userText).size > 0;
}

/**
 * Replace each explicitly unavailable selected model with the next longer
 * available catalogue model in the same series and mounting-height class.
 */
function promoteExplicitlyUnavailableSelectedModels(
  selection: AirCurtainSelection,
  models: AirCurtainModel[],
  criteria: {
    doorWidthMm: number;
    doorHeightM: number;
    minFloorVelocity: number;
  },
  userText: string,
): AirCurtainSelection {
  const unavailable = explicitlyUnavailableAirCurtainModels(userText);
  if (!unavailable.size) return selection;

  let changed = false;
  const replacementUnits = selection.units.map((unit) => {
    const selectedToken = normalizeAirCurtainModelToken(String(unit.model.model));
    if (!selectedToken || !unavailable.has(selectedToken)) return unit;

    const sameHeightClass = (model: AirCurtainModel) =>
      Math.abs((model.mountingHeightMin ?? 0) - (unit.model.mountingHeightMin ?? 0)) < 0.001 &&
      Math.abs((model.mountingHeightMax ?? 0) - (unit.model.mountingHeightMax ?? 0)) < 0.001;
    const replacement = models
      .filter(
        (model) =>
          model.seriesId === unit.model.seriesId &&
          model.motorType === unit.model.motorType &&
          sameHeightClass(model) &&
          model.lengthMm > unit.model.lengthMm &&
          !unavailable.has(normalizeAirCurtainModelToken(String(model.model)) ?? ''),
      )
      .sort((a, b) => a.lengthMm - b.lengthMm)[0];

    if (!replacement) return unit;
    changed = true;
    return { model: replacement, qty: unit.qty };
  });

  if (!changed) return selection;
  const finalLength = replacementUnits.reduce(
    (total, unit) => total + unit.model.lengthMm * unit.qty,
    0,
  );
  if (criteria.doorWidthMm > 0 && (finalLength / criteria.doorWidthMm) * 100 > AC_MAX_MATCH_PERCENT) {
    return selection;
  }

  const rebuilt = rebuildAirCurtainSelection(replacementUnits, {
    doorWidthMm: criteria.doorWidthMm,
    doorHeightM: criteria.doorHeightM,
    category: selection.model.category,
    speed: 'high',
    minNozzleVelocity: 0,
    minAirflowCmh: 0,
    motorType: selection.model.motorType,
    brand: selection.model.brand,
    seriesId: selection.model.seriesId ?? 'any',
    allowCombinations: true,
    minFloorVelocity: criteria.minFloorVelocity,
    supplyFrequencyHz: 50,
    minMatchPercent: AC_MIN_MATCH_PERCENT,
    maxMatchPercent: AC_MAX_MATCH_PERCENT,
    selectionBasis: 'door',
  });
  return rebuilt ?? selection;
}

function applyRequestedAirCurtainPromotions(
  selection: AirCurtainSelection,
  models: AirCurtainModel[],
  seriesRecords: Array<{ id: string; name: string }>,
  criteria: {
    doorWidthMm: number;
    doorHeightM: number;
    minFloorVelocity: number;
  },
  userText: string,
): AirCurtainSelection {
  const afterFm35 = isFm35ToFm45PromotionRequest(userText)
    ? promoteSelectedFm35ToFm45(selection, models, seriesRecords, criteria)
    : selection;
  return promoteExplicitlyUnavailableSelectedModels(
    afterFm35,
    models,
    criteria,
    userText,
  );
}

function seriesFromExistingAirCurtainSelection(
  existingSelection: string | null | undefined,
  seriesRecords: Array<{ id: string; name: string; category: AirCurtainCategory }>,
) {
  const value = String(existingSelection ?? '');
  if (/FM-?(?:35|45|55)(?:09|10|12|15|18|20)XD/i.test(value)) {
    return seriesRecords.find((series) => /^XD-Centrifugal Flow$/i.test(series.name));
  }
  if (/FM-?12(?:09|10|12|15|18|20)N/i.test(value)) {
    return seriesRecords.find((series) => /^N-Cross Flow$/i.test(series.name));
  }
  if (/FM-?(?:35|45|55)(?:09|10|12|15|18|20)-L/i.test(value)) {
    return seriesRecords.find((series) => /^N-Centrifugal flow$/i.test(series.name));
  }
  return undefined;
}
import {
  spreadsheetToText,
  isSpreadsheet,
  isReadableAttachment,
  fileToDataUrl,
  imageFileToDataUrl,
  toBase64Payload,
  isPdf,
  pdfToText,
  pdfToImages,
} from '@/lib/chatSchedule';

export const DEFAULT_SUGGESTIONS = [
  'Car park exhaust fan, 25,000 m³/h at 300 Pa — send me the datasheet',
  'Air curtain for a 2 m wide, 3 m high shop entrance — send the datasheet',
  'Which fan series do you have and what sizes?',
  'Kitchen extract fan, 4,000 m³/h at 250 Pa — quietest option',
];

export const FAN_SUGGESTIONS = [
  '50 lps @ 100 Pa KVF-P — send datasheet',
  '50 lps @ 100 Pa KVF-M — send datasheet',
  '25 lps @ 3 Pa KIN-E — best model',
  '5000 lps @ 250 Pa KTAF — send datasheet',
  'Give me a lower power option with better efficiency',
];

export const AIR_CURTAIN_SUGGESTIONS = [
  '1 m door width and 3 m door height wall mounted — send datasheet',
  '2 m door width and 3 m door height recessed mounted — send datasheet',
  '3 m door width and 4 m door height wall mounted — send datasheet',
  'Give me a lower power consumption EC motor option',
  'Send only the noise data for that air curtain',
];

export type AssistantContext = 'general' | 'fan' | 'air_curtain';

type RegisteredAiModel = {
  provider: 'google' | 'openai' | 'anthropic';
  model_id: string;
  display_name: string;
  tier: 'free' | 'cheap' | 'balanced' | 'premium';
  cost_rank: number;
};

type AiMode =
  | 'auto'
  | 'standard'
  | 'gemini'
  | 'openai'
  | 'openai_luna'
  | 'openai_terra'
  | 'openai_sol'
  | 'anthropic'
  | 'anthropic_haiku'
  | 'anthropic_sonnet'
  | 'anthropic_opus';


/**
 * AI SDK tool parts arrive incrementally. Never run a selector from an
 * input-streaming part, otherwise the first partial schedule row gets marked
 * handled before the remaining rows and fields arrive.
 */
function hasCompleteToolInput(part: any): boolean {
  const state = part?.state;
  return (
    !state ||
    state === 'input-available' ||
    state === 'output-available' ||
    state === 'output-error'
  );
}

type DocOutput = 'full' | 'drawing' | 'noise';

type FanInstallType = 'inline_ducted' | 'wall_mounted' | 'axial';

type DutyRequest = {
  airflow: number;
  airflow_unit: keyof typeof AIRFLOW_UNITS;
  static_pressure: number;
  pressure_unit: keyof typeof PRESSURE_UNITS;
  series_name?: string | null;
  material?: string | null;
  fan_type?: FanInstallType | null;
  motor_poles?: number | null;
  motor_brand?: string | null;
  motor_efficiency_class?: 'None' | 'IE1' | 'IE2' | 'IE3' | 'IE4' | null;
  frequency_hz?: 50 | 60 | null;
  fire_class?: '' | 'ClassB' | 'ClassH' | 'F250' | 'F300' | 'F400' | null;
  accessory?: '' | 'ET' | 'ID' | 'ETID' | null;
  atex_rating?: '' | 'II2GExdIIB(H2)T4' | 'II2GExdIIBT4' | 'II2GExeIIT3' | 'II3DExtcIIIBT125' | 'II3DExtcIIICT125' | null;
  safety_factor?: number | null;
  tolerance_min?: number | null;
  tolerance_max?: number | null;
  temperature_c?: number | null;
  air_density_kg_m3?: number | null;
  altitude_m?: number | null;
  fan_size_mm?: number | null;
  max_fan_size_mm?: number | null;
  application?: string | null;
  output?: DocOutput;
  optimize_for?: FanOptimizeFor;
};

/**
 * Clear single fan duties do not need an LLM to identify two numbers and a
 * catalogue series. Route them straight to the same selector engine used by
 * the manual page. Gemini remains available for conversation, estimates,
 * attachments and schedules.
 */
function parseManualFanParameters(userText: string): Partial<DutyRequest> {
  const motorBrand = userText.match(
    /(?:motor\s*(?:make|brand|manufacturer)|make)\s*(?:(?:is|of|to)\s+|[=:]\s*)?([A-Za-z][A-Za-z0-9 .&-]{1,30})/i,
  )?.[1]?.split(/\b(?:with|and|at|for)\b/i)[0]?.trim().replace(/[,.]$/, '') ?? null;
  const ieClass = userText.match(/\bIE\s*([1-4])\b/i)?.[1];
  const frequency = Number(userText.match(/\b(50|60)\s*Hz\b/i)?.[1]);
  const fireToken = userText.match(/\b(F\s*(?:250|300|400)|Class\s*[BH])\b/i)?.[1]
    ?.toUpperCase()
    .replace(/\s/g, '');
  const fireClass: DutyRequest['fire_class'] =
    fireToken === 'CLASSB' ? 'ClassB' :
    fireToken === 'CLASSH' ? 'ClassH' :
    fireToken === 'F250' || fireToken === 'F300' || fireToken === 'F400' ? fireToken :
    null;
  const hasTerminalBox = /\b(?:external\s*terminal\s*box|terminal\s*box|\bET\b)\b/i.test(userText);
  const hasInspectionDoor = /\b(?:inspection\s*door|access\s*door|\bID\b)\b/i.test(userText);
  const accessory: DutyRequest['accessory'] =
    hasTerminalBox && hasInspectionDoor ? 'ETID' :
    hasTerminalBox ? 'ET' :
    hasInspectionDoor ? 'ID' :
    null;
  const normalizedAtex = userText.toUpperCase().replace(/[\s-]/g, '');
  const atexRating: DutyRequest['atex_rating'] =
    normalizedAtex.includes('II2GEXDIIB(H2)T4') ? 'II2GExdIIB(H2)T4' :
    normalizedAtex.includes('II2GEXDIIBT4') ? 'II2GExdIIBT4' :
    normalizedAtex.includes('II2GEXEIIT3') ? 'II2GExeIIT3' :
    normalizedAtex.includes('II3DEXTCIIIBT125') ? 'II3DExtcIIIBT125' :
    normalizedAtex.includes('II3DEXTCIIICT125') ? 'II3DExtcIIICT125' :
    null;
  const safetyRaw = Number(
    userText.match(/(?:motor\s*)?safety\s*factor\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*(%)?/i)?.[1],
  );
  const safetyPercent = /(?:motor\s*)?safety\s*factor[^%]{0,20}%/i.test(userText);
  const tolerance = userText.match(
    /(?:selection\s*)?tolerance\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:%\s*)?(?:to|-|–|—)\s*(\d+(?:\.\d+)?)\s*%?/i,
  );
  const temperature = Number(
    userText.match(/(?:air\s*)?temperature\s*(?:of|=|:)?\s*(-?\d+(?:\.\d+)?)\s*°?\s*C\b/i)?.[1],
  );
  const density = Number(
    userText.match(/air\s*density\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*kg\s*\/\s*m(?:³|3)\b/i)?.[1],
  );
  const altitude = Number(
    userText.match(/(?:altitude|elevation)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*m\b/i)?.[1],
  );

  return {
    motor_poles: Number(userText.match(/\b([2468]|12)\s*(?:pole|p)\b/i)?.[1]) || null,
    motor_brand: motorBrand,
    motor_efficiency_class: ieClass ? (`IE${ieClass}` as DutyRequest['motor_efficiency_class']) : null,
    frequency_hz: frequency === 50 || frequency === 60 ? frequency as 50 | 60 : null,
    fire_class: fireClass,
    accessory,
    atex_rating: atexRating,
    safety_factor: safetyRaw > 0 ? (safetyPercent ? 1 + safetyRaw / 100 : safetyRaw) : null,
    tolerance_min: tolerance ? Number(tolerance[1]) : null,
    tolerance_max: tolerance ? Number(tolerance[2]) : null,
    temperature_c: Number.isFinite(temperature) && temperature !== 0 ? temperature : null,
    air_density_kg_m3: density > 0 ? density : null,
    altitude_m: altitude > 0 ? altitude : null,
  };
}

function parseDirectFanDuty(userText: string): DutyRequest | null {
  if (/\b(?:air\s*curtain|door|entrance|opening)\b/i.test(userText)) return null;

  const airflowPattern =
    /(\d+(?:\.\d+)?)\s*(m(?:³|3)?\s*\/(?:\s*h|\s*hr)|m(?:³|3)?\s*(?:per\s*hour|ph)|cmh|l(?:itre|iter)?s?\s*(?:\/\s*s|per\s*second)|lps|cfm|cubic\s*feet\s*per\s*minute|m(?:³|3)?\s*\/\s*s|cms)\b/gi;
  const airflowMatches = [...userText.matchAll(airflowPattern)];
  if (airflowMatches.length !== 1) return null;

  const pressurePattern =
    /(?:(?:@|\bat\b|static\s*pressure|external\s*static\s*pressure|esp|pressure)\s*)?(\d+(?:\.\d+)?)\s*(pa|pascals?|in(?:\.|\s*)w(?:\.|\s*)g|inwg|inch(?:es)?\s*(?:of\s*)?(?:water|wg)|mm(?:\.|\s*)w(?:\.|\s*)g|mmwg|mm\s*(?:of\s*)?water)\b/i;
  const pressureMatch = userText.match(pressurePattern);

  const airflowToken = airflowMatches[0][2].toLowerCase().replace(/\s/g, '');
  const pressureToken = pressureMatch?.[2]?.toLowerCase().replace(/[.\s]/g, '') ?? 'pa';
  const airflowUnit: keyof typeof AIRFLOW_UNITS =
    airflowToken === 'cfm' || airflowToken.includes('cubicfeetperminute')
      ? 'CFM'
      : airflowToken === 'cms' || /m(?:³|3)\/s/.test(airflowToken)
        ? 'CMS'
        : airflowToken === 'lps' || /l\/s/.test(airflowToken)
          ? 'LPS'
          : 'CMH';
  const pressureUnit: keyof typeof PRESSURE_UNITS =
    pressureToken.startsWith('in') ? 'inwg' : pressureToken.startsWith('mm') ? 'mmwg' : 'Pa';

  const seriesMatch = userText.match(/\b(KVF[\s-]?[PM]|KIN[\s-]?E|KTAF)\b/i);
  const seriesName = seriesMatch
    ? seriesMatch[1].toUpperCase().replace(/\s/g, '').replace(/^KVF([PM])$/, 'KVF-$1').replace(/^KIN-?E$/, 'KIN-E')
    : null;
  const mentionsPlastic = /\b(plastic|pvc|u-pvc|upvc|abs|polypropylene|polymer|pp)\b/i.test(userText);
  const mentionsMetal = /\b(metal|metallic|steel|stainless\s*steel|ss\s*304|ss\s*316|galvanized|galvanised|gi|aluminium|aluminum)\b/i.test(userText);
  const fanType: FanInstallType | null =
    /\b(ktaf|tube axial|axial fan|axial flow)\b/i.test(userText)
      ? 'axial'
      : /\b(kin[\s-]?e|wall[ -]?mounted|wall extract|wall fan)\b/i.test(userText)
        ? 'wall_mounted'
        : /\b(kvf[\s-]?[pm]|inline|ducted)\b/i.test(userText)
          ? 'inline_ducted'
          : null;

  const output: DocOutput =
    /\b(?:drawing|dimension)\b/i.test(userText)
      ? 'drawing'
      : /\b(?:noise|sound)\b/i.test(userText)
        ? 'noise'
        : 'full';
  const optimizeFor: FanOptimizeFor =
    /\b(?:quiet|quieter|quietest|silent|low(?:est)?\s*(?:noise|sound)|acoustic|dba\s*limit)\b/i.test(userText)
      ? 'low_noise'
      : /\b(?:efficient|efficiency|highest\s*efficiency|best\s*efficiency|energy\s*efficient|minimum\s*sfp|lowest\s*sfp)\b/i.test(userText)
        ? 'high_efficiency'
        : /\b(?:low(?:er|est)?\s*(?:power|kw|watts?|bhp|consumption)|minimum\s*(?:power|kw|watts?|bhp)|energy saving)\b/i.test(userText)
          ? 'low_power'
          : /\b(?:compact|smallest|lowest\s*size|minimum\s*size|smallest\s*(?:casing|diameter|footprint)|space\s*constraint|limited\s*space)\b/i.test(userText)
            ? 'smallest_size'
            : /\b(?:more|max(?:imum)?)\s*airflow\b/i.test(userText)
              ? 'max_airflow'
              : /\b(?:more|max(?:imum)?)\s*(?:pressure|static)\b/i.test(userText)
                ? 'max_pressure'
                : 'balanced';

  if (!pressureMatch && !fanType && !seriesName) return null;
  const airflowValue = Number(airflowMatches[0][1]);
  const airflowLps =
    airflowUnit === 'LPS'
      ? airflowValue
      : airflowUnit === 'CMH'
        ? airflowValue / 3.6
        : airflowUnit === 'CFM'
          ? (airflowValue * 1.6990107955) / 3.6
          : airflowValue * 1000;
  const defaultPressure =
    fanType === 'wall_mounted' || seriesName === 'KIN-E'
      ? (airflowLps <= 25 ? 3 : 10)
      : 75;
  const exactSizeMatch =
    userText.match(/(?:fan|duct|spigot|connection|diameter|dia\.?|size|ø)\s*(?:of|=|:)?\s*(\d{2,4})\s*mm\b/i) ??
    userText.match(/\b(\d{2,4})\s*mm\s*(?:dia(?:meter)?|fan|duct|spigot|connection|size)\b/i);
  const maxSizeMatch = userText.match(
    /(?:maximum|max|not\s*more\s*than|up\s*to)\s*(?:fan|duct|spigot|connection|diameter|dia\.?|size)?\s*(\d{2,4})\s*mm\b/i,
  );
  const application =
    /\b(?:toilet|washroom|bathroom|wc|restroom)\b/i.test(userText) ? 'toilet_exhaust' :
    /\b(?:kitchen|hood|grease)\b/i.test(userText) ? 'kitchen_extract' :
    /\b(?:car\s*park|parking|basement)\b/i.test(userText) ? 'car_park_ventilation' :
    /\b(?:staircase|stairwell|pressurization|pressurisation)\b/i.test(userText) ? 'staircase_pressurization' :
    /\b(?:fresh\s*air|supply\s*air|make[- ]?up\s*air)\b/i.test(userText) ? 'fresh_air_supply' :
    /\b(?:smoke\s*extract|smoke\s*exhaust|fire\s*rated)\b/i.test(userText) ? 'smoke_extract' :
    /\b(?:laboratory|lab\s*exhaust|chemical|corrosive|fume)\b/i.test(userText) ? 'corrosive_exhaust' :
    /\b(?:general\s*exhaust|extract|exhaust)\b/i.test(userText) ? 'general_exhaust' :
    null;

  return {
    airflow: airflowValue,
    airflow_unit: airflowUnit,
    static_pressure: pressureMatch ? Number(pressureMatch[1]) : defaultPressure,
    pressure_unit: pressureMatch ? pressureUnit : 'Pa',
    series_name: seriesName,
    material: mentionsPlastic ? 'plastic' : mentionsMetal ? 'metal' : null,
    fan_type: fanType,
    ...parseManualFanParameters(userText),
    fan_size_mm: exactSizeMatch ? Number(exactSizeMatch[1]) : null,
    max_fan_size_mm: maxSizeMatch ? Number(maxSizeMatch[1]) : null,
    application,
    output,
    optimize_for: optimizeFor,
  };
}

/**
 * Resolves the fan series to select from.
 *
 * Installation type is the hardest rule: KVF-P / KVF-M are INLINE DUCTED series,
 * KIN-E is the WALL MOUNTED series. So a wall mounted request never selects a
 * KVF model and an inline ducted request never selects KIN-E, whatever series
 * name the AI happened to suggest. After that, an explicit series name wins,
 * then the casing material (plastic / PVC / PP / polypropylene vs metal).
 */
function resolveFanSeries(
  database: any,
  seriesName?: string | null,
  material?: string | null,
  installType?: FanInstallType | null,
) {
  const list: any[] = database?.series ?? [];
  const nameOf = (s: any) => String(s?.name ?? '').trim();
  const byName = (n: string) => list.find((s) => nameOf(s).toLowerCase() === n);
  const text = (s: any) => `${s?.name ?? ''} ${s?.description ?? ''}`.toLowerCase();
  const isWallSeries = (s: any) =>
    /kin-e/i.test(nameOf(s)) || /wall\s*mount/i.test(text(s));
  const isInlineSeries = (s: any) => !isWallSeries(s);

  // 1) Installation type overrides everything.
  if (installType === 'wall_mounted') {
    return byName('kin-e') || list.find(isWallSeries);
  }
  if (installType === 'axial') {
    return byName('ktaf') || list.find((s) => /axial/i.test(text(s)));
  }

  const wanted = (seriesName || '').trim().toLowerCase();
  if (wanted) {
    const match =
      list.find((s) => nameOf(s).toLowerCase() === wanted) ||
      list.find((s) => nameOf(s).toLowerCase().includes(wanted));
    // An inline ducted request must never come back with the wall mounted series.
    if (
      match &&
      installType === 'inline_ducted' &&
      (isWallSeries(match) || /ktaf/i.test(nameOf(match)))
    ) {
      return byName('kvf-p') || byName('kvf-m') || list.find(isInlineSeries);
    }
    if (match) return match;
  }

  const mat = (material || '').trim().toLowerCase();
  if (!mat) return undefined;
  const isPlastic = /plastic|pvc|abs|pp\b|polypropylene|polymer/.test(mat);
  const isMetal = /metal|steel|galv|gi\b|aluminium|aluminum/.test(mat);

  // Plastic (PVC / PP / polypropylene) always means the KVF-P series for
  // inline ducted fans; KIN-E is the plastic wall mounted series. Never fall
  // through to a metal (-M) series for a plastic request.
  if (isPlastic) {
    const direct = list.find(
      (s) => text(s).includes(mat) && /(^|[\s-])p$/i.test(nameOf(s)) && isInlineSeries(s),
    );
    return (
      direct ||
      byName('kvf-p') ||
      list.find((s) => /(^|[\s-])p$/i.test(nameOf(s)) && isInlineSeries(s))
    );
  }
  const direct = list.find((s) => text(s).includes(mat) && isInlineSeries(s));
  if (direct) return direct;
  if (isMetal) return list.find((s) => /(^|[\s-])m$/i.test(nameOf(s)) && isInlineSeries(s));
  return undefined;
}



type AutoSelection = {
  duty: DutyRequest;
  results: FanSelection[];
};

type AcLengthUnit = 'mm' | 'cm' | 'm' | 'in';
const AC_LENGTH_TO_MM: Record<AcLengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };
const AC_AIRFLOW_TO_CMH: Record<string, number> = { CMH: 1, LPS: 3.6, CFM: 1.6990107955 };

type AcDutyRequest = {
  door_width?: number | null;
  door_width_unit?: AcLengthUnit;
  door_height?: number | null;
  door_height_unit?: AcLengthUnit;
  mounting?: AirCurtainCategory | 'any';
  speed?: AirCurtainSpeed;
  motor_type?: AirCurtainMotorType | 'any';
  brand?: string | null;
  series_name?: string | null;
  min_airflow?: number | null;
  min_airflow_unit?: string;
  min_nozzle_velocity?: number | null;
  min_floor_velocity?: number | null;
  allow_combinations?: boolean | null;
  supply_frequency_hz?: 50 | 60 | null;
  min_match_percent?: number | null;
  max_match_percent?: number | null;
  selection_basis?: 'door' | 'airflow';
  noise_mode?: 'dba' | 'octave';
  output?: DocOutput;
  optimize_for?: AcOptimizeFor;
};

function parseManualAirCurtainParameters(userText: string): Partial<AcDutyRequest> {
  const parsed: Partial<AcDutyRequest> = {};

  if (/\b(?:low|slow)\s*speed\b/i.test(userText)) parsed.speed = 'low';
  else if (/\bmedium\s*speed\b/i.test(userText)) parsed.speed = 'medium';
  else if (/\b(?:high|full|max(?:imum)?)\s*speed\b/i.test(userText)) parsed.speed = 'high';

  const nozzleVelocity = userText.match(
    /\b(?:minimum|min\.?\s*)?(?:nozzle|outlet|discharge)\s*(?:air\s*)?velocity\s*(?:of|=|:|at least|minimum|min\.?)?\s*(\d+(?:\.\d+)?)\s*m\/?s\b/i,
  );
  if (nozzleVelocity) parsed.min_nozzle_velocity = Number(nozzleVelocity[1]);

  const floorVelocity = userText.match(
    /\b(?:minimum|min\.?\s*)?(?:floor|terminal)\s*(?:air\s*)?velocity\s*(?:of|=|:|at least|minimum|min\.?)?\s*(\d+(?:\.\d+)?)\s*m\/?s\b/i,
  );
  if (floorVelocity) parsed.min_floor_velocity = Number(floorVelocity[1]);

  const airflow = userText.match(
    /\b(?:minimum|min\.?|required)?\s*(?:airflow|air\s*flow|air\s*volume|capacity)\s*(?:of|=|:|at least|minimum|min\.?)?\s*(\d+(?:\.\d+)?)\s*(m(?:³|3)\/?h|cmh|cfm|l\/?s|lps)\b/i,
  );
  if (airflow) {
    parsed.min_airflow = Number(airflow[1]);
    const unit = airflow[2].toLowerCase();
    parsed.min_airflow_unit = unit === 'cfm' ? 'CFM' : /l\/?s|lps/.test(unit) ? 'LPS' : 'CMH';
  }

  if (/\b(?:select(?:ion)?|size|basis|based)\s*(?:only\s*)?(?:by|on|from)?\s*(?:airflow|air\s*volume|capacity)\b/i.test(userText)) {
    parsed.selection_basis = 'airflow';
  } else if (/\b(?:select(?:ion)?|size|basis|based)\s*(?:only\s*)?(?:by|on|from)?\s*(?:door|opening)(?:\s*width)?\b/i.test(userText)) {
    parsed.selection_basis = 'door';
  }

  if (/\b(?:no|without|disable)\s*(?:model|unit|length)?\s*(?:mix(?:ing)?|combinations?)\b|\bsingle\s*unit\s*only\b/i.test(userText)) {
    parsed.allow_combinations = false;
  } else if (/\b(?:allow|enable|use)\s*(?:model|unit|length)?\s*(?:mix(?:ing)?|combinations?)\b|\bmixed\s*(?:model|unit|length)s?\b/i.test(userText)) {
    parsed.allow_combinations = true;
  }

  const frequency = userText.match(/\b(50|60)\s*Hz\b/i);
  if (frequency) parsed.supply_frequency_hz = Number(frequency[1]) as 50 | 60;

  const matchRange = userText.match(
    /\b(?:length\s*)?match(?:ing)?\s*(?:range)?\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*%?\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*%/i,
  );
  if (matchRange) {
    parsed.min_match_percent = Number(matchRange[1]);
    parsed.max_match_percent = Number(matchRange[2]);
  } else {
    const minMatch = userText.match(/\b(?:minimum|min\.?)\s*(?:length\s*)?match(?:ing)?\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i);
    const maxMatch = userText.match(/\b(?:maximum|max\.?)\s*(?:length\s*)?match(?:ing)?\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (minMatch) parsed.min_match_percent = Number(minMatch[1]);
    if (maxMatch) parsed.max_match_percent = Number(maxMatch[1]);
  }

  parsed.noise_mode = /\boctave(?:\s*band)?\b/i.test(userText)
    ? 'octave'
    : /\b(?:overall\s*)?dB\(?A\)?\b/i.test(userText)
      ? 'dba'
      : undefined;

  const brand = userText.match(
    /\bbrand\s*(?:is|=|:)?\s*([A-Za-z0-9][A-Za-z0-9&.+ -]{0,30}?)(?=\s*(?:,|;|\b(?:series|motor|speed|at|for|with|door|opening|50\s*Hz|60\s*Hz)\b|$))/i,
  );
  if (brand?.[1]) parsed.brand = brand[1].trim();

  return parsed;
}


/**
 * Parse a clear single air-curtain duty locally. This is KINAIR's provider-free
 * fast path: it emits the same tool part consumed by the manual selector engine.
 */
function parseDirectAirCurtainDuty(userText: string): AcDutyRequest | null {
  if (!/\b(?:air\s*curtain|door|entrance|opening)\b/i.test(userText)) return null;
  if (/\b(?:schedule|spreadsheet|excel|xlsx|xls|csv|pdf|image|photo|attachment|multiple|several)\b/i.test(userText)) return null;

  const unit = String.raw`(mm|cm|m|in(?:ch(?:es)?)?)`;
  const widthMatch = userText.match(
    new RegExp(String.raw`(?:door|opening)?\s*width\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*${unit}\b`, 'i'),
  ) ?? userText.match(
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${unit}\s*(?:door|opening)?\s*wide\b`, 'i'),
  ) ?? userText.match(
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${unit}\s*(?:door|opening)\s*width\b`, 'i'),
  );
  const heightMatch = userText.match(
    new RegExp(String.raw`(?:door|opening)?\s*height\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*${unit}\b`, 'i'),
  ) ?? userText.match(
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${unit}\s*(?:door|opening)?\s*high\b`, 'i'),
  ) ?? userText.match(
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${unit}\s*(?:door|opening)\s*height\b`, 'i'),
  );
  const dimensionsMatch = userText.match(
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${unit}\s*[x×]\s*(\d+(?:\.\d+)?)\s*${unit}`, 'i'),
  );
  const normalizeUnit = (value?: string): AcLengthUnit => {
    const normalized = String(value ?? 'm').toLowerCase();
    return normalized.startsWith('in') ? 'in' : normalized as AcLengthUnit;
  };

  const manualParameters = parseManualAirCurtainParameters(userText);
  const doorWidth = widthMatch
    ? Number(widthMatch[1])
    : dimensionsMatch
      ? Number(dimensionsMatch[1])
      : manualParameters.selection_basis === 'airflow'
        ? 0
        : 1;
  const doorWidthUnit = widthMatch
    ? normalizeUnit(widthMatch[2])
    : dimensionsMatch
      ? normalizeUnit(dimensionsMatch[2])
      : 'm';
  const doorHeight = heightMatch ? Number(heightMatch[1]) : dimensionsMatch ? Number(dimensionsMatch[3]) : null;
  const doorHeightUnit = heightMatch
    ? normalizeUnit(heightMatch[2])
    : dimensionsMatch
      ? normalizeUnit(dimensionsMatch[4])
      : 'm';
  if (
    !doorHeight ||
    doorHeight <= 0 ||
    (manualParameters.selection_basis !== 'airflow' && doorWidth <= 0)
  ) return null;

  const mounting: AirCurtainCategory | 'any' =
    /\b(?:ceiling|recess(?:ed)?|concealed|flush[ -]?mount(?:ed)?)\b/i.test(userText)
      ? 'recessed'
      : /\b(?:wall[ -]?mount(?:ed)?|surface[ -]?mount(?:ed)?|exposed)\b/i.test(userText)
        ? 'surface'
        : 'any';
  const output: DocOutput =
    /\b(?:drawing|dimension)\b/i.test(userText)
      ? 'drawing'
      : /\b(?:noise|sound)\b/i.test(userText)
        ? 'noise'
        : 'full';
  const optimizeFor: AcOptimizeFor =
    /\b(?:quiet|quieter|quietest|silent|low(?:est)?\s*(?:noise|sound)|acoustic|dba\s*limit)\b/i.test(userText)
      ? 'low_noise'
      : /\b(?:low(?:er|est)?\s*(?:power|watts?)|energy saving|consumption)\b/i.test(userText)
        ? 'low_power'
        : /\b(?:stronger|throw|floor velocity|tall door)\b/i.test(userText)
          ? 'max_velocity'
          : /\b(?:single unit|minimum quantity|fewest units)\b/i.test(userText)
            ? 'fewest_units'
            : /\b(?:more|max(?:imum)?)\s*(?:air|airflow)\b/i.test(userText)
              ? 'max_airflow'
              : 'balanced';

  const seriesName =
    /\b(?:XD[ -]?Centrifugal|FM[ -]?(?:35|45|55)(?:09|10|12|15|18|20)XD)\b/i.test(userText)
      ? 'XD-Centrifugal Flow'
      : /\b(?:N[ -]?Cross|FM[ -]?12(?:09|10|12|15|18|20)N)\b/i.test(userText)
        ? 'N-Cross Flow'
        : /\b(?:N[ -]?Centrifugal|FM[ -]?(?:35|45|55)(?:09|10|12|15|18|20)-L)\b/i.test(userText)
          ? 'N-Centrifugal flow'
          : null;

  return {
    door_width: doorWidth,
    door_width_unit: doorWidthUnit,
    door_height: doorHeight,
    door_height_unit: doorHeightUnit,
    ...manualParameters,
    mounting,
    speed: manualParameters.speed ?? 'high',
    motor_type: /\bEC\b/i.test(userText) ? 'EC' : /\bAC\b/i.test(userText) ? 'AC' : 'any',
    series_name: seriesName,
    output,
    optimize_for: optimizeFor,
  };
}

type AcAutoSelection = {
  doorWidthMm: number;
  doorHeightM: number;
  minFloorVelocity: number;
  optimizeFor: AcOptimizeFor;
  noiseMode: 'dba' | 'octave';
  airflowUnit: 'cmh' | 'cfm' | 'ls';
  widthUnit: AcLengthUnit;
  heightUnit: AcLengthUnit;
  results: AirCurtainSelection[];
};

type ScheduleItem = {
  tag?: string | null;
  product: 'fan' | 'air_curtain';
  quantity?: number | null;
  airflow?: number | null;
  airflow_unit?: keyof typeof AIRFLOW_UNITS;
  static_pressure?: number | null;
  pressure_unit?: keyof typeof PRESSURE_UNITS;
  series_name?: string | null;
  material?: string | null;
  fan_type?: FanInstallType | null;
  fan_size_mm?: number | null;
  max_fan_size_mm?: number | null;
  application?: string | null;

  motor_poles?: number | null;
  motor_brand?: string | null;
  motor_efficiency_class?: 'None' | 'IE1' | 'IE2' | 'IE3' | 'IE4' | null;
  frequency_hz?: 50 | 60 | null;
  fire_class?: DutyRequest['fire_class'];
  accessory?: DutyRequest['accessory'];
  atex_rating?: DutyRequest['atex_rating'];
  safety_factor?: number | null;
  tolerance_min?: number | null;
  tolerance_max?: number | null;
  temperature_c?: number | null;
  air_density_kg_m3?: number | null;
  altitude_m?: number | null;
  max_noise_db?: number | null;
  door_width?: number | null;
  door_width_unit?: AcLengthUnit;
  door_height?: number | null;
  door_height_unit?: AcLengthUnit;
  mounting?: AirCurtainCategory | 'any';
  speed?: AirCurtainSpeed;
  motor_type?: AirCurtainMotorType | 'any';
  brand?: string | null;
  min_airflow?: number | null;
  min_airflow_unit?: string;
  min_nozzle_velocity?: number | null;
  min_floor_velocity?: number | null;
  allow_combinations?: boolean | null;
  supply_frequency_hz?: 50 | 60 | null;
  min_match_percent?: number | null;
  max_match_percent?: number | null;
  selection_basis?: 'door' | 'airflow';
  noise_mode?: 'dba' | 'octave';
  optimize_for?: AcOptimizeFor;
  /** Exact model/arrangement already shown in an uploaded schedule; never inferred. */
  existing_selection?: string | null;
};

type ScheduleSelection =
  | { kind: 'fan'; selection: FanSelection; airflowUnit?: string; pressureUnit?: string }
  | {
      kind: 'air_curtain';
      selection: AirCurtainSelection;
      doorWidthMm: number;
      doorHeightM: number;
      minFloorVelocity: number;
    };

type ScheduleRow = {
  tag: string;
  quantity: number;
  product: 'fan' | 'air_curtain';
  duty: string;
  label: string;
  detail: string;
  selection?: ScheduleSelection;
};

type ScheduleResult = { title: string; rows: ScheduleRow[] };



type InstantFollowUp =
  | { product: 'fan'; input: DutyRequest }
  | { product: 'air_curtain'; input: AcDutyRequest };

function findLatestInstantDuty(messages: any[]): InstantFollowUp | null {
  for (const message of [...messages].reverse()) {
    if (message?.role !== 'assistant') continue;
    for (const part of [...(message.parts ?? [])].reverse()) {
      if (part?.type === 'tool-prepare_datasheet' && part?.input) {
        return { product: 'fan', input: part.input as DutyRequest };
      }
      if (part?.type === 'tool-prepare_air_curtain_datasheet' && part?.input) {
        return { product: 'air_curtain', input: part.input as AcDutyRequest };
      }
    }
  }
  return null;
}

function parseInstantFollowUp(userText: string, messages: any[]): InstantFollowUp | null {
  const isAction =
    /\b(?:another|alternative|option|change|switch|revise|promote|upgrade|replace|quieter|quietest|silent|efficient|efficiency|lower|lowest|compact|smallest|more airflow|more pressure|stronger|throw|drawing|dimension|noise data|sound data|datasheet|data sheet|EC motor|AC motor|wall mounted|surface mounted|recessed|ceiling|concealed|not in stock|out of stock|unavailable|motor\s*(?:pole|brand|make|class)|\b(?:2|4|6|8|12)\s*(?:pole|p)\b|\bIE\s*[1-4]\b|\b(?:50|60)\s*Hz\b|high\s*speed|medium\s*speed|low\s*speed|brand|nozzle\s*velocity|floor\s*velocity|combinations?|mixed\s*lengths?|single\s*unit\s*only|match(?:ing)?|select\s*by\s*(?:airflow|door)|octave|dB\(?A\)?|air\s*volume|required\s*airflow|\bF\s*(?:250|300|400)\b|Class\s*[BH]|ATEX|terminal\s*box|inspection\s*door|safety\s*factor|tolerance|temperature|air\s*density|altitude|elevation)\b/i.test(userText);
  if (!isAction) return null;

  const previous = findLatestInstantDuty(messages);
  if (!previous) return null;
  if (previous.product === 'fan') {
    const input: DutyRequest = { ...previous.input };
    if (/\b(?:quiet|quieter|quietest|silent|low\s*noise)\b/i.test(userText)) input.optimize_for = 'low_noise';
    else if (/\b(?:efficient|efficiency|highest\s*efficiency|best\s*efficiency|energy\s*efficient|minimum\s*sfp|lowest\s*sfp)\b/i.test(userText)) input.optimize_for = 'high_efficiency';
    else if (/\b(?:lower|lowest|low)\s*(?:power|kw|consumption)|energy saving\b/i.test(userText)) input.optimize_for = 'low_power';
    else if (/\b(?:compact|smallest|lowest\s*size|minimum\s*size|smallest\s*(?:casing|diameter|footprint)|space\s*constraint|limited\s*space)\b/i.test(userText)) input.optimize_for = 'smallest_size';
    else if (/\b(?:more|max(?:imum)?)\s*airflow\b/i.test(userText)) input.optimize_for = 'max_airflow';
    else if (/\b(?:more|max(?:imum)?)\s*(?:pressure|static)\b/i.test(userText)) input.optimize_for = 'max_pressure';

    input.output = /\b(?:drawing|dimension)\b/i.test(userText)
      ? 'drawing'
      : /\b(?:noise|sound)\s*(?:data|sheet|only)?\b/i.test(userText)
        ? 'noise'
        : 'full';
    const series = userText.match(/\b(KVF[\s-]?[PM]|KIN[\s-]?E|KTAF)\b/i)?.[1];
    if (series) input.series_name = series.toUpperCase().replace(/\s/g, '').replace(/^KVF([PM])$/, 'KVF-$1').replace(/^KIN-?E$/, 'KIN-E');
    if (/\b(?:plastic|pvc|abs|polypropylene|polymer|pp)\b/i.test(userText)) input.material = 'plastic';
    if (/\b(?:metal|steel|galvanized|galvanised|gi)\b/i.test(userText)) input.material = 'metal';
    if (/\b(?:wall mounted|wall fan|wall extract|KIN[ -]?E)\b/i.test(userText)) input.fan_type = 'wall_mounted';
    if (/\b(?:inline|ducted|KVF[ -]?[PM])\b/i.test(userText)) input.fan_type = 'inline_ducted';
    if (/\b(?:axial|KTAF)\b/i.test(userText)) input.fan_type = 'axial';
    const manualParameters = parseManualFanParameters(userText);
    for (const [key, value] of Object.entries(manualParameters)) {
      if (value !== null && value !== undefined) {
        (input as any)[key] = value;
      }
    }
    return { product: 'fan', input };
  }

  const input: AcDutyRequest = { ...previous.input };
  if (/\b(?:quiet|quieter|quietest|silent|low\s*noise)\b/i.test(userText)) input.optimize_for = 'low_noise';
  else if (/\b(?:lower|lowest|low)\s*(?:power|watts?|consumption)|energy saving\b/i.test(userText)) input.optimize_for = 'low_power';
  else if (/\b(?:stronger|throw|floor velocity|tall door)\b/i.test(userText)) input.optimize_for = 'max_velocity';
  else if (/\b(?:single unit|minimum quantity|fewest units)\b/i.test(userText)) input.optimize_for = 'fewest_units';
  else if (/\b(?:more|max(?:imum)?)\s*(?:air|airflow)\b/i.test(userText)) input.optimize_for = 'max_airflow';

  input.output = /\b(?:drawing|dimension)\b/i.test(userText)
    ? 'drawing'
    : /\b(?:noise|sound)\s*(?:data|sheet|only)?\b/i.test(userText)
      ? 'noise'
      : 'full';
  if (/\bEC(?:\s*motor)?\b/i.test(userText)) input.motor_type = 'EC';
  if (/\bAC(?:\s*motor)?\b/i.test(userText)) input.motor_type = 'AC';
  if (/\b(?:ceiling|recess(?:ed)?|concealed|flush mounted)\b/i.test(userText)) input.mounting = 'recessed';
  if (/\b(?:wall mounted|surface mounted|exposed)\b/i.test(userText)) input.mounting = 'surface';
  const manualParameters = parseManualAirCurtainParameters(userText);
  for (const [key, value] of Object.entries(manualParameters)) {
    if (value !== null && value !== undefined) {
      (input as any)[key] = value;
    }
  }
  const seriesName =
    /\b(?:XD[ -]?Centrifugal|FM[ -]?(?:35|45|55)(?:09|10|12|15|18|20)XD)\b/i.test(userText)
      ? 'XD-Centrifugal Flow'
      : /\b(?:N[ -]?Cross|FM[ -]?12(?:09|10|12|15|18|20)N)\b/i.test(userText)
        ? 'N-Cross Flow'
        : /\b(?:N[ -]?Centrifugal|FM[ -]?(?:35|45|55)(?:09|10|12|15|18|20)-L)\b/i.test(userText)
          ? 'N-Centrifugal flow'
          : null;
  if (seriesName) input.series_name = seriesName;
  return { product: 'air_curtain', input };
}

function parseInstantTypedSchedule(userText: string): ScheduleItem[] | null {
  const lines = userText
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || lines.length > 25) return null;

  const items: ScheduleItem[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/^\s*(?:\d+[.)-]?|[-*•])\s*/, '');
    const tag = line.match(/^([A-Za-z][A-Za-z0-9 _/-]{0,24})\s*[:=-]\s*/)?.[1]?.trim() ?? `Item ${index + 1}`;
    const fan = parseDirectFanDuty(line);
    if (fan) {
      items.push({ tag, product: 'fan', ...fan });
      continue;
    }
    const airCurtain = parseDirectAirCurtainDuty(line);
    if (airCurtain) {
      items.push({ tag, product: 'air_curtain', ...airCurtain });
      continue;
    }
    return null;
  }
  return items;
}

export function AssistantChat({
  suggestions,
  context = 'general',
  heightClass = 'h-[65vh] min-h-[460px]',
}: {
  suggestions?: string[];
  context?: AssistantContext;
  heightClass?: string;
}) {
  const { isAuthenticated } = useAuth();
  const { isGuest, trialActive } = useGuestTrial();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [aiMode, setAiMode] = useState<AiMode>('auto');

  const [activeProvider, setActiveProvider] = useState('Automatic routing');
  const [availableModels, setAvailableModels] = useState<RegisteredAiModel[]>([]);

  useEffect(() => {
    if (!isAuthenticated || (isGuest && !trialActive)) return;
    let cancelled = false;
    void supabase.functions.invoke('ai-model-registry').then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data?.models)) return;
      setAvailableModels(data.models);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isGuest, trialActive]);

  const dynamicModelOptions = useMemo(() => {
    const modeFor = (model: RegisteredAiModel): AiMode | null => {
      if (model.provider === 'google' && model.tier === 'free') return 'gemini';
      if (model.provider === 'openai' && model.tier === 'cheap') return 'openai_luna';
      if (model.provider === 'openai' && model.tier === 'balanced') return 'openai_terra';
      if (model.provider === 'openai' && model.tier === 'premium') return 'openai_sol';
      if (model.provider === 'anthropic' && model.tier === 'cheap') return 'anthropic_haiku';
      if (model.provider === 'anthropic' && model.tier === 'balanced') return 'anthropic_sonnet';
      if (model.provider === 'anthropic' && model.tier === 'premium') return 'anthropic_opus';
      return null;
    };
    const seen = new Set<string>();
    return [...availableModels]
      .sort((a, b) => a.cost_rank - b.cost_rank || b.model_id.localeCompare(a.model_id))
      .flatMap((model) => {
        const mode = modeFor(model);
        if (!mode || seen.has(mode)) return [];
        seen.add(mode);
        return [{ mode, label: `${model.display_name} · ${model.tier}` }];
      });
  }, [availableModels]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        fetch: async (input, init) => {
          // Auto must reach the server unchanged so every new message is
          // classified independently: selection -> Luna, casual chat -> Gemini,
          // and explicitly complex engineering -> Claude. Provider metadata is
          // display-only and never changes the selected mode.
          const economyLadder = [
            'gemini',
            'openai_luna',
            'anthropic_haiku',
            'openai_terra',
            'anthropic_sonnet',
            'openai_sol',
            'anthropic_opus',
          ] as const;
          const fallbackModes: readonly string[] =
            aiMode === 'openai'
              ? [
                  'openai_luna',
                  'openai_terra',
                  'openai_sol',
                  'anthropic_haiku',
                  'anthropic_sonnet',
                  'anthropic_opus',
                  'gemini',
                ]
              : aiMode === 'anthropic'
                ? [
                    'anthropic_haiku',
                    'anthropic_sonnet',
                    'anthropic_opus',
                    'openai_luna',
                    'openai_terra',
                    'openai_sol',
                    'gemini',
                  ]
                : aiMode === 'auto' || aiMode === 'standard'
                  ? ['auto', 'openai_luna', 'anthropic_sonnet', 'gemini']
                  : [aiMode, ...economyLadder.filter((mode) => mode !== aiMode)];
          const expectedProvider: Record<string, string> = {
            gemini: 'Google Gemini',
            openai_luna: 'OpenAI',
            openai_terra: 'OpenAI',
            openai_sol: 'OpenAI',
            anthropic_haiku: 'Anthropic',
            anthropic_sonnet: 'Anthropic',
            anthropic_opus: 'Anthropic',
          };
          const originalBody =
            typeof init?.body === 'string' ? JSON.parse(init.body) : {};

          // Selection tools run in the KINAIR browser engine, not at the AI
          // provider. Do not replay those UI-only tool parts to a later model:
          // OpenAI requires a matching tool output and Gemini additionally
          // requires its provider thought signature. Preserve a history marker.
          const providerSafeBody = {
            ...originalBody,
            messages: Array.isArray(originalBody.messages)
              ? originalBody.messages.map((message: any) => ({
                  ...message,
                  parts: Array.isArray(message.parts)
                    ? message.parts.flatMap((part: any) =>
                        typeof part?.type === 'string' && part.type.startsWith('tool-')
                          ? [{
                              type: 'text',
                              text: '[KINAIR selection tool completed in the website.]',
                            }]
                          : [part],
                      )
                    : message.parts,
                }))
              : originalBody.messages,
          };
          let lastFailure = '';
          let lastAttemptProvider: string | null = null;

          for (const mode of fallbackModes) {
            // After the automatic request identifies its provider, do not retry
            // that same provider explicitly. Move straight to the next service.
            if (mode !== 'auto' && expectedProvider[mode] === lastAttemptProvider) {
              continue;
            }
            const controller = new AbortController();
            const connectTimeoutMs = mode === 'gemini' ? 5_000 : 8_000;
            const timeoutId = window.setTimeout(() => controller.abort(), connectTimeoutMs);
            const forwardAbort = () => controller.abort();
            if (init?.signal?.aborted) forwardAbort();
            else init?.signal?.addEventListener('abort', forwardAbort, { once: true });

            try {
              const response = await fetch(input, {
                ...init,
                signal: controller.signal,
                body: JSON.stringify({ ...providerSafeBody, aiMode: mode }),
              });
              if (response.status === 403) {
                return response;
              }
              const provider = response.headers.get('X-KINAIR-AI-Provider');
              const model = response.headers.get('X-KINAIR-AI-Model');
              if (provider) {
                lastAttemptProvider = provider.startsWith('KINAIR AI · OpenAI')
                  ? 'OpenAI'
                  : provider;
              }
              const providerMismatch =
                expectedProvider[mode] != null && provider !== expectedProvider[mode];

              // A provider is healthy only when it produces a meaningful AI SDK
              // event. Gemini can emit a stream-start frame immediately and then
              // stall, so a raw first-byte check is not enough.
              if (response.ok && !providerMismatch) {
                if (!response.body) {
                  throw new Error('AI provider returned an empty response stream.');
                }
                const reader = response.body.getReader();
                const bufferedChunks: Uint8Array[] = [];
                const decoder = new TextDecoder();
                let protocolPrelude = '';
                let streamEnded = false;
                const meaningfulEvent =
                  /"type":"(?:text-delta|tool-input-start|tool-input-delta|tool-call|error)"/;

                while (!streamEnded && !meaningfulEvent.test(protocolPrelude)) {
                  const nextChunk = await reader.read();
                  streamEnded = nextChunk.done;
                  if (nextChunk.value) {
                    bufferedChunks.push(nextChunk.value);
                    protocolPrelude += decoder.decode(nextChunk.value, { stream: true });
                  }
                }

                const resumedBody = new ReadableStream<Uint8Array>({
                  start(streamController) {
                    for (const bufferedChunk of bufferedChunks) {
                      streamController.enqueue(bufferedChunk);
                    }
                    if (streamEnded) {
                      streamController.close();
                      return;
                    }
                    const pump = (): void => {
                      void reader.read().then(
                        ({ done, value: nextValue }) => {
                          if (done) {
                            streamController.close();
                            return;
                          }
                          streamController.enqueue(nextValue);
                          pump();
                        },
                        (streamError) => streamController.error(streamError),
                      );
                    };
                    pump();
                  },
                  cancel(reason) {
                    return reader.cancel(reason);
                  },
                });
                if (provider) setActiveProvider(model ? `${provider} · ${model}` : provider);
                return new Response(resumedBody, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers,
                });
              }

              lastFailure = await response.text();
              console.warn('KINAIR AI provider failed; trying fallback', {
                requestedMode: mode,
                actualProvider: provider,
                providerMismatch,
                status: response.status,
              });
            } catch (error) {
              lastFailure = error instanceof Error ? error.message : String(error);
              console.warn('KINAIR AI connection failed; trying fallback', {
                requestedMode: mode,
                error: lastFailure,
              });
            } finally {
              window.clearTimeout(timeoutId);
              init?.signal?.removeEventListener('abort', forwardAbort);
            }
          }

          console.error('All KINAIR AI providers failed', lastFailure);
          return new Response(
            JSON.stringify({
              error: 'The AI providers are temporarily busy. Please retry in a moment.',
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
        body: { aiMode },
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.session?.access_token ?? ''}`,
          };
        },
      }),
    [aiMode],
  );

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
    onError: (e) => toast.error(e.message || 'The assistant could not respond. Please try again.'),
  });

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const autoGrowInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const send = async (text: string) => {
    const value = text.trim();
    const files = attachments;
    if ((!value && files.length === 0) || busy) return;
    setInput('');
    setAttachments([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    if (files.length === 0) {
      const instantSchedule = parseInstantTypedSchedule(value);
      if (instantSchedule) {
        setActiveProvider('KINAIR selection engine · instant');
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: value }] },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts: [
              { type: 'text', text: `Running the official KINAIR selector for all ${instantSchedule.length} typed duties.` },
              {
                type: 'tool-prepare_schedule_selection',
                toolCallId: crypto.randomUUID(),
                state: 'input-available',
                input: { title: 'KINAIR Instant Multi-Selection', items: instantSchedule },
              },
            ],
          },
        ] as any);
        return;
      }
      const directDuty = parseDirectFanDuty(value);
      if (directDuty) {
        const requestId = crypto.randomUUID();
        const toolCallId = crypto.randomUUID();
        setActiveProvider('KINAIR selection engine · instant');
        setMessages((current) => [
          ...current,
          {
            id: requestId,
            role: 'user',
            parts: [{ type: 'text', text: value }],
          },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text: `Running the official KINAIR selector for ${directDuty.airflow} ${directDuty.airflow_unit} @ ${directDuty.static_pressure} ${directDuty.pressure_unit}.`,
              },
              {
                type: 'tool-prepare_datasheet',
                toolCallId,
                state: 'input-available',
                input: directDuty,
              },
            ],
          },
        ] as any);
        return;
      }
      const directAirCurtainDuty = parseDirectAirCurtainDuty(value);
      if (directAirCurtainDuty) {
        const requestId = crypto.randomUUID();
        const toolCallId = crypto.randomUUID();
        setActiveProvider('KINAIR selection engine · instant');
        setMessages((current) => [
          ...current,
          {
            id: requestId,
            role: 'user',
            parts: [{ type: 'text', text: value }],
          },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text: `Running the official KINAIR air-curtain selector for ${directAirCurtainDuty.door_width} ${directAirCurtainDuty.door_width_unit} width × ${directAirCurtainDuty.door_height} ${directAirCurtainDuty.door_height_unit} height.`,
              },
              {
                type: 'tool-prepare_air_curtain_datasheet',
                toolCallId,
                state: 'input-available',
                input: directAirCurtainDuty,
              },
            ],
          },
        ] as any);
        return;
      }
      const instantFollowUp = parseInstantFollowUp(value, messages);
      if (instantFollowUp) {
        setActiveProvider('KINAIR selection engine · instant');
        const toolType = instantFollowUp.product === 'fan'
          ? 'tool-prepare_datasheet'
          : 'tool-prepare_air_curtain_datasheet';
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: value }] },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts: [
              { type: 'text', text: 'Re-running the official KINAIR selector with your requested change.' },
              {
                type: toolType,
                toolCallId: crypto.randomUUID(),
                state: 'input-available',
                input: instantFollowUp.input,
              },
            ],
          },
        ] as any);
        return;
      }
      sendMessage({ text: value });
      return;
    }

    try {
      const parts: any[] = [];
      const sheetTexts: string[] = [];
      for (const file of files) {
        if (isSpreadsheet(file)) {
          sheetTexts.push(await spreadsheetToText(file));
        } else if (isPdf(file)) {
          // The chat model cannot read raw PDF bytes, so read the schedule here:
          // text layer first, page images for scanned drawings.
          let text = '';
          try {
            text = await pdfToText(file);
          } catch {
            text = '';
          }
          if (text.replace(/[^a-z0-9]/gi, '').length > 80) {
            sheetTexts.push(text);
          } else {
            const images = await pdfToImages(file);
            if (!images.length) throw new Error('unreadable pdf');
            images.forEach((url, i) =>
              parts.push({
                type: 'file',
                mediaType: 'image/png',
                filename: `${file.name}-page-${i + 1}.png`,
                url: toBase64Payload(url),
              }),
            );
          }
        } else if (file.type.startsWith('image/')) {
          // Downscale like a PDF's rendered pages — a full-resolution phone
          // screenshot or photo sent as-is is prone to timing out mid-upload.
          parts.push({
            type: 'file',
            mediaType: 'image/jpeg',
            filename: file.name,
            url: toBase64Payload(await imageFileToDataUrl(file)),
          });
        } else {
          parts.push({
            type: 'file',
            mediaType: file.type || 'application/octet-stream',
            filename: file.name,
            url: await fileToDataUrl(file),
          });
        }
      }
      const intro =
        value ||
        'Here is a schedule. Please select a model for every line and give me the datasheets.';
      const attachmentLabel = `📎 Attached: ${files.map((file) => file.name).join(', ')}`;
      // Keep extracted table text in the model message, but mark it as
      // background data so the chat UI does not expose the full schedule.
      const body = sheetTexts.length
        ? [intro, attachmentLabel, BACKGROUND_SCHEDULE_MARKER, ...sheetTexts].join('\n\n')
        : [intro, attachmentLabel].join('\n');
      sendMessage({ role: 'user', parts: [{ type: 'text', text: body }, ...parts] } as any);
    } catch {
      toast.error('Could not read that file. Please try a PDF, image or Excel file.');
    }
  };


  // ---- In-chat selection + datasheet (add-on layer, same engine as the selector) ----
  const { database } = useSupabaseFanDatabase();
  const { data: dimensionsMap } = useAllFanDimensions();
  const [autoSelections, setAutoSelections] = useState<Record<string, AutoSelection>>({});
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const fanDownloadedRef = useRef<Set<string>>(new Set());

  const downloadDatasheet = useCallback(
    async (key: string, selection: FanSelection, output: DocOutput = 'full') => {
      setDownloadingKey(key);
      try {
        if (output === 'drawing') {
          await downloadFanDrawing(selection, database, dimensionsMap as any);
          toast.success(`${selection.nomenclature} drawing downloaded`);
        } else if (output === 'noise') {
          await downloadFanNoiseData(selection, database);
          toast.success(`${selection.nomenclature} sound data downloaded`);
        } else {
          const duty = autoSelections[key]?.duty;
          await generateDatasheetForSelection(
            selection,
            database,
            { airflowUnit: duty?.airflow_unit, pressureUnit: duty?.pressure_unit },
            dimensionsMap as any,
          );
          toast.success(`${selection.nomenclature} datasheet downloaded`);
        }
      } catch {
        toast.error('Could not build that document. Please try again.');
      } finally {
        setDownloadingKey(null);
      }
    },
    [database, dimensionsMap, autoSelections],
  );

  useEffect(() => {
    if (!database?.fans?.length) return;

    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      (m.parts as any[]).forEach((p, idx) => {
        if (p?.type !== 'tool-prepare_datasheet') return;
        if (!hasCompleteToolInput(p)) return;
        const duty = p?.input as DutyRequest | undefined;
        if (!duty || !duty.airflow || !duty.static_pressure) return;
        const key = `${m.id}-${idx}`;
        if (handledRef.current.has(key)) return;
        handledRef.current.add(key);

        // Do not trust the model alone for hard catalogue filters. Recover the
        // requirement from the user's own preceding message when a tool argument
        // was omitted, so plastic and metal alternatives can never be mixed.
        const messageIndex = messages.findIndex((message) => message.id === m.id);
        const priorUser = messages
          .slice(0, messageIndex)
          .reverse()
          .find((message) => message.role === 'user');
        const userText = (priorUser?.parts as any[] | undefined)
          ?.filter((part) => part?.type === 'text')
          .map((part) => String(part.text ?? ''))
          .join(' ')
          .toLowerCase() ?? '';

        const mentionsPlastic = /\b(plastic|pvc|u-pvc|upvc|abs|polypropylene|polymer|pp)\b/i.test(userText);
        const mentionsMetal = /\b(metal|metallic|steel|stainless\s*steel|ss\s*304|ss\s*316|galvanized|galvanised|gi|aluminium|aluminum)\b/i.test(userText);
        const mentionsWall = /\b(wall[ -]?mounted|wall extract|wall fan)\b/i.test(userText);
        const mentionsAxial = /\b(ktaf|tube axial|axial fan|axial flow)\b/i.test(userText);
        const mentionsKvfp = /\bkvf[ -]?p\b/i.test(userText);
        const mentionsKvfm = /\bkvf[ -]?m\b/i.test(userText);
        const mentionsKine = /\bkin[ -]?e\b/i.test(userText);

        const inferredSeries =
          mentionsKvfp ? 'KVF-P' :
          mentionsKvfm ? 'KVF-M' :
          mentionsKine ? 'KIN-E' :
          mentionsAxial ? 'KTAF' :
          null;
        const effectiveMaterial =
          duty.material ?? (mentionsPlastic ? 'plastic' : mentionsMetal ? 'metal' : null);
        const effectiveSeriesName = duty.series_name ?? inferredSeries;
        const lowNoise = duty.optimize_for === 'low_noise';
        const askedKinE = (effectiveSeriesName || '').toLowerCase().includes('kin-e');
        const install: FanInstallType | null =
          duty.fan_type ??
          (mentionsAxial ? 'axial' : mentionsWall || askedKinE ? 'wall_mounted' : null);
        const series =
          install === 'wall_mounted'
            ? resolveFanSeries(database, null, null, 'wall_mounted')
            : install === 'axial'
              ? resolveFanSeries(database, 'KTAF', null, 'axial')
              : lowNoise && !effectiveSeriesName && !effectiveMaterial
                ? resolveFanSeries(database, 'KVF-P', null, 'inline_ducted')
                : resolveFanSeries(database, effectiveSeriesName, effectiveMaterial, install);


        const requestedMotorBrand = duty.motor_brand?.trim().toLowerCase();
        const motorBrandId = requestedMotorBrand
          ? database.motorDatabase?.brands?.find((brand: any) =>
              String(brand.name ?? '').toLowerCase() === requestedMotorBrand ||
              String(brand.name ?? '').toLowerCase().includes(requestedMotorBrand),
            )?.id
          : undefined;
        const effectiveTemperature = duty.temperature_c ?? 20;
        const effectiveDensity = duty.air_density_kg_m3 ??
          calculateAirDensity(duty.altitude_m ?? 0, effectiveTemperature);

        const results = findOptimalSelections(
          database,
          {
            requiredAirflow: duty.airflow,
            requiredPressure: duty.static_pressure,
            airflowUnit: (AIRFLOW_UNITS as any)[duty.airflow_unit] ? duty.airflow_unit : 'CMH',
            pressureUnit: (PRESSURE_UNITS as any)[duty.pressure_unit] ? duty.pressure_unit : 'Pa',
            seriesId: (series as any)?.id,
            motorPole: duty.motor_poles ?? undefined,
            motorBrandId,
            efficiencyClass: duty.motor_efficiency_class ?? undefined,
            frequency: duty.frequency_hz ?? 50,
            fireClass: duty.fire_class ?? '',
            accessory: duty.accessory ?? '',
            atexRating: duty.atex_rating ?? '',
            safetyFactor: duty.safety_factor ?? fanSelectorDefaults(database, series).safetyFactor,
            toleranceMin: duty.tolerance_min ?? fanSelectorDefaults(database, series).toleranceMin,
            toleranceMax: duty.tolerance_max ?? fanSelectorDefaults(database, series).toleranceMax,
            temperature: effectiveTemperature,
            airDensity: effectiveDensity,
            dimensionsBySeriesAndSize: dimensionsMap,
          },
          50,
        );


        const sizeFilteredResults = results.filter((selection) => {
          if (duty.fan_size_mm && selection.diameter !== duty.fan_size_mm) return false;
          if (duty.max_fan_size_mm && selection.diameter > duty.max_fan_size_mm) return false;
          return true;
        });
        const optimizeFor = duty.optimize_for ?? 'balanced';
        const ranked = optimizeFor === 'balanced'
          ? sizeFilteredResults
          : rankFanSelections(sizeFilteredResults, optimizeFor);
        setAutoSelections((prev) => ({ ...prev, [key]: { duty, results: ranked } }));

        // Only auto-download once the reply stream has fully finished — starting a
        // file download mid-stream makes mobile browsers abort the chat stream.
        if (ranked.length > 0) {
          if (!busy && !fanDownloadedRef.current.has(key)) {
            fanDownloadedRef.current.add(key);
            void downloadDatasheet(key, ranked[0], duty.output ?? 'full');
          }
        } else {
          const seriesLabel = (series as any)?.name ? ` in ${(series as any).name}` : '';
          toast.error(
            `No model${seriesLabel} can meet ${duty.airflow} ${duty.airflow_unit} @ ${duty.static_pressure} ${duty.pressure_unit}. Please change the duty or ask for another series.`,
            { duration: 8000 },
          );
        }

      });
    }
  }, [messages, database, dimensionsMap, downloadDatasheet, busy]);

  // ---- Same, for air curtains ----
  const { data: acModels = [] } = useAirCurtainModels();
  const { data: acBrands = [] } = useAirCurtainBrands();
  const { data: acSeries = [] } = useAirCurtainSeries();
  const { data: acDimensions = [] } = useAirCurtainDimensions();
  const { data: tenant } = useTenantData();
  const [acAutoSelections, setAcAutoSelections] = useState<Record<string, AcAutoSelection>>({});
  const [acDownloadingKey, setAcDownloadingKey] = useState<string | null>(null);
  const acHandledRef = useRef<Set<string>>(new Set());
  const acDownloadedRef = useRef<Set<string>>(new Set());

  // Prompt hints built from the live KINAIR catalogue, so the examples always
  // name real series and models instead of generic product types.
  const effectiveSuggestions = useMemo(() => {
    if (suggestions?.length) return suggestions;

    const fanSeries = (database?.series ?? [])
      .map((s: any) => String(s?.name ?? '').trim())
      .filter(Boolean);
    const acSeriesNames = (acSeries ?? [])
      .map((s: any) => String(s?.name ?? '').trim())
      .filter(Boolean);
    const acModelName = String((acModels ?? [])[0]?.model ?? '').trim();

    const fanHints: string[] = [];
    if (fanSeries[0]) {
      fanHints.push(`${fanSeries[0]} — 25 lps @ 50 Pa, send me the datasheet`);
      fanHints.push(`What sizes, motor poles and specifications does ${fanSeries[0]} have?`);
    }
    if (fanSeries[1]) {
      fanHints.push(`${fanSeries[1]} for 25,000 m³/h at 300 Pa — best model?`);
    }
    fanHints.push('Send only the drawing of the selected model');
    fanHints.push('Give me a quieter model with lower power');
    fanHints.push('Attach a fan schedule (PDF, image or Excel) and select every line');
    fanHints.push('Car park 40 x 20 x 3 m, 300 mm duct, 20 m run, 3 elbows — what fan do I need?');

    const acHints: string[] = [];
    if (acSeriesNames[0]) {
      acHints.push(`${acSeriesNames[0]} air curtain for a 2 m wide, 3 m high entrance — datasheet`);
    }
    if (acModelName) {
      acHints.push(`Technical specification of ${acModelName}`);
    }
    if (acSeriesNames[1]) {
      acHints.push(`${acSeriesNames[1]} for a 4 m wide hotel entrance`);
    }
    acHints.push('Give me a lower power consumption EC motor option');
    acHints.push('Send only the noise data for that air curtain');

    if (context === 'fan') return (fanHints.length ? fanHints : FAN_SUGGESTIONS).slice(0, 5);
    if (context === 'air_curtain') {
      return (acHints.length ? acHints : AIR_CURTAIN_SUGGESTIONS).slice(0, 5);
    }
    const mixed = [...fanHints.slice(0, 3), ...acHints.slice(0, 2)];
    return mixed.length ? mixed : DEFAULT_SUGGESTIONS;
  }, [suggestions, context, database, acSeries, acModels]);


  const downloadAcDatasheet = useCallback(
    async (
      key: string,
      selection: AirCurtainSelection,
      auto: AcAutoSelection,
      output: DocOutput = 'full',
    ) => {
      setAcDownloadingKey(key);
      try {
        if (output === 'drawing') {
          await downloadAirCurtainDrawing(selection);
          toast.success(`${selection.model.model} drawing downloaded`);
        } else if (output === 'noise') {
          await downloadAirCurtainNoiseData(selection);
          toast.success(`${selection.model.model} sound data downloaded`);
        } else {
          await generateAirCurtainDatasheetForSelection(
            selection,
            {
              doorWidthMm: auto.doorWidthMm,
              doorHeightM: auto.doorHeightM,
              minFloorVelocity: auto.minFloorVelocity,
              noiseMode: auto.noiseMode,
              airflowUnit: auto.airflowUnit,
              widthUnit: auto.widthUnit,
              heightUnit: auto.heightUnit,
            },
            { brands: acBrands, series: acSeries, dimensions: acDimensions, tenant },
          );
          toast.success(`${selection.model.model} datasheet downloaded`);
        }
      } catch {
        toast.error('Could not build that document. Please try again.');
      } finally {
        setAcDownloadingKey(null);
      }
    },
    [acBrands, acSeries, acDimensions, tenant],
  );

  useEffect(() => {
    if (!acModels.length) return;

    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      (m.parts as any[]).forEach((p, idx) => {
        if (p?.type !== 'tool-prepare_air_curtain_datasheet') return;
        if (!hasCompleteToolInput(p)) return;
        const duty = p?.input as AcDutyRequest | undefined;
        if (!duty) return;
        const key = `ac-${m.id}-${idx}`;
        if (acHandledRef.current.has(key)) return;

        const heightUnit = AC_LENGTH_TO_MM[duty.door_height_unit ?? 'm'] ?? 1000;
        const widthUnit = AC_LENGTH_TO_MM[duty.door_width_unit ?? 'mm'] ?? 1;
        const doorHeightM = duty.door_height ? (duty.door_height * heightUnit) / 1000 : 3;
        const doorWidthMm = duty.door_width ? duty.door_width * widthUnit : 1000;
        if (!doorHeightM) return;
        acHandledRef.current.add(key);

        // Mounting type is a hard product constraint. Recover it from the
        // user's own wording so an incorrect AI tool argument can never turn a
        // ceiling/recessed request into a wall-mounted selection.
        const messageIndex = messages.findIndex((message) => message.id === m.id);
        const priorUser = messages
          .slice(0, messageIndex)
          .reverse()
          .find((message) => message.role === 'user');
        const userText = (priorUser?.parts as any[] | undefined)
          ?.filter((part) => part?.type === 'text')
          .map((part) => String(part.text ?? ''))
          .join(' ')
          .toLowerCase() ?? '';
        const effectiveMounting: AirCurtainCategory | 'any' =
          /\b(ceiling|recess(?:ed)?|concealed|flush[ -]?mount(?:ed)?)\b/i.test(userText)
            ? 'recessed'
            : /\b(wall[ -]?mount(?:ed)?|surface[ -]?mount(?:ed)?|exposed)\b/i.test(userText)
              ? 'surface'
              : duty.mounting ?? 'any';

        const wanted = (duty.series_name || '').trim().toLowerCase();
        const seriesMatch = wanted
          ? acSeries.find((s) => s.name.toLowerCase() === wanted) ||
            acSeries.find((s) => s.name.toLowerCase().includes(wanted))
          : undefined;
        const series =
          seriesMatch &&
          (effectiveMounting === 'any' || seriesMatch.category === effectiveMounting)
            ? seriesMatch
            : undefined;
        const brandName = (duty.brand || '').trim();
        const brandMatch = brandName
          ? acBrands.find((b) => b.name.toLowerCase() === brandName.toLowerCase())?.name
          : undefined;

        const airflowFactor = AC_AIRFLOW_TO_CMH[duty.min_airflow_unit ?? 'CMH'] ?? 1;
        const minAirflowCmh = duty.min_airflow ? duty.min_airflow * airflowFactor : 0;
        const minFloorVelocity = duty.min_floor_velocity ?? 2;
        const selectionBasis =
          duty.selection_basis ?? (minAirflowCmh > 0 && !duty.door_width ? 'airflow' : 'door');

        const results = selectAirCurtains(acModels, {
          doorWidthMm,
          doorHeightM,
          category: effectiveMounting,
          speed: duty.speed ?? 'high',
          minNozzleVelocity: duty.min_nozzle_velocity ?? 0,
          minAirflowCmh,
          motorType: duty.motor_type ?? 'any',
          brand: brandMatch ?? 'any',
          seriesId: series?.id ?? 'any',
          allowCombinations: duty.allow_combinations ?? true,
          minFloorVelocity,
          supplyFrequencyHz: duty.supply_frequency_hz ?? 50,
          minMatchPercent: duty.min_match_percent ?? AC_MIN_MATCH_PERCENT,
          maxMatchPercent: duty.max_match_percent ?? AC_MAX_MATCH_PERCENT,
          selectionBasis,
        });

        const optimizeFor: AcOptimizeFor = duty.optimize_for ?? 'balanced';
        const rankedBeforePromotion =
          optimizeFor === 'balanced' ? results : rankAirCurtains(results, optimizeFor);
        const hasRequestedPromotion =
          isFm35ToFm45PromotionRequest(userText) ||
          hasExplicitUnavailableAirCurtainModelRequest(userText);
        const ranked =
          rankedBeforePromotion.length > 0 && hasRequestedPromotion
            ? [
                applyRequestedAirCurtainPromotions(
                  rankedBeforePromotion[0],
                  acModels,
                  acSeries,
                  { doorWidthMm, doorHeightM, minFloorVelocity },
                  userText,
                ),
                ...rankedBeforePromotion.slice(1),
              ]
            : rankedBeforePromotion;
        const auto: AcAutoSelection = {
          doorWidthMm,
          doorHeightM,
          minFloorVelocity,
          optimizeFor,
          noiseMode: duty.noise_mode ?? 'dba',
          airflowUnit:
            duty.min_airflow_unit === 'CFM'
              ? 'cfm'
              : duty.min_airflow_unit === 'LPS'
                ? 'ls'
                : 'cmh',
          widthUnit: duty.door_width_unit ?? 'mm',
          heightUnit: duty.door_height_unit ?? 'm',
          results: ranked,
        };
        setAcAutoSelections((prev) => ({ ...prev, [key]: auto }));

        if (ranked.length > 0) {
          if (!busy && !acDownloadedRef.current.has(key)) {
            acDownloadedRef.current.add(key);
            void downloadAcDatasheet(key, ranked[0], auto, duty.output ?? 'full');
          }
        } else {
          toast.info('No air curtain in the catalogue suits that opening. Try a lower floor velocity.');
        }
      });
    }
  }, [messages, acModels, acSeries, acBrands, downloadAcDatasheet, busy]);

  // ---- Multiple selections from a schedule (typed, or attached as PDF / image / Excel) ----
  const [scheduleResults, setScheduleResults] = useState<Record<string, ScheduleResult>>({});
  const [scheduleBusyKey, setScheduleBusyKey] = useState<string | null>(null);
  const scheduleHandledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!database?.fans?.length && !acModels.length) return;

    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      (m.parts as any[]).forEach((p, idx) => {
        if (p?.type !== 'tool-prepare_schedule_selection') return;
        if (!hasCompleteToolInput(p)) return;
        const input = p?.input as
          | { title?: string | null; items?: ScheduleItem[]; optimize_for?: FanOptimizeFor }
          | undefined;
        const items = input?.items;
        if (!Array.isArray(items) || items.length === 0) return;
        const key = `sch-${m.id}-${idx}`;
        if (scheduleHandledRef.current.has(key)) return;
        scheduleHandledRef.current.add(key);

        const fanOptimize: FanOptimizeFor = (input?.optimize_for as FanOptimizeFor) ?? 'balanced';
        const acOptimize: AcOptimizeFor =
          fanOptimize === 'low_noise' ? 'low_noise' : fanOptimize === 'low_power' ? 'low_power' : 'balanced';
        const messageIndex = messages.findIndex((message) => message.id === m.id);
        const priorUser = messages
          .slice(0, messageIndex)
          .reverse()
          .find((message) => message.role === 'user');
        const scheduleUserText =
          (priorUser?.parts as any[] | undefined)
            ?.filter((part) => part?.type === 'text')
            .map((part) => String(part.text ?? ''))
            .join(' ') ?? '';
        const promoteFm35 = isFm35ToFm45PromotionRequest(scheduleUserText);
        const hasSchedulePromotion =
          promoteFm35 || hasExplicitUnavailableAirCurtainModelRequest(scheduleUserText);

        const rows: ScheduleRow[] = items.map((item, i) => {
          const tag = (item.tag || '').trim() || `Item ${i + 1}`;
          const quantity = item.quantity && item.quantity > 0 ? Math.round(item.quantity) : 1;

          if (item.product === 'air_curtain') {
            const widthUnit = AC_LENGTH_TO_MM[item.door_width_unit ?? 'mm'] ?? 1;
            const heightUnit = AC_LENGTH_TO_MM[item.door_height_unit ?? 'm'] ?? 1000;
            const doorWidthMm = item.door_width ? item.door_width * widthUnit : 1000;
            const doorHeightM = item.door_height ? (item.door_height * heightUnit) / 1000 : 3;
            const duty = `${Math.round(doorWidthMm)} mm × ${doorHeightM} m door`;
            const brandMatch = item.brand
              ? acBrands.find((b) => b.name.toLowerCase() === String(item.brand).toLowerCase())?.name
              : undefined;
            const requestedCategory: AirCurtainCategory | 'any' = (item.mounting as any) ?? 'any';
            // On a revision request, an exact existing schedule selection is the
            // authority for series/mounting. This prevents an FM35 promotion
            // instruction from converting N-Cross Flow rows into N-Centrifugal.
            const existingSeries = hasSchedulePromotion
              ? seriesFromExistingAirCurtainSelection(item.existing_selection, acSeries)
              : undefined;
            const category: AirCurtainCategory | 'any' =
              existingSeries?.category ?? requestedCategory;
            const wanted = (item.series_name || '').trim().toLowerCase();
            const requestedSeries = wanted
              ? acSeries.find((s) => s.name.toLowerCase() === wanted) ||
                acSeries.find((s) => s.name.toLowerCase().includes(wanted))
              : undefined;
            const seriesMatch = existingSeries ?? requestedSeries;
            // Mounting remains the hard filter even if extraction supplied a
            // conflicting wall/recessed series name.
            const series =
              seriesMatch && (category === 'any' || seriesMatch.category === category)
                ? seriesMatch
                : undefined;

            const airflowFactor = AC_AIRFLOW_TO_CMH[item.min_airflow_unit ?? 'CMH'] ?? 1;
            const minAirflowCmh = item.min_airflow ? item.min_airflow * airflowFactor : 0;
            const minFloorVelocity = item.min_floor_velocity ?? 2;
            const selectionBasis =
              item.selection_basis ?? (minAirflowCmh > 0 && !item.door_width ? 'airflow' : 'door');
            const coreResults = selectAirCurtains(acModels, {
                doorWidthMm,
                doorHeightM,
                category,
                speed: item.speed ?? 'high',
                minNozzleVelocity: item.min_nozzle_velocity ?? 0,
                minAirflowCmh,
                motorType: (item.motor_type as any) ?? 'any',
                brand: brandMatch ?? 'any',
                seriesId: series?.id ?? 'any',
                allowCombinations: item.allow_combinations ?? true,
                minFloorVelocity,
                supplyFrequencyHz: item.supply_frequency_hz ?? 50,
                minMatchPercent: item.min_match_percent ?? AC_MIN_MATCH_PERCENT,
                maxMatchPercent: item.max_match_percent ?? AC_MAX_MATCH_PERCENT,
                selectionBasis,
              });
            const rowOptimize = item.optimize_for ?? acOptimize;
            const results = rowOptimize === 'balanced'
              ? coreResults
              : rankAirCurtains(coreResults, rowOptimize);
            const optimum = results[0];
            if (!optimum) {
              return { tag, quantity, product: 'air_curtain', duty, label: 'No suitable model', detail: '' };
            }
            // Promotion is deliberately after optimum selection. If the optimum
            // is N-Cross Flow or anything other than eligible FM35, it is unchanged.
            const best = hasSchedulePromotion
              ? applyRequestedAirCurtainPromotions(
                  optimum,
                  acModels,
                  acSeries,
                  { doorWidthMm, doorHeightM, minFloorVelocity },
                  scheduleUserText,
                )
              : optimum;
            return {
              tag,
              quantity,
              product: 'air_curtain',
              duty,
              label: best.arrangement,
              detail: `${Math.round(best.totalAirVolumeCmh).toLocaleString()} m³/h · ${Math.round(
                best.totalPowerW,
              )} W${best.noiseDb ? ` · ${Math.round(best.noiseDb)} dB(A)` : ''}`,
              selection: { kind: 'air_curtain', selection: best, doorWidthMm, doorHeightM, minFloorVelocity },
            };
          }

          const airflowUnit = ((AIRFLOW_UNITS as any)[item.airflow_unit ?? 'CMH'] ? item.airflow_unit : 'CMH') as
            keyof typeof AIRFLOW_UNITS;
          const pressureUnit = ((PRESSURE_UNITS as any)[item.pressure_unit ?? 'Pa'] ? item.pressure_unit : 'Pa') as
            keyof typeof PRESSURE_UNITS;
          const duty = `${item.airflow ?? '—'} ${airflowUnit} @ ${item.static_pressure ?? '—'} ${pressureUnit}`;
          if (!item.airflow || item.static_pressure == null) {
            return { tag, quantity, product: 'fan', duty, label: 'Duty incomplete', detail: '' };
          }
          const rowLowNoise = (item as any).optimize === 'low_noise';
          const rowAskedKinE = ((item as any).series_name || '').toLowerCase().includes('kin-e');
          const rowInstall: FanInstallType | null =
            (item as any).fan_type ?? (rowAskedKinE ? 'wall_mounted' : null);
          const series =
            rowInstall === 'wall_mounted'
              ? resolveFanSeries(database, null, null, 'wall_mounted')
              : rowLowNoise
                ? resolveFanSeries(database, 'KVF-P', null, 'inline_ducted')
                : resolveFanSeries(database, item.series_name, (item as any).material, rowInstall);



          const found = findOptimalSelections(
            database,
            {
              requiredAirflow: item.airflow,
              requiredPressure: item.static_pressure,
              airflowUnit,
              pressureUnit,
              seriesId: (series as any)?.id,
              motorPole: item.motor_poles ?? undefined,
              dimensionsBySeriesAndSize: dimensionsMap,
              ...fanSelectorDefaults(database, series),
            },
            10,
          );
          let ranked = fanOptimize === 'balanced' ? found : rankFanSelections(found, fanOptimize);
          if (item.max_noise_db) {
            const quiet = ranked.filter(
              (r) => !r.noiseData?.overall || r.noiseData.overall <= (item.max_noise_db as number),
            );
            if (quiet.length) ranked = quiet;
          }
          const best = ranked[0];
          if (!best) {
            const seriesLabel = (series as any)?.name ? ` in ${(series as any).name}` : '';
            return { tag, quantity, product: 'fan', duty, label: `No selection available${seriesLabel}`, detail: 'No model can meet this duty — change the duty or series.' };
          }
          return {
            tag,
            quantity,
            product: 'fan',
            duty,
            label: best.nomenclature,
            detail: `${Math.round(best.operatingPoint.airflow).toLocaleString()} m³/h @ ${Math.round(
              best.operatingPoint.staticPressure,
            )} Pa · ${best.operatingPoint.shaftPower.toFixed(3)} kW${
              best.noiseData?.overall ? ` · ${Math.round(best.noiseData.overall)} dB(A)` : ''
            }`,
            selection: { kind: 'fan', selection: best, airflowUnit, pressureUnit },
          };
        });

        setScheduleResults((prev) => ({
          ...prev,
          [key]: { title: (input?.title || '').trim() || 'Schedule selection', rows },
        }));
      });
    }
  }, [messages, database, dimensionsMap, acModels, acSeries, acBrands]);

  const downloadScheduleRow = useCallback(
    async (key: string, row: ScheduleRow) => {
      if (!row.selection) return;
      setScheduleBusyKey(key);
      try {
        if (row.selection.kind === 'fan') {
          await generateDatasheetForSelection(row.selection.selection, database, {
            airflowUnit: row.selection.airflowUnit,
            pressureUnit: row.selection.pressureUnit,
          });
        } else {
          await generateAirCurtainDatasheetForSelection(
            row.selection.selection,
            {
              doorWidthMm: row.selection.doorWidthMm,
              doorHeightM: row.selection.doorHeightM,
              minFloorVelocity: row.selection.minFloorVelocity,
            },
            { brands: acBrands, series: acSeries, dimensions: acDimensions, tenant },
          );
        }
        toast.success(`${row.tag} datasheet downloaded`);
      } catch {
        toast.error(`Could not build the datasheet for ${row.tag}.`);
      } finally {
        setScheduleBusyKey(null);
      }
    },
    [database, acBrands, acSeries, acDimensions, tenant],
  );

  const downloadAllSchedule = useCallback(
    async (key: string) => {
      const sched = scheduleResults[key];
      if (!sched) return;
      const fanRows = sched.rows.filter(
        (r): r is ScheduleRow & { selection: Extract<ScheduleSelection, { kind: 'fan' }> } =>
          r.selection?.kind === 'fan',
      );
      const acRows = sched.rows.filter(
        (r): r is ScheduleRow & { selection: Extract<ScheduleSelection, { kind: 'air_curtain' }> } =>
          r.selection?.kind === 'air_curtain',
      );
      setScheduleBusyKey(key);
      try {
        if (!fanRows.length && !acRows.length) throw new Error('No selections');
        await downloadCombinedScheduleDatasheet({
          title: sched.title,
          rows: fanRows.map((row) => ({
            tag: row.tag,
            quantity: row.quantity,
            duty: row.duty,
            selection: row.selection.selection,
            airflowUnit: row.selection.airflowUnit,
            pressureUnit: row.selection.pressureUnit,
          })),
          database,
          dimensionsMap: dimensionsMap as Map<string, any>,
          companyName: tenant?.name,
          logoUrl: tenant?.logo_url,
          airCurtainRows: acRows.map((row) => ({
            tag: row.tag,
            quantity: row.quantity,
            duty: row.duty,
            label: row.label,
            selection: row.selection.selection,
            doorWidthMm: row.selection.doorWidthMm,
            doorHeightM: row.selection.doorHeightM,
            minFloorVelocity: row.selection.minFloorVelocity,
          })),
          airCurtainContext: { brands: acBrands, series: acSeries, dimensions: acDimensions },
        });
        toast.success(
          `Combined PDF downloaded with ${fanRows.length + acRows.length} datasheets`,
        );
      } catch {
        toast.error('Could not build the combined schedule PDF.');
      } finally {
        setScheduleBusyKey(null);
      }
    },
    [scheduleResults, database, dimensionsMap, tenant, acBrands, acSeries, acDimensions],
  );




  return (
        <Card className={`flex flex-col overflow-hidden ${heightClass}`}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>{activeProvider}</span>
            </div>
            <select
              value={aiMode}
              onChange={(e) => setAiMode(e.target.value as AiMode)}
              disabled={busy}
              aria-label="Choose AI provider and model"
              className="h-8 max-w-[58vw] rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground sm:max-w-none"
            >
              <option value="auto">Automatic · Free → Premium</option>
              {dynamicModelOptions.length > 0 ? (
                dynamicModelOptions.map((model) => (
                  <option key={model.mode} value={model.mode}>
                    {model.label}
                  </option>
                ))
              ) : (
                <>
                  <option value="gemini">Gemini 3.6 Flash · free</option>
                  <option value="openai_luna">OpenAI GPT-5.6 Luna · cheap</option>
                  <option value="anthropic_haiku">Claude Haiku 4.5 · cheap</option>
                  <option value="openai_terra">OpenAI GPT-5.6 Terra · balanced</option>
                  <option value="anthropic_sonnet">Claude Sonnet 5 · balanced</option>
                  <option value="openai_sol">OpenAI GPT-5.6 Sol · premium</option>
                  <option value="anthropic_opus">Claude Opus 5 · premium</option>
                </>
              )}
            </select>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-8 h-8 text-primary" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">
                    Hi, I'm KINAIR — your selection engineer
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tell me what you're working on — a fan duty, an air curtain, a room you need to
                    ventilate, or a full schedule. I'll pick the right model and hand you the
                    datasheet, right here in the chat.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CFM, m³/h, L/s, Pa or in.wg — all understood. You can also just say hi and ask
                    me anything about ventilation.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                  {effectiveSuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-3 py-2 rounded-full border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => {
              const isUser = m.role === 'user';
              const rawText = m.parts
                .filter((p) => p.type === 'text')
                .map((p) => (p as { text: string }).text)
                .join('');
              // The model receives extracted schedule rows after this marker;
              // users see only their request and the attachment label.
              const text = isUser
                ? rawText.split(BACKGROUND_SCHEDULE_MARKER, 1)[0].trim()
                : rawText;
              const tools = m.parts.filter((p) => p.type.startsWith('tool-'));
              const recs: { model: string; airflow: number; pressure: number }[] = [];
              const airCurtainRecs: string[] = [];
              for (const p of m.parts as any[]) {
                if (p?.type === 'tool-find_fans' && Array.isArray(p?.output?.results)) {
                  const airflow = Number(p?.input?.airflow_cmh);
                  const pressure = Number(p?.input?.static_pressure_pa);
                  if (!airflow || !pressure) continue;
                  for (const r of p.output.results.slice(0, 3)) {
                    if (r?.model && !recs.some((x) => x.model === r.model)) {
                      recs.push({ model: String(r.model), airflow, pressure });
                    }
                  }
                }
                if (p?.type === 'tool-find_air_curtains' && Array.isArray(p?.output?.results)) {
                  for (const r of p.output.results.slice(0, 3)) {
                    const model = String(r?.model ?? '');
                    if (model && !airCurtainRecs.includes(model)) airCurtainRecs.push(model);
                  }
                }
              }
              // Keep only the LAST call of each selection tool in a message —
              // the model sometimes fires the same selection twice with slightly
              // different inputs, which previously rendered duplicate cards.
              const lastKeyOnly = (type: string, prefix: string) => {
                let last: string | null = null;
                (m.parts as any[]).forEach((p, idx) => {
                  if (p?.type === type) last = `${prefix}${m.id}-${idx}`;
                });
                return last ? [last] : [];
              };
              const collectKeys = (type: string, prefix: string) => {
                const seen = new Set<string>();
                const keys: string[] = [];
                (m.parts as any[]).forEach((p, idx) => {
                  if (p?.type !== type) return;
                  const sig = JSON.stringify(p?.input ?? p?.args ?? idx);
                  if (seen.has(sig)) return;
                  seen.add(sig);
                  keys.push(`${prefix}${m.id}-${idx}`);
                });
                return keys;
              };
              const autoKeys = lastKeyOnly('tool-prepare_datasheet', '');
              const hasAuto = autoKeys.some((k) => (autoSelections[k]?.results?.length ?? 0) > 0);
              const acAutoKeys = lastKeyOnly('tool-prepare_air_curtain_datasheet', 'ac-');
              const hasAcAuto = acAutoKeys.some(
                (k) => (acAutoSelections[k]?.results?.length ?? 0) > 0,
              );
              const scheduleKeys = lastKeyOnly('tool-prepare_schedule_selection', 'sch-');

              return (
                <div key={m.id} className={`flex gap-2 sm:gap-3 ${isUser ? 'justify-end' : ''}`}>
                  {!isUser && (
                    <div className="hidden sm:flex w-8 h-8 rounded-lg bg-primary/10 items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[92%] sm:max-w-[85%] min-w-0 space-y-2 ${isUser ? 'order-first' : ''}`}>
                    {!isUser && tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground">
                          <Wrench className="w-3 h-3" />
                          Checked KINAIR data
                        </span>
                      </div>
                    )}

                    {text && (
                      <div
                        className={`rounded-xl px-4 py-3 text-sm ${
                          isUser
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{text}</p>
                        ) : (
                          <div className="prose prose-sm dark:prose-invert max-w-none prose-table:text-xs prose-headings:mt-3 prose-p:my-2">
                            <ReactMarkdown>{text}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    )}
                    {!isUser &&
                      autoKeys.map((key) => {
                        const auto = autoSelections[key];
                        if (!auto) {
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 text-xs text-muted-foreground pt-1"
                            >
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Running the selection engine…
                            </div>
                          );
                        }
                        if (auto.results.length === 0) {
                          return (
                            <div
                              key={key}
                              className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground space-y-1"
                            >
                              <p className="font-semibold">No selection available</p>
                              <p className="text-muted-foreground">
                                No {auto.duty.fan_type === 'wall_mounted' ? 'wall mounted (KIN-E)' : auto.duty.series_name ? `${auto.duty.series_name} ` : ''}model
                                can meet {auto.duty.airflow} {auto.duty.airflow_unit} @ {auto.duty.static_pressure}{' '}
                                {auto.duty.pressure_unit}. Please change the duty or ask for a different series.
                              </p>
                            </div>
                          );
                        }
                        const best = auto.results[0];
                        const alternatives = auto.results.slice(1, 4);
                        return (
                          <div
                            key={key}
                            className="rounded-xl border border-border bg-card p-3 space-y-3"
                          >
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Optimum selection ·{' '}
                                {FAN_OPTIMIZE_LABEL[auto.duty.optimize_for ?? 'balanced']}
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                {best.nomenclature}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {Math.round(best.operatingPoint.airflow).toLocaleString()} m³/h @{' '}
                                {Math.round(best.operatingPoint.staticPressure)} Pa ·{' '}
                                {best.operatingPoint.shaftPower.toFixed(3)} kW absorbed ·{' '}
                                {best.motorRating} kW motor ·{' '}
                                {best.operatingPoint.efficiency
                                  ? `${best.operatingPoint.efficiency.toFixed(1)}% eff`
                                  : '—'}
                                {best.noiseData?.overall
                                  ? ` · ${Math.round(best.noiseData.overall)} dB(A) Lw`
                                  : ''}
                              </p>
                            </div>
                            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
                              <Button
                                size="sm"
                                className="w-full sm:w-auto justify-center"
                                onClick={() => downloadDatasheet(key, best, 'full')}
                                disabled={downloadingKey === key}
                              >
                                {downloadingKey === key ? (
                                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                ) : (
                                  <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                Datasheet PDF
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full sm:w-auto justify-center"
                                onClick={() => downloadDatasheet(key, best, 'drawing')}
                                disabled={downloadingKey === key}
                              >
                                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                Drawing only
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full sm:w-auto justify-center"
                                onClick={() => downloadDatasheet(key, best, 'noise')}
                                disabled={downloadingKey === key}
                              >
                                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                Noise data only
                              </Button>
                              {alternatives.map((alt, i) => (
                                <Button
                                  key={`${key}-alt-${i}`}
                                  size="sm"
                                  variant="outline"
                                  className="w-full sm:w-auto justify-center"
                                  onClick={() => downloadDatasheet(key, alt)}
                                  disabled={downloadingKey === key}
                                >
                                  <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                  {alt.nomenclature}
                                </Button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    {!isUser &&
                      acAutoKeys.map((key) => {
                        const auto = acAutoSelections[key];
                        if (!auto) {
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 text-xs text-muted-foreground pt-1"
                            >
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Running the air curtain selection…
                            </div>
                          );
                        }
                        if (auto.results.length === 0) {
                          return (
                            <p key={key} className="text-xs text-muted-foreground pt-1">
                              No air curtain in the catalogue suits this opening.
                            </p>
                          );
                        }
                        const best = auto.results[0];
                        const alternatives = auto.results.slice(1, 4);
                        return (
                          <div
                            key={key}
                            className="rounded-xl border border-border bg-card p-3 space-y-3"
                          >
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Optimum air curtain · {AC_OPTIMIZE_LABEL[auto.optimizeFor]}
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                {best.arrangement}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {Math.round(best.totalAirVolumeCmh).toLocaleString()} m³/h ·{' '}
                                {best.outletVelocity.toFixed(1)} m/s outlet ·{' '}
                                {best.floorVelocity.toFixed(1)} m/s at floor ·{' '}
                                {Math.round(best.totalPowerW)} W
                                {best.noiseDb ? ` · ${Math.round(best.noiseDb)} dB(A)` : ''}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Opening {Math.round(auto.doorWidthMm)} mm wide ×{' '}
                                {auto.doorHeightM} m high · {Math.round(best.matchPercent)}% coverage
                              </p>
                            </div>
                            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
                              <Button
                                size="sm"
                                className="w-full sm:w-auto justify-center"
                                onClick={() => downloadAcDatasheet(key, best, auto, 'full')}
                                disabled={acDownloadingKey === key}
                              >
                                {acDownloadingKey === key ? (
                                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                ) : (
                                  <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                Datasheet PDF
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full sm:w-auto justify-center"
                                onClick={() => downloadAcDatasheet(key, best, auto, 'drawing')}
                                disabled={acDownloadingKey === key}
                              >
                                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                Drawing only
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full sm:w-auto justify-center"
                                onClick={() => downloadAcDatasheet(key, best, auto, 'noise')}
                                disabled={acDownloadingKey === key}
                              >
                                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                Noise data only
                              </Button>
                              {alternatives.map((alt, i) => (
                                <Button
                                  key={`${key}-alt-${i}`}
                                  size="sm"
                                  variant="outline"
                                  className="w-full sm:w-auto justify-center"
                                  onClick={() => downloadAcDatasheet(key, alt, auto)}
                                  disabled={acDownloadingKey === key}
                                >
                                  <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                  {alt.model.model}
                                </Button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    {!isUser &&
                      scheduleKeys.map((key) => {
                        const sched = scheduleResults[key];
                        if (!sched) {
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 text-xs text-muted-foreground pt-1"
                            >
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Selecting every line of the schedule…
                            </div>
                          );
                        }
                        const selected = sched.rows.filter((r) => r.selection);
                        return (
                          <div
                            key={key}
                            className="rounded-xl border border-border bg-card p-3 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div>
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  <ListChecks className="w-3 h-3 inline mr-1" />
                                  {sched.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {selected.length} of {sched.rows.length} lines selected
                                </p>
                              </div>
                              {selected.length > 0 && (
                                <Button
                                  size="sm"
                                  onClick={() => downloadAllSchedule(key)}
                                  disabled={scheduleBusyKey === key}
                                >
                                  {scheduleBusyKey === key ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                  ) : (
                                    <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                  )}
                                  Download combined PDF
                                </Button>
                              )}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="py-1 pr-2 font-medium">Tag</th>
                                    <th className="py-1 pr-2 font-medium">Duty</th>
                                    <th className="py-1 pr-2 font-medium">Selection</th>
                                    <th className="py-1 pr-2 font-medium">Qty</th>
                                    <th className="py-1 font-medium" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {sched.rows.map((row, i) => (
                                    <tr key={`${key}-row-${i}`} className="border-t border-border/60">
                                      <td className="py-1.5 pr-2 whitespace-nowrap font-medium text-foreground">
                                        {row.tag}
                                      </td>
                                      <td className="py-1.5 pr-2 text-muted-foreground">{row.duty}</td>
                                      <td className="py-1.5 pr-2">
                                        {row.selection ? (
                                          <span className="text-foreground font-medium">{row.label}</span>
                                        ) : (
                                          <span className="text-muted-foreground">{row.label}</span>
                                        )}
                                        {row.detail && (
                                          <span className="block text-[11px] text-muted-foreground">
                                            {row.detail}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-2 text-muted-foreground">{row.quantity}</td>
                                      <td className="py-1.5 text-right">
                                        {row.selection && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2"
                                            onClick={() => downloadScheduleRow(key, row)}
                                            disabled={scheduleBusyKey === key}
                                          >
                                            <FileDown className="w-3 h-3 mr-1" />
                                            PDF
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    {!isUser && !hasAuto && recs.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] text-muted-foreground">
                          Open a model to see full curves and download its datasheet PDF:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {recs.map((r) => (
                            <Button
                              key={r.model}
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                navigate(
                                  `/selector?airflow=${Math.round(r.airflow)}&pressure=${Math.round(
                                    r.pressure,
                                  )}&model=${encodeURIComponent(r.model)}`,
                                )
                              }
                            >
                              <FileDown className="w-3.5 h-3.5 mr-1.5" />
                              {r.model} datasheet
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!isUser && !hasAcAuto && airCurtainRecs.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] text-muted-foreground">
                          Open a model in the Air Curtain Selector to see coverage and its datasheet:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {airCurtainRecs.map((model) => (
                            <Button
                              key={model}
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/air-curtain?model=${encodeURIComponent(model)}`)}
                            >
                              <FileDown className="w-3.5 h-3.5 mr-1.5" />
                              {model} air curtain
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {isUser && (
                    <div className="hidden sm:flex w-8 h-8 rounded-lg bg-muted items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Working on it…
              </div>
            )}
            {error && (
              <div className="flex items-center gap-3 text-sm text-destructive">
                <p>
                  {error.message && error.message !== 'An error occurred.'
                    ? error.message
                    : 'The connection was interrupted — your selection is still shown above.'}
                </p>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:opacity-80"
                  onClick={() => {
                    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                    const text = lastUser?.parts
                      ?.filter((p: any) => p?.type === 'text')
                      .map((p: any) => p.text)
                      .join(' ');
                    if (text) sendMessage({ text });
                  }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground"
                  >
                    <Paperclip className="w-3 h-3" />
                    {f.name}
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, x) => x !== i))}
                      className="hover:text-destructive"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xlsm,.xls,.csv,image/*"
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  const good = picked.filter(isReadableAttachment);
                  if (good.length !== picked.length) {
                    toast.error('Only PDF, image or Excel/CSV schedules can be attached.');
                  }
                  setAttachments((prev) => [...prev, ...good].slice(0, 5));
                  e.target.value = '';
                }}
              />
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                title="Attach a schedule (PDF, image or Excel)"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoGrowInput();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Ask a duty, or attach a schedule…"
                rows={1}
                className="resize-none text-base sm:text-sm min-h-[60px] sm:min-h-[44px] max-h-40 overflow-y-auto py-3 flex-1"
              />
              <Button
                onClick={() => void send(input)}
                disabled={busy || (!input.trim() && attachments.length === 0)}
                size="icon"
                className="h-11 w-11 flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="hidden sm:block text-[11px] text-muted-foreground mt-2">
              Attach a schedule and every line is selected at once. Recommendations come from your live
              catalogue data — always verify the final selection before issuing a submittal.
            </p>
            <p className="sm:hidden text-[11px] text-muted-foreground mt-2">
              Always verify the final selection before issuing a submittal.
            </p>
          </div>

        </Card>
  );
}
