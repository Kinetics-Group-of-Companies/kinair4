import { supabase } from "@/integrations/backend/client";
import type { AssistantScheduleItem } from "./selector-tds";
import { spreadsheetToText, isSpreadsheet, isPdf, pdfToText, pdfToImages, imageFileToDataUrl, toBase64Payload } from "@/lib/chatSchedule";

type ToolEvent = { type?: string; toolName?: string; input?: unknown; args?: unknown; toolCallId?: string; inputText?: string; delta?: string };
const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function toItems(event: ToolEvent): { items: AssistantScheduleItem[]; optimizeFor?: string } | null {
  const input = asObject(event.input ?? event.args);
  if (!input) return null;
  if (event.toolName === "prepare_schedule_selection" && Array.isArray(input.items)) {
    const items = input.items.filter((item): item is AssistantScheduleItem =>
      !!item && typeof item === "object" && ["fan", "air_curtain"].includes((item as AssistantScheduleItem).product));
    return items.length ? { items, optimizeFor: typeof input.optimize_for === "string" ? input.optimize_for : undefined } : null;
  }
  if (event.toolName === "prepare_datasheet")
    return { items: [{ ...input, product: "fan" } as AssistantScheduleItem], optimizeFor: typeof input.optimize_for === "string" ? input.optimize_for : undefined };
  if (event.toolName === "prepare_air_curtain_datasheet")
    return { items: [{ ...input, product: "air_curtain" } as AssistantScheduleItem], optimizeFor: typeof input.optimize_for === "string" ? input.optimize_for : undefined };
  return null;
}

type SelectionAssistantScheduleResult = { items: AssistantScheduleItem[]; provider: string; optimizeFor?: string };

function sanitizeScheduleItems(schedule: string, items: AssistantScheduleItem[]): AssistantScheduleItem[] {
  const explicitAirCurtain = /\bair[\s-]*curtains?\b|\bN[\s-]*(?:Cross\s*Flow|Centrifugal\s*Flow)\b|\bXD[\s-]*Centrifugal\s*Flow\b|\bFM[\s._-]*\d{4}(?:XD|N|[\s._-]*L)\b/i.test(schedule);
  const explicitFan = /\bKVF[\s-]*\d{2,4}(?:MR|M|P)\b|\bKVF[\s-]*(?:MR|M|P)\b|\bKIN[\s-]*\d{2,4}E\b|\bKIN[\s-]*E\b|\bKTAF\b|\bfan\s+schedule\b/i.test(schedule);

  // Deterministic model/series nomenclature overrides an AI family label.
  // This prevents an Air Curtain row being treated as Fan merely because the
  // source document contains words such as "fan motor" or "fan speed".
  const corrected = items.map((item) => {
    const authority = `${item.series_name ?? ""} ${item.existing_selection ?? ""}`;
    if (/\bFM[\s._-]*\d{4}(?:XD|N|[\s._-]*L)\b|\b(?:N[\s-]*(?:Cross\s*Flow|Centrifugal\s*Flow)|XD[\s-]*Centrifugal\s*Flow)\b/i.test(authority)) {
      return { ...item, product: "air_curtain" as const };
    }
    if (/\bKVF[\s._-]*\d{2,4}(?:MR|M|P)\b|\bKIN[\s._-]*\d{2,4}E\b|\bKTAF\b/i.test(authority)) {
      return { ...item, product: "fan" as const };
    }
    return item;
  });

  // "ACU" is not evidence of an air curtain. When exact schedule evidence says
  // only one family, discard hallucinated rows from the other family.
  if (explicitFan && !explicitAirCurtain) return corrected.filter((item) => item.product === "fan");
  if (explicitAirCurtain && !explicitFan) return corrected.filter((item) => item.product === "air_curtain");
  return corrected;
}

async function streamSelectionAssistant(
  parts: any[],
  scheduleHint: string,
  aiMode: string,
  allowNonSchedule: boolean,
): Promise<SelectionAssistantScheduleResult | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to use the selection assistant.");
  const controller = new AbortController();
  // This signal covers both connection setup AND the streamed tool response.
  // Schedule extraction commonly takes longer than the former 5–8 second limit.
  const requestTimeoutMs = allowNonSchedule ? 20000 : 120000;
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        aiMode,
        forceScheduleTool: !allowNonSchedule,
        messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "SUBMITTAL DOCUMENT EXTRACTION: Set source_has_proposed=true when the source has a proposed/offered selection. Copy ALL supplied proposed values into proposed with printed units, including airflow, esp, power, electrical, length, installation_height, velocity, fan_rpm and motor_rpm. Missing proposed cells stay null: never fill from a catalogue, specified requirement or calculation. Motor RPM is not fan RPM: extract separately, never infer one from the other or from poles/frequency. For inquiry speed requirements use motor_rpm and fan_rpm separately. copy every supplied model into existing_selection exactly, including suffixes and quantities in multi-unit arrangements. Never reselect, correct, replace or optimize a printed model. Preserve row order, tags and quantities. Copy technical remarks and accessories verbatim from the source row; do not paraphrase or add interpretations, extraction notes, compliance claims, or model-selection reasoning. If no source remarks exist, leave remarks empty. Electrical fields must contain the printed voltage/phase/frequency rating only, never column-heading text or repeated units. If a model is unclear, report it as unclear rather than guessing. Only rows without a supplied model may need selection." }, ...parts] }],
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Selection Assistant returned HTTP ${response.status}.`);
    const provider = [response.headers.get("X-KINAIR-AI-Provider"), response.headers.get("X-KINAIR-AI-Model")].filter(Boolean).join(" · ");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const deltas = new Map<string, string>();
    let buffer = "";
    const processLine = (line: string): { items: AssistantScheduleItem[]; optimizeFor?: string } | null => {
      if (!line.startsWith("data: ")) return null;
      try {
        const event = JSON.parse(line.slice(6)) as ToolEvent;
        if (event.type === "tool-input-delta" && event.toolCallId) {
          deltas.set(event.toolCallId, (deltas.get(event.toolCallId) ?? "") + (event.inputText ?? event.delta ?? ""));
        }
        const direct = toItems(event);
        if (direct) return direct;
        if (event.type === "tool-input-available" && event.toolCallId) {
          const partial = deltas.get(event.toolCallId);
          if (partial) return toItems({ ...event, input: JSON.parse(partial) });
        }
      } catch { /* next protocol frame may contain complete tool input */ }
      return null;
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        const selection = processLine(line);
        if (selection) {
          void reader.cancel();
          const items = sanitizeScheduleItems(scheduleHint, selection.items);
          return items.length ? { ...selection, items, provider } : null;
        }
      }
    }
    // Providers may close the stream without a trailing newline.
    const finalSelection = processLine((buffer + decoder.decode()).trim());
    if (finalSelection) {
      const items = sanitizeScheduleItems(scheduleHint, finalSelection.items);
      return items.length ? { ...finalSelection, items, provider } : null;
    }
    return null;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Selection Assistant timed out while reading the schedule. Please retry or split a large schedule into smaller files.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function callSelectionAssistantScheduleOnce(
  schedule: string,
  userRequest: string,
  aiMode: string,
  allowNonSchedule: boolean,
  forceVision = false,
): Promise<SelectionAssistantScheduleResult | null> {
  const intro = userRequest.trim() || "Read every technical fan/air-curtain line item from this schedule, quotation or technical offer. Validate each item from its specified parameters and remarks; preserve every printed model and quantity exactly.";
  const prompt = [
    intro,
    "📎 Attached: engineering source document",
    "<<<KINAIR_BACKGROUND_SCHEDULE_DATA>>>",
    schedule.slice(0, 18000),
  ].join("\n\n");
  return streamSelectionAssistant([{ type: "text", text: prompt }], schedule, aiMode, allowNonSchedule);
}


async function callSelectionAssistantSchedule(
  schedule: string,
  userRequest: string,
  aiMode: string,
  allowNonSchedule: boolean,
): Promise<SelectionAssistantScheduleResult | null> {
  // The Edge Function already performs automatic provider routing/fallback.
  // Do one request only; repeating the same schedule across providers made
  // mobile Submittal AI unnecessarily slow and sometimes produced conflicting rows.
  const mode = aiMode === "local" || aiMode === "standard" ? "auto" : aiMode;
  try {
    const result = await callSelectionAssistantScheduleOnce(schedule, userRequest, mode, allowNonSchedule);
    if (result) return result;
    if (allowNonSchedule) return null;
  } catch (error) {
    if (allowNonSchedule) return null;
    if (error instanceof Error) throw error;
  }
  throw new Error("Selection Assistant could not read the schedule rows.");
}

async function callSelectionAssistantAttachmentOnce(
  file: File,
  userRequest: string,
  aiMode: string,
  allowNonSchedule: boolean,
  forceVision = false,
): Promise<SelectionAssistantScheduleResult | null> {
  const intro = userRequest.trim() || "Here is a schedule. Please select a model for every line and give me the datasheets.";
  const label = `📎 Attached: ${file.name}`;
  const parts: any[] = [];
  let scheduleHint = "";

  if (isSpreadsheet(file)) {
    scheduleHint = await spreadsheetToText(file);
    parts.push({ type: "text", text: [intro, label, "<<<KINAIR_BACKGROUND_SCHEDULE_DATA>>>", scheduleHint].join("\n\n") });
  } else if (isPdf(file)) {
    let extracted = "";
    try { extracted = await pdfToText(file); } catch { extracted = ""; }
    scheduleHint = extracted;
    if (!forceVision && extracted.replace(/[^a-z0-9]/gi, "").length > 80) {
      parts.push({ type: "text", text: [intro, label, "<<<KINAIR_BACKGROUND_SCHEDULE_DATA>>>", extracted].join("\n\n") });
    } else {
      parts.push({ type: "text", text: [intro, label].join("\n") });
      const images = await pdfToImages(file);
      if (!images.length) throw new Error("Selection Assistant could not render this PDF.");
      images.forEach((url, index) => parts.push({
        type: "file",
        mediaType: "image/png",
        filename: `${file.name}-page-${index + 1}.png`,
        url: toBase64Payload(url),
      }));
    }
  } else if (file.type.startsWith("image/")) {
    parts.push({ type: "text", text: [intro, label].join("\n") });
    parts.push({
      type: "file",
      mediaType: "image/jpeg",
      filename: file.name,
      url: toBase64Payload(await imageFileToDataUrl(file)),
    });
  } else {
    scheduleHint = await file.text();
    parts.push({ type: "text", text: [intro, label, "<<<KINAIR_BACKGROUND_SCHEDULE_DATA>>>", scheduleHint].join("\n\n") });
  }

  return streamSelectionAssistant(parts, scheduleHint, aiMode, allowNonSchedule);
}

async function callSelectionAssistantAttachment(
  file: File,
  userRequest: string,
  aiMode: string,
  allowNonSchedule: boolean,
  forceVision = false,
): Promise<SelectionAssistantScheduleResult | null> {
  const mode = aiMode === "local" || aiMode === "standard" ? "auto" : aiMode;
  try {
    const result = await callSelectionAssistantAttachmentOnce(file, userRequest, mode, allowNonSchedule, forceVision);
    if (result) return result;
    if (allowNonSchedule) return null;
  } catch (error) {
    if (allowNonSchedule) return null;
    if (error instanceof Error) throw error;
  }
  throw new Error("Selection Assistant could not read the attached schedule.");
}

export async function probeSelectionAssistantAttachment(
  file: File,
  aiMode: string,
): Promise<SelectionAssistantScheduleResult | null> {
  return callSelectionAssistantAttachment(
    file,
    "Classify this attachment by content. If it contains fan or air-curtain technical line items — including inside a quotation or technical offer — call the schedule-selection tool for every equipment row. Ignore prices, amounts, discounts, VAT/tax, delivery/payment/warranty/commercial terms. Preserve technical remarks, exact printed models and quantities. Never substitute or optimize supplied models.",
    aiMode,
    true,
  );
}

export async function readSelectionAssistantAttachment(
  file: File,
  userRequest: string,
  aiMode: string,
  forceVision = false,
): Promise<SelectionAssistantScheduleResult> {
  const result = await callSelectionAssistantAttachment(file, userRequest, aiMode, false, forceVision);
  if (!result) throw new Error("Selection Assistant could not read the attached schedule.");
  return result;
}

/** Calls the same AI schedule-reading tool used by the Fan/Air Curtain Selection Assistant. */
export async function readSelectionAssistantSchedule(
  schedule: string, userRequest: string, aiMode: string,
): Promise<SelectionAssistantScheduleResult> {
  const result = await callSelectionAssistantSchedule(schedule, userRequest, aiMode, false);
  if (!result) throw new Error("Selection Assistant could not read the schedule rows.");
  return result;
}

/** Content-first probe: filenames are ignored; OCR/text decides whether the file is a schedule. */
export async function probeSelectionAssistantSchedule(
  extractedText: string, aiMode: string,
): Promise<SelectionAssistantScheduleResult | null> {
  return callSelectionAssistantSchedule(
    extractedText,
    "Classify this document by content, not filename. Use the schedule-selection tool when it contains fan or air-curtain technical rows, even if the document is a quotation/offer rather than a document titled schedule. Ignore all commercial pricing/terms.",
    aiMode,
    true,
  );
}
