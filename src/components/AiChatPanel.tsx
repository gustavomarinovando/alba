import { Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applySummary,
  clearStoredChat,
  historyToSummarize,
  loadProviderPreference,
  loadStoredChat,
  needsSummarization,
  runChatTurn,
  saveStoredChat,
  summarizeOlderMessages,
  trimHistoryForModel,
  saveProviderPreference,
  type AiChatMessage,
  type AiChatMeta,
  type AiProvider,
  type StoredChat,
} from "../lib/aiChat";
import type { AiChatContext } from "../lib/aiTools";
import { isoDate } from "../lib/date";
import { renderMarkdown } from "../lib/markdown";
import type { PhaseDay } from "../lib/phases";
import type { AlbaAccountContext } from "../lib/supabaseAuth";
import type { StreakReward } from "../lib/streakRewards";
import type { CycleEntry, CycleObservationStreak, CycleStats } from "../types";

interface AiChatPanelProps {
  entries: CycleEntry[];
  stats: CycleStats;
  phaseByDate: Map<string, PhaseDay>;
  observationStreak: CycleObservationStreak;
  streakRewards: StreakReward[];
  accountContext: AlbaAccountContext | null;
}

const OWNER_CHIPS = ["Resumen de este ciclo", "¿Se ve el cambio térmico?", "¿Cómo viene mi próxima regla?"];
const PARTNER_CHIPS = ["¿Cómo apoyarla hoy?", "Explícame su fase actual", "Ideas de cuidado"];

const PROVIDER_LABEL: Record<string, string> = { gemini: "Gemini", nvidia: "NVIDIA", openai: "OpenAI" };

export default function AiChatPanel({ entries, stats, phaseByDate, observationStreak, streakRewards, accountContext }: AiChatPanelProps) {
  const [chat, setChat] = useState<StoredChat>(() => loadStoredChat());
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<AiChatMeta | null>(null);
  const [providerOverride, setProviderOverride] = useState<AiProvider | null>(() => loadProviderPreference());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingDeltaRef = useRef<string | null>(null);
  const deltaFrameRef = useRef<number | null>(null);

  const isPartnerRole = accountContext?.role === "member";
  const chips = isPartnerRole ? PARTNER_CHIPS : OWNER_CHIPS;

  const today = isoDate(new Date());
  const context: AiChatContext = useMemo(
    () => ({
      today,
      role: accountContext?.role ?? null,
      entries,
      stats,
      phaseByDate,
      observationStreak,
      streakRewards,
    }),
    [today, accountContext?.role, entries, stats, phaseByDate, observationStreak, streakRewards],
  );

  useEffect(() => {
    saveStoredChat(chat);
  }, [chat]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: isSending ? "auto" : "smooth" });
  }, [chat.messages.length, streamingText, isSending]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (deltaFrameRef.current != null) cancelAnimationFrame(deltaFrameRef.current);
    },
    [],
  );

  // Streaming chunks can arrive faster than the display can usefully repaint;
  // batch them to one state update per animation frame instead of one per chunk.
  function scheduleStreamingUpdate(text: string) {
    pendingDeltaRef.current = text;
    if (deltaFrameRef.current != null) return;
    deltaFrameRef.current = requestAnimationFrame(() => {
      deltaFrameRef.current = null;
      if (pendingDeltaRef.current != null) setStreamingText(pendingDeltaRef.current);
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setError("");
    setInput("");

    const userMessage: AiChatMessage = { role: "user", content: trimmed };
    let workingChat: StoredChat = { ...chat, messages: [...chat.messages, userMessage] };
    setChat(workingChat);
    setIsSending(true);
    setStreamingText("");

    const controller = new AbortController();
    abortRef.current = controller;
    const provider = providerOverride;

    try {
      if (needsSummarization(workingChat)) {
        const older = historyToSummarize(workingChat);
        const synopsis = await summarizeOlderMessages(older, workingChat.synopsis, context, provider);
        workingChat = applySummary(workingChat, synopsis);
        setChat(workingChat);
      }

      const { history, synopsis } = trimHistoryForModel(workingChat);
      const reply = await runChatTurn(history, synopsis, context, {
        provider,
        signal: controller.signal,
        onDelta: scheduleStreamingUpdate,
        onMeta: setMeta,
      });

      const assistantMessage: AiChatMessage = { role: "assistant", content: reply || "No tengo una respuesta clara ahora mismo." };
      const finalChat: StoredChat = { ...workingChat, messages: [...workingChat.messages, assistantMessage] };
      setChat(finalChat);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "No se pudo hablar con Alba.");
    } finally {
      setIsSending(false);
      setStreamingText("");
    }
  }

  function startNewConversation() {
    abortRef.current?.abort();
    clearStoredChat();
    setChat({ messages: [], createdAt: new Date().toISOString() });
    setError("");
    setStreamingText("");
    setMeta(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void send(input);
  }

  return (
    <section data-reveal className="panel motion-reveal ai-chat-panel rounded border border-outline bg-surface p-4 shadow-soft sm:p-5">
      <div className="ai-chat-header">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-marigold" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Asistente Alba</h2>
        </div>
        <div className="ai-chat-header-actions">
          {meta ? <span className="ai-chat-provider-badge">{PROVIDER_LABEL[meta.provider] ?? meta.provider} · {meta.model}</span> : null}
          <select
            className="ai-chat-provider-select"
            value={providerOverride ?? "auto"}
            aria-label="Proveedor de IA"
            title="Proveedor de IA"
            onChange={(event) => {
              const value = event.target.value === "auto" ? null : (event.target.value as AiProvider);
              setProviderOverride(value);
              saveProviderPreference(value);
            }}
          >
            <option value="auto">Automático</option>
            <option value="gemini">Gemini</option>
            <option value="nvidia">NVIDIA</option>
            <option value="openai">OpenAI</option>
          </select>
          <button className="icon-button compact" title="Nueva conversación" type="button" onClick={startNewConversation}>
            <RotateCcw aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className="info-box warning ai-chat-trust-note">
        Alba solo lee tus datos cuando envías un mensaje. Es orientativa y no diagnostica.
      </div>

      <div ref={scrollRef} className="ai-chat-messages">
        {chat.messages.length === 0 && !streamingText ? (
          <div className="ai-chat-empty">Pregúntale a Alba sobre tu ciclo, tus temperaturas o tu racha.</div>
        ) : (
          chat.messages.map((message, index) => (
            <div key={index} className={`ai-chat-bubble ${message.role === "user" ? "ai-chat-bubble-user" : "ai-chat-bubble-assistant"}`}>
              {message.role === "assistant" ? renderMarkdown(message.content) : message.content}
            </div>
          ))
        )}
        {isSending ? (
          <div className="ai-chat-bubble ai-chat-bubble-assistant ai-chat-bubble-typing">
            {streamingText ? renderMarkdown(streamingText) : <Loader2 className="animate-spin" aria-hidden="true" size={15} />}
          </div>
        ) : null}
      </div>

      {error ? <div className="info-box ai-chat-error">{error}</div> : null}

      <div className="ai-chat-chips">
        {chips.map((chip) => (
          <button key={chip} className="ai-chat-chip" type="button" disabled={isSending} onClick={() => void send(chip)}>
            {chip}
          </button>
        ))}
      </div>

      <form className="ai-chat-input-row" onSubmit={handleSubmit}>
        <input
          className="ai-chat-input"
          type="text"
          value={input}
          placeholder="Escríbele a Alba..."
          disabled={isSending}
          onChange={(event) => setInput(event.target.value)}
        />
        <button className="icon-button ai-chat-send" type="submit" disabled={isSending || !input.trim()} title="Enviar">
          {isSending ? <Loader2 className="animate-spin" aria-hidden="true" size={17} /> : <Send aria-hidden="true" size={17} />}
        </button>
      </form>
    </section>
  );
}
