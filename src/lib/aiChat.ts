import { AI_TOOLS, STYLE_EXAMPLE_TURNS, buildSystemPrompt, executeAiTool, type AiChatContext, type AiTone } from "./aiTools";
import type { AnniversaryCatKind } from "../components/AnniversaryCat";
export type { AiTone } from "./aiTools";

export type AiProvider = "gemini" | "nvidia" | "openai";

export interface AiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: AiToolCall[];
  /** Follow-up questions parsed out of the model's trailing suggestions marker. */
  suggestions?: string[];
}

export interface AiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /**
   * Gemini requires its own tool-call thought_signature to be echoed back verbatim
   * in the next turn's history, or it rejects the request with a 400. Other
   * providers don't set this, so it's simply absent for them.
   */
  extra_content?: unknown;
}

export interface AiChatMeta {
  provider: string;
  model: string;
}

const CHAT_STORAGE_KEY = "alba-ai-chat";
const PROVIDER_STORAGE_KEY = "alba-ai-provider";
const MASCOT_STORAGE_KEY = "alba-active-mascot";
const MASCOT_TONES_STORAGE_KEY = "alba-mascot-tones";
const HISTORY_LIMIT = 20;
const HISTORY_KEEP_RECENT = 10;
const MAX_TOOL_LOOPS = 4;

export interface StoredChat {
  messages: AiChatMessage[];
  synopsis?: string;
  createdAt: string;
}

export function loadStoredChat(): StoredChat {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return { messages: [], createdAt: new Date().toISOString() };
    const parsed = JSON.parse(raw) as Partial<StoredChat>;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      synopsis: typeof parsed.synopsis === "string" ? parsed.synopsis : undefined,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return { messages: [], createdAt: new Date().toISOString() };
  }
}

export function saveStoredChat(chat: StoredChat): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chat));
  } catch {
    // Storage full or unavailable: memory just won't persist across reloads.
  }
}

export function clearStoredChat(): void {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

export function loadProviderPreference(): AiProvider | null {
  try {
    const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
    return stored === "gemini" || stored === "nvidia" || stored === "openai" ? stored : null;
  } catch {
    return null;
  }
}

export function saveProviderPreference(provider: AiProvider | null): void {
  try {
    if (provider) localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
    else localStorage.removeItem(PROVIDER_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

const MASCOT_KINDS: AnniversaryCatKind[] = ["black", "siamese", "orange", "tuxedo"];

function isMascotKind(value: unknown): value is AnniversaryCatKind {
  return typeof value === "string" && (MASCOT_KINDS as string[]).includes(value);
}

function isAiTone(value: unknown): value is AiTone {
  return value === "alegre" || value === "suave" || value === "directo" || value === "tecnico";
}

export const MASCOT_NAMES: Record<AnniversaryCatKind, string> = {
  black: "Noche",
  siamese: "Luna",
  orange: "Mandarino",
  tuxedo: "Frac",
};

// Each mascot starts with its own personality, but every tone stays fully
// reassignable per mascot from the chat header.
const DEFAULT_MASCOT_TONES: Record<AnniversaryCatKind, AiTone> = {
  black: "suave",
  siamese: "tecnico",
  orange: "alegre",
  tuxedo: "directo",
};

export function loadActiveMascot(): AnniversaryCatKind {
  try {
    const stored = localStorage.getItem(MASCOT_STORAGE_KEY);
    return isMascotKind(stored) ? stored : "black";
  } catch {
    return "black";
  }
}

export function saveActiveMascot(kind: AnniversaryCatKind): void {
  try {
    localStorage.setItem(MASCOT_STORAGE_KEY, kind);
  } catch {
    // Ignore storage errors.
  }
}

export function loadMascotTones(): Record<AnniversaryCatKind, AiTone> {
  const tones = { ...DEFAULT_MASCOT_TONES };
  try {
    const raw = localStorage.getItem(MASCOT_TONES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    for (const kind of MASCOT_KINDS) {
      if (isAiTone(parsed?.[kind])) tones[kind] = parsed[kind];
    }
  } catch {
    // Fall back to the defaults above.
  }
  return tones;
}

export function saveMascotTone(kind: AnniversaryCatKind, tone: AiTone): void {
  try {
    const tones = loadMascotTones();
    tones[kind] = tone;
    localStorage.setItem(MASCOT_TONES_STORAGE_KEY, JSON.stringify(tones));
  } catch {
    // Ignore storage errors.
  }
}

interface RunChatTurnOptions {
  provider: AiProvider | null;
  onDelta?: (textSoFar: string) => void;
  onMeta?: (meta: AiChatMeta) => void;
  signal?: AbortSignal;
}

export interface ChatTurnResult {
  content: string;
  suggestions: string[];
}

const SUGGESTIONS_MARKER_PATTERN = /<!--\s*suggestions:\s*([\s\S]*?)-->/i;
// Weaker models occasionally emit a stray "-->" right before the real marker
// (as if they'd started, then restarted, the comment); clean that up too.
const TRAILING_COMMENT_DEBRIS_PATTERN = /(<!--)?\s*-->\s*$/;

function extractSuggestions(content: string): ChatTurnResult {
  const match = content.match(SUGGESTIONS_MARKER_PATTERN);
  if (!match) return { content: content.trim(), suggestions: [] };
  const suggestions = match[1]
    .split("|")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
  const before = content.slice(0, match.index).replace(TRAILING_COMMENT_DEBRIS_PATTERN, "");
  return { content: before.trim(), suggestions };
}

export async function runChatTurn(
  history: AiChatMessage[],
  synopsis: string | undefined,
  context: AiChatContext,
  options: RunChatTurnOptions,
): Promise<ChatTurnResult> {
  const systemMessage: AiChatMessage = {
    role: "system",
    content: synopsis ? `${buildSystemPrompt(context)}\n\nResumen de la conversación previa:\n${synopsis}` : buildSystemPrompt(context),
  };

  const messages: AiChatMessage[] = [systemMessage, ...STYLE_EXAMPLE_TURNS.map((turn) => ({ ...turn })), ...history];
  let metaReported = false;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    const isLastLoop = loop === MAX_TOOL_LOOPS - 1;
    const { message, meta } = await streamChatOnce(messages, isLastLoop ? [] : AI_TOOLS, options);

    if (!metaReported && options.onMeta) {
      options.onMeta(meta);
      metaReported = true;
    }

    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return extractSuggestions(message.content);
    }

    for (const toolCall of message.tool_calls) {
      const result = executeAiTool(toolCall.function.name, toolCall.function.arguments, context);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result ?? {}),
      });
    }
  }

  return { content: "No pude terminar de pensar la respuesta, ¿puedes intentar de nuevo?", suggestions: [] };
}

async function streamChatOnce(
  messages: AiChatMessage[],
  tools: typeof AI_TOOLS,
  options: RunChatTurnOptions,
): Promise<{ message: AiChatMessage; meta: AiChatMeta }> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      messages: messages.map(({ role, content, tool_call_id, tool_calls }) => ({ role, content, tool_call_id, tool_calls })),
      tools: tools.length ? tools : undefined,
      provider: options.provider ?? undefined,
    }),
  });

  const meta: AiChatMeta = {
    provider: response.headers.get("X-Alba-Provider") ?? "desconocido",
    model: response.headers.get("X-Alba-Model") ?? "desconocido",
  };

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(data.error ?? "No se pudo hablar con Alba.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCallsByIndex = new Map<number, AiToolCall>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice("data:".length).trim();
      if (payload === "[DONE]") continue;

      let parsed: any;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        content += delta.content;
        options.onDelta?.(content);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index ?? 0;
          const existing = toolCallsByIndex.get(index) ?? { id: "", type: "function", function: { name: "", arguments: "" } };
          if (toolCallDelta.id) existing.id = toolCallDelta.id;
          if (toolCallDelta.function?.name) existing.function.name += toolCallDelta.function.name;
          if (toolCallDelta.function?.arguments) existing.function.arguments += toolCallDelta.function.arguments;
          if (toolCallDelta.extra_content !== undefined) existing.extra_content = toolCallDelta.extra_content;
          toolCallsByIndex.set(index, existing);
        }
      }
    }
  }

  const toolCalls = Array.from(toolCallsByIndex.values()).filter((call) => call.function.name);

  return {
    message: {
      role: "assistant",
      content,
      tool_calls: toolCalls.length ? toolCalls : undefined,
    },
    meta,
  };
}

/**
 * Fire a minimal, invisible request so the serverless function and the
 * provider connection are already warm by the time the user sends a real
 * message. Best-effort only: failures here must never surface to the user.
 */
export async function prewarmChat(context: AiChatContext, provider: AiProvider | null): Promise<void> {
  try {
    const systemMessage: AiChatMessage = { role: "system", content: buildSystemPrompt(context) };
    const pingMessage: AiChatMessage = { role: "user", content: "ping" };
    await streamChatOnce([systemMessage, pingMessage], [], { provider });
  } catch {
    // Ignore: this is only meant to shave latency off the first real message.
  }
}

export async function summarizeOlderMessages(
  older: AiChatMessage[],
  existingSynopsis: string | undefined,
  context: AiChatContext,
  provider: AiProvider | null,
): Promise<string> {
  const transcript = older
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role === "user" ? "Usuario" : "Alba"}: ${message.content}`)
    .join("\n");

  const summarizationMessages: AiChatMessage[] = [
    {
      role: "system",
      content: [
        "Resume la conversación en español en máximo 6 líneas, conservando fechas, preferencias y datos relevantes mencionados.",
        "No inventes información nueva. No uses listas, solo prosa breve.",
      ].join(" "),
    },
    {
      role: "user",
      content: existingSynopsis ? `Resumen previo:\n${existingSynopsis}\n\nConversación a incorporar:\n${transcript}` : transcript,
    },
  ];

  const { message } = await streamChatOnce(summarizationMessages, [], { provider });
  return message.content.trim();
}

export function trimHistoryForModel(chat: StoredChat): { history: AiChatMessage[]; synopsis: string | undefined } {
  if (chat.messages.length <= HISTORY_LIMIT) {
    return { history: chat.messages, synopsis: chat.synopsis };
  }
  return { history: chat.messages.slice(-HISTORY_KEEP_RECENT), synopsis: chat.synopsis };
}

export function needsSummarization(chat: StoredChat): boolean {
  return chat.messages.length > HISTORY_LIMIT;
}

export function historyToSummarize(chat: StoredChat): AiChatMessage[] {
  return chat.messages.slice(0, chat.messages.length - HISTORY_KEEP_RECENT);
}

export function applySummary(chat: StoredChat, synopsis: string): StoredChat {
  return { ...chat, synopsis, messages: chat.messages.slice(-HISTORY_KEEP_RECENT) };
}
