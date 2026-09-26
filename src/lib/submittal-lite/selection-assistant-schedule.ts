import { supabase } from "@/integrations/backend/client";
import type { AssistantScheduleItem } from "./selector-tds";

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

async function callSelectionAssistantSchedule(
  schedule: string,
  userRequest: string,
  aiMode: string,
  allowNonSchedule: boolean,
): Promise<SelectionAssistantScheduleResult | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to use the selection assistant.");
  const prompt = [
    allowNonSchedule
      ? "Inspect the attached extracted/OCR text exactly as the KINAIR fan and air curtain Selection Assistant would. If it is a fan or air-curtain material/equipment/selection schedule, call prepare_schedule_selection once for ALL readable schedule rows. If it is NOT a schedule, do not call any selection tool."
      : "Read the attached material schedule exactly as the KINAIR fan and air curtain Selection Assistant does.",
    "When it is a schedule, preserve every readable row in original order with tag/reference, quantity, units, series/type and any exact selected model in existing_selection.",
    "Do not invent missing duties or models. The website will run the official KINAIR selectors and assemble the same combined datasheet PDF used by Selection Assistant.",
    userRequest,
    "<<<KINAIR_BACKGROUND_SCHEDULE_DATA>>>",
    schedule.slice(0, 18000),
  ].join("\n\n");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        aiMode: aiMode === "local" ? "auto" : aiMode,
        messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: prompt }] }],
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
      } catch { /* Ignore incomplete protocol frames; the next frame may contain the full tool input. */ }
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
        if (selection) { void reader.cancel(); return { ...selection, provider }; }
      }
    }
    if (allowNonSchedule) return null;
    throw new Error("Selection Assistant could not read the schedule rows.");
  } finally {
    window.clearTimeout(timeout);
  }
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
    "Classify this document by its content, not its filename. Only use the schedule tool when it really contains fan or air-curtain schedule rows.",
    aiMode,
    true,
  );
}
