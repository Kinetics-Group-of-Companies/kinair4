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
  type AirCurtainSelection,
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
  output?: DocOutput;
  optimize_for?: FanOptimizeFor;
};

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
  min_floor_velocity?: number | null;
  output?: DocOutput;
  optimize_for?: AcOptimizeFor;
};

type AcAutoSelection = {
  doorWidthMm: number;
  doorHeightM: number;
  minFloorVelocity: number;
  optimizeFor: AcOptimizeFor;
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


  motor_poles?: number | null;
  max_noise_db?: number | null;
  door_width?: number | null;
  door_width_unit?: AcLengthUnit;
  door_height?: number | null;
  door_height_unit?: AcLengthUnit;
  mounting?: AirCurtainCategory | 'any';
  motor_type?: AirCurtainMotorType | 'any';
  brand?: string | null;
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


export function AssistantChat({
  suggestions,
  context = 'general',
  heightClass = 'h-[65vh] min-h-[460px]',
}: {
  suggestions?: string[];
  context?: AssistantContext;
  heightClass?: string;
}) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [aiMode, setAiMode] = useState<AiMode>('auto');

  const [activeProvider, setActiveProvider] = useState('Automatic routing');
  const [availableModels, setAvailableModels] = useState<RegisteredAiModel[]>([]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void supabase.functions.invoke('ai-model-registry').then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data?.models)) return;
      setAvailableModels(data.models);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

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
          // Automatic mode spends from free -> cheap -> balanced -> premium.
          // A manual provider choice keeps that provider first, then crosses over.
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
                  ? economyLadder
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
          let lastFailure = '';

          for (const mode of fallbackModes) {
            try {
              const response = await fetch(input, {
                ...init,
                body: JSON.stringify({ ...originalBody, aiMode: mode }),
              });
              const provider = response.headers.get('X-KINAIR-AI-Provider');
              const model = response.headers.get('X-KINAIR-AI-Model');
              const body = await response.text();
              const streamFailed =
                !response.ok ||
                /"type"\s*:\s*"error"/i.test(body) ||
                /failed after \d+ attempts|quota exceeded|rate.?limit|resource_exhausted/i.test(body);
              const providerMismatch =
                expectedProvider[mode] != null && provider !== expectedProvider[mode];

              if (!streamFailed && !providerMismatch) {
                if (provider) setActiveProvider(model ? `${provider} · ${model}` : provider);
                return new Response(body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers,
                });
              }

              lastFailure = body;
              console.warn('KINAIR AI provider failed; trying fallback', {
                requestedMode: mode,
                actualProvider: provider,
                providerMismatch,
              });
            } catch (error) {
              lastFailure = error instanceof Error ? error.message : String(error);
              console.warn('KINAIR AI connection failed; trying fallback', {
                requestedMode: mode,
                error: lastFailure,
              });
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

  const { messages, sendMessage, status, error } = useChat({
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

        const mentionsPlastic = /\b(plastic|pvc|abs|polypropylene|polymer|pp)\b/i.test(userText);
        const mentionsMetal = /\b(metal|metallic|steel|galvanized|galvanised|gi)\b/i.test(userText);
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


        const results = findOptimalSelections(
          database,
          {
            requiredAirflow: duty.airflow,
            requiredPressure: duty.static_pressure,
            airflowUnit: (AIRFLOW_UNITS as any)[duty.airflow_unit] ? duty.airflow_unit : 'CMH',
            pressureUnit: (PRESSURE_UNITS as any)[duty.pressure_unit] ? duty.pressure_unit : 'Pa',
            seriesId: (series as any)?.id,
            motorPole: duty.motor_poles ?? undefined,
            dimensionsBySeriesAndSize: dimensionsMap,
            ...fanSelectorDefaults(database, series),
          },
          50,
        );


        const optimizeFor = duty.optimize_for ?? 'balanced';
        const ranked = optimizeFor === 'balanced' ? results : rankFanSelections(results, optimizeFor);
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

        const results = selectAirCurtains(acModels, {
          doorWidthMm,
          doorHeightM,
          category: effectiveMounting,
          speed: duty.speed ?? 'high',
          minNozzleVelocity: 0,
          minAirflowCmh,
          motorType: duty.motor_type ?? 'any',
          brand: brandMatch ?? 'any',
          seriesId: series?.id ?? 'any',
          allowCombinations: true,
          minFloorVelocity,
          supplyFrequencyHz: 50,
          minMatchPercent: AC_MIN_MATCH_PERCENT,
          maxMatchPercent: AC_MAX_MATCH_PERCENT,
          selectionBasis: minAirflowCmh > 0 && !duty.door_width ? 'airflow' : 'door',
        });

        const optimizeFor: AcOptimizeFor = duty.optimize_for ?? 'balanced';
        const ranked = optimizeFor === 'balanced' ? results : rankAirCurtains(results, optimizeFor);
        const auto: AcAutoSelection = {
          doorWidthMm,
          doorHeightM,
          minFloorVelocity,
          optimizeFor,
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
            const category: AirCurtainCategory | 'any' = (item.mounting as any) ?? 'any';
            const wanted = (item.series_name || '').trim().toLowerCase();
            const seriesMatch = wanted
              ? acSeries.find((s) => s.name.toLowerCase() === wanted) ||
                acSeries.find((s) => s.name.toLowerCase().includes(wanted))
              : undefined;
            // Mounting remains the hard filter even if schedule extraction
            // supplied a conflicting wall/recessed series name.
            const series =
              seriesMatch && (category === 'any' || seriesMatch.category === category)
                ? seriesMatch
                : undefined;

            const coreResults = selectAirCurtains(acModels, {
                doorWidthMm,
                doorHeightM,
                category,
                speed: 'high',
                minNozzleVelocity: 0,
                minAirflowCmh: 0,
                motorType: (item.motor_type as any) ?? 'any',
                brand: brandMatch ?? 'any',
                seriesId: series?.id ?? 'any',
                allowCombinations: true,
                minFloorVelocity: 2,
                supplyFrequencyHz: 50,
                minMatchPercent: AC_MIN_MATCH_PERCENT,
                maxMatchPercent: AC_MAX_MATCH_PERCENT,
                selectionBasis: 'door',
              });
            const results = acOptimize === 'balanced'
              ? coreResults
              : rankAirCurtains(coreResults, acOptimize);
            const best = results[0];
            if (!best) {
              return { tag, quantity, product: 'air_curtain', duty, label: 'No suitable model', detail: '' };
            }
            return {
              tag,
              quantity,
              product: 'air_curtain',
              duty,
              label: best.arrangement,
              detail: `${Math.round(best.totalAirVolumeCmh).toLocaleString()} m³/h · ${Math.round(
                best.totalPowerW,
              )} W${best.noiseDb ? ` · ${Math.round(best.noiseDb)} dB(A)` : ''}`,
              selection: { kind: 'air_curtain', selection: best, doorWidthMm, doorHeightM, minFloorVelocity: 2 },
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
