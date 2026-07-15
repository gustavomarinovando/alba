# Multi-Provider Streaming AI Chatbot — Architecture & Replication Guide

Written from the Alba implementation (`api/chat.js`, `src/lib/aiChat.ts`, `src/lib/aiTools.ts`,
`src/components/AiChatPanel.tsx`, `src/lib/markdown.tsx`) so it can be ported to a different
project with a real backend/DB instead of local-only data. Where a detail is specific to what was
verified live during this build (exact model names, quota behavior), that's called out — re-verify
those against your own provider accounts, they drift.

## 1. Design goals

- One server endpoint, three interchangeable providers (Gemini, NVIDIA, OpenAI), zero client-visible
  API keys.
- Streaming responses (SSE), not request/response — chat feels alive.
- Tool-calling (function calling) so the model grounds answers in real data instead of hallucinating.
- Works with weak/cheap models and strong ones without code branching — the prompt does the
  heavy lifting for quality, not per-provider special-casing.
- Cheap to run: small message caps, rolling summarization instead of unbounded context growth.

## 2. Why "OpenAI-compatible" is the right abstraction

Gemini, NVIDIA NIM, and OpenAI all expose (or can expose) an endpoint shaped like OpenAI's
`/chat/completions`: same request body (`model`, `messages`, `tools`, `stream`), same SSE chunk
format (`data: {"choices":[{"delta":{...}}]}\n\n`, terminated by `data: [DONE]`). That means **one
adapter function** handles all three providers — you only swap `baseUrl` + API key + default model.
No SDKs needed; it's all `fetch`.

```js
const PROVIDERS = {
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY" },
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", keyEnv: "NVIDIA_API_KEY" },
  openai: { baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY" },
};
// POST `${baseUrl}/chat/completions` with `Authorization: Bearer <key>` for all three.
```

If your new backend adds a 4th provider (Anthropic via its own Messages API, a self-hosted vLLM
endpoint, etc.), check first whether it has an OpenAI-compat shim — most do now — before writing a
bespoke adapter.

## 3. Server endpoint contract

One file (`api/chat.js`, a Vercel serverless function; adapt to whatever your backend framework is —
the logic is framework-agnostic Node).

**Request body the client sends:**
```jsonc
{
  "messages": [{ "role": "system" | "user" | "assistant" | "tool", "content": "...", "tool_call_id": "...", "tool_calls": [...] }],
  "tools": [ /* OpenAI function-calling tool definitions, or omitted on the final no-tools round */ ],
  "provider": "gemini" | "nvidia" | "openai" | undefined  // optional client override
}
```

**Server responsibilities, in order:**
1. Reject non-POST.
2. Validate: `messages` present and non-empty, message count capped (60 in Alba), total body size
   capped (200KB) — cheap DoS/cost protection.
3. Resolve provider: client-requested provider **only if its key exists server-side**, else
   `process.env.AI_PROVIDER`, else a hardcoded fallback. Never trust the client to pick a provider
   whose key isn't configured — silently fall through instead of erroring, so a misconfigured
   client override doesn't break the whole feature.
4. Resolve model: `body.model` (rarely used) → `process.env.<PROVIDER>_MODEL` → hardcoded default.
5. Forward to `${baseUrl}/chat/completions` with `stream: true`, tools passthrough, and
   **`temperature` omitted unless the caller explicitly set it** (see §7 gotcha).
6. On success: pipe the upstream SSE body straight through to the client response, byte-for-byte —
   don't buffer, don't re-parse, don't re-serialize. Set `Content-Type: text/event-stream` and two
   custom headers (`X-Alba-Provider`, `X-Alba-Model`) so the client can show a "which model answered"
   badge without parsing the stream.
7. On failure: read the (non-streamed) error body, extract a human message, return JSON `{error}`
   with the upstream status code.

```js
const reader = upstream.body.getReader();
const decoder = new TextDecoder();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  response.write(decoder.decode(value, { stream: true }));
}
response.end();
```

**Local dev note:** if you're not deploying to Vercel/similar for local dev, mirror this exact logic
in your dev server's middleware (Alba does this in `vite.config.ts` since Vercel functions aren't
served by `vite dev`). Keep the two copies in sync manually — there's no shared import between a
`vite.config.ts` middleware and an `api/*.js` file in this stack.

## 4. Two provider-specific gotchas that cost real debugging time

### 4.1 Gemini requires echoing back its tool-call "thought signature"

When Gemini's OpenAI-compat layer returns a tool call, each entry in `delta.tool_calls[]` includes an
extra field: `extra_content.google.thought_signature`. **If you don't capture this and echo it back
verbatim** in the `assistant` message you push into history for the next turn, Gemini returns:

```
400 INVALID_ARGUMENT: Function call is missing a thought_signature in functionCall parts.
```

Fix: treat `extra_content` as an opaque pass-through field on your tool-call type. Capture it while
accumulating streamed deltas, and include it unmodified when you send that message back:

```ts
interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  extra_content?: unknown; // Gemini-only; absent for other providers, harmless to carry around
}
```
Other providers never set this field, so it's a no-op for them — safe to always forward.

### 4.2 Gemini wraps error bodies in an array; OpenAI/NVIDIA don't

```json
// Gemini error body:
[{ "error": { "code": 429, "message": "...", "status": "RESOURCE_EXHAUSTED" } }]
// OpenAI/NVIDIA error body:
{ "error": { "message": "..." } }
```
A naive `JSON.parse(text)?.error?.message` silently returns `undefined` for Gemini (since `.error`
on an array is `undefined`), and your app falls back to a generic "couldn't respond" message —
**hiding the real reason** (quota exceeded, bad model name, etc.) from both you and the user during
debugging. Always check `Array.isArray(parsed) ? parsed[0]?.error : parsed?.error`.

### 4.3 Some models reject any explicit `temperature`

Reasoning-tier models (e.g. `gpt-5-nano`) only accept their default temperature and error on any
explicit value, including the "safe-looking" `0.7`. Don't hardcode a default server-side — only set
`temperature` on the upstream request if the caller explicitly provided one:
```js
temperature: typeof body.temperature === "number" ? body.temperature : undefined,
```
(`undefined` is dropped by `JSON.stringify`, so the field is simply absent from the request.)

## 5. Client streaming + SSE parsing

Manual SSE parsing over `fetch` + `ReadableStream` (no library needed):

```ts
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? ""; // last line may be incomplete — keep it for next chunk
  for (const line of lines) {
    if (!line.trim().startsWith("data:")) continue;
    const payload = line.trim().slice(5).trim();
    if (payload === "[DONE]") continue;
    const parsed = JSON.parse(payload); // guard with try/catch — a stray partial line can slip through
    const delta = parsed?.choices?.[0]?.delta;
    if (delta?.content) { /* accumulate + render */ }
    if (Array.isArray(delta?.tool_calls)) { /* accumulate by index, see §6 */ }
  }
}
```

Tool-call deltas arrive **fragmented and indexed** (`delta.tool_calls[i].index`), with `id`,
`function.name`, and `function.arguments` each potentially split across multiple chunks. Accumulate
into a `Map<index, ToolCall>`, concatenating string fields as fragments arrive:

```ts
const existing = toolCallsByIndex.get(index) ?? { id: "", type: "function", function: { name: "", arguments: "" } };
if (delta.id) existing.id = delta.id;
if (delta.function?.name) existing.function.name += delta.function.name;
if (delta.function?.arguments) existing.function.arguments += delta.function.arguments;
```

## 6. The tool-calling loop (client-executed tools)

**Design choice: tools execute client-side, not server-side.** The client already has the app's
in-memory state (entries, computed stats, etc.); round-tripping to the server to execute a tool and
back would double latency for no benefit when the data is already local. For a backend-heavy port,
you'd flip this: execute tools **server-side** instead, since that's where your DB lives — the loop
shape stays identical, only "where execution happens" changes.

```
loop (max N iterations, e.g. 4):
  send messages (system + history) to /api/chat with tools attached
  if response has tool_calls:
    execute each tool call → get a JSON-serializable result
    push {role: "assistant", tool_calls} then {role: "tool", tool_call_id, content: JSON.stringify(result)}
    continue loop
  else:
    return the plain-text content — done
```
Cap the loop (Alba uses 4) and on the final allowed iteration, **omit tools from the request** so the
model is forced to produce a plain answer instead of looping forever on tool calls.

Tool definitions are plain OpenAI function-calling JSON schema — nothing provider-specific:
```ts
{ type: "function", function: { name: "get_cycle_summary", description: "...", parameters: { type: "object", properties: {} } } }
```
Keep tools **read-only and narrowly scoped** (one concern per tool: `get_x_summary`,
`get_y_stats`) rather than one giant "query anything" tool — smaller, well-named tools with tight
descriptions get called correctly far more often than one kitchen-sink tool, especially on weaker
models.

## 7. System prompt design that actually improves weak-model quality

Three techniques, roughly in order of impact:

1. **Structured sections beat one paragraph.** `## Rol`, `## Personalidad`, `## Herramientas`,
   `## Formato` — models (especially smaller ones) follow labeled instruction blocks more reliably
   than the same rules embedded in flowing prose.
2. **A fixed one-shot example beats more prose rules.** Prepend a hardcoded
   `{role: "user", ...}, {role: "assistant", ...}` exchange demonstrating the exact tone, format,
   and any hidden markers you want (see §8) — **never persisted, never shown to the user, injected
   fresh into every request**. This is the single highest-leverage lever for closing the quality gap
   between a frontier model and a small/cheap one. A concrete example of "do it like this" reliably
   outperforms another paragraph of "please do it like this."
3. **Explicit tool-use mandate.** State plainly: "before answering questions about X, call tool Y
   first; never invent values a tool could give you." Without this, smaller models often answer from
   guesswork even when a perfectly good tool exists.

## 8. Hidden marker technique for structured extras (follow-up suggestions)

To get the model to emit UI-only metadata (e.g. 2-3 follow-up question chips) without a second model
call, instruct it to end every final reply with a machine-parseable trailing line:
```
<!--suggestions: question one? | question two? | question three?-->
```
Parse and strip it client-side before rendering:
```ts
const match = content.match(/<!--\s*suggestions:\s*([\s\S]*?)-->/i);
const suggestions = match ? match[1].split("|").map(s => s.trim()).filter(Boolean).slice(0, 3) : [];
const displayContent = match ? content.slice(0, match.index).trim() : content;
```
**Weaker models sometimes emit malformed debris** right before the marker (e.g. a stray `-->` as if
they started, then restarted, the comment). Clean up trailing debris after removing the real match,
don't just trust `content.slice(0, match.index)` to be clean:
```ts
const before = content.slice(0, match.index).replace(/(<!--)?\s*-->\s*$/, "");
```
This pattern generalizes: any time you want the model to emit structured extras alongside prose
(a mood tag, a confidence score, a suggested action), a clearly-delimited trailing marker + tolerant
regex parsing is simpler and cheaper than forcing full JSON-mode output, and degrades gracefully
(no marker found → just show the prose, no crash).

## 9. Memory: localStorage + rolling summarization (swap for DB in a bigger app)

Alba's version (single-user-per-device, no backend to lean on):
- Full conversation persisted to `localStorage` (`{messages, synopsis, createdAt}`).
- Once message count exceeds a threshold (20), summarize everything except the most recent N (10)
  into a rolling `synopsis` string via **one extra, non-streamed model call** with a dedicated
  "summarize this in ≤6 lines, no new info" system prompt. Store the synopsis, drop the old messages
  client-side.
- Every real turn sends `[system-prompt(+synopsis)] + [last N messages]` — never the full history.

**For a backend with a real DB:** move `messages`/`synopsis` into a `conversations` table (or a
document per conversation), keyed by user/session. The summarization *mechanism* doesn't change —
it's still "one extra LLM call, triggered by a length threshold, replacing old turns with a rolling
synopsis" — only the storage layer does. This also opens the door to cross-device conversation sync,
which localStorage fundamentally can't do.

## 10. Date/number formatting: keep the model's output machine-readable, format client-side

Instruct the model to always emit dates (or any format-sensitive value) in one canonical
machine-readable form in its prose — Alba uses ISO `AAAA-MM-DD` — and **never trust the model to
localize/format it correctly itself**, especially across providers of different quality. Post-process
client-side with a regex + your date library before rendering:
```ts
text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match) => humanize(match)); // "2026-09-26" → "26 de septiembre"
```
This is strictly better than asking the model to spell out the humanized form itself: fewer output
tokens, zero dependency on a given model's instruction-following, and one place to change the
display format later.

## 11. Performance details that matter once the chat is real

- **Batch streaming UI updates to one per animation frame**, not one per SSE chunk. A fast
  connection can deliver far more chunks/sec than the display can usefully repaint; naive
  `setState` on every chunk causes visible jank (and on a bad layout, see next point, actively
  breaks it).
  ```ts
  function scheduleUpdate(text) {
    pendingRef.current = text;
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => { frameRef.current = null; setState(pendingRef.current); });
  }
  ```
- **Never use `display: inline-flex`/`flex` on a container that will hold multi-paragraph streamed
  markdown.** A "typing indicator" bubble styled `inline-flex` (fine when it only ever holds a
  spinner) silently turns into a horizontal multi-column layout once real paragraph/list markdown
  starts streaming into it — looks like a broken table until the bubble swaps to its final,
  non-flex class. Keep the loading-spinner state and the streamed-content state on visually
  distinct elements/classes.
- **`overscroll-behavior: contain`** on the scrollable message list — otherwise scrolling to the
  top/bottom of the chat bleeds into scrolling the outer page, which reads as "broken" scroll.
- **Prewarm the connection.** Serverless cold starts + provider auth handshake make the *first*
  message of a session noticeably slower than subsequent ones. Fire a cheap, invisible request as
  soon as the chat UI mounts (a trivial "ping" system+user turn, response discarded) to absorb that
  cold-start cost before the user's real first message. Better yet — as Alba does — make that
  warm-up request produce a **real, visible greeting** (using your tools to say something useful
  about the user's current state) instead of throwing the response away; you get the latency win and
  a proactive, welcoming first message for free. Only do this once per session (a module-level flag
  or a server-confirmed "already greeted" state), not on every tab/page visit.
- **Lazy-load loading indicator can itself go invisible.** If your chat panel is behind
  `React.lazy`/`Suspense` and your app has a scroll-into-view/fade-in animation system driven by an
  `IntersectionObserver` that scans the DOM once on tab-change, a component that mounts *after* that
  scan (because it was still being code-split-loaded) never gets observed and can be stuck invisible.
  Have such components self-reveal on mount rather than depending on an external one-shot scan.

## 12. Security checklist (all satisfied in Alba's implementation)

- API keys live **only** in server env vars, never sent to or readable by the client.
- The client can *request* a provider override, but the server only honors it if that provider's key
  actually exists server-side — otherwise it silently falls back, never errors with "which providers
  exist" info leakage.
- Request validation: reject non-POST, cap message count, cap body size — cheap, prevents obvious
  abuse/cost blowouts before they hit the provider.
- No user-supplied content is ever interpolated into a shell command, SQL query, or eval'd — it's
  purely JSON payload data forwarded to the provider API.
- CORS/method checks are the framework's responsibility (Vercel functions here); replicate
  equivalent checks in whatever framework you're porting to.

## 13. Porting checklist for a bigger backend + more data

1. **Provider adapter (§2-4)**: copy near-verbatim — this part is genuinely reusable across projects.
2. **Streaming/tool-loop client logic (§5-6)**: copy near-verbatim; only the tool *execution* target
   changes (client-side function → server-side DB query/service call). If tools move server-side,
   your `/chat` endpoint needs a second internal step: execute the tool call before looping back to
   the provider, rather than returning tool_calls to the client for it to resolve.
3. **System prompt (§7)**: rewrite the domain content, keep the technique (structured sections +
   one-shot exemplar + explicit tool mandate).
4. **Memory (§9)**: swap localStorage for your DB; keep the "summarize past a threshold" mechanism.
5. **Tool definitions**: design them the way you'd design a good internal API — narrow, well-named,
   read vs. write clearly separated. If you add *write* tools (the model can create/modify data on
   the user's behalf), treat that as a genuinely different trust boundary: validate args server-side
   regardless of what the model claims, and consider requiring explicit user confirmation before a
   write tool's effect is committed, the same way you'd gate any other user-facing destructive/
   consequential action.
6. **MCP vs. plain function-calling**: for tools over data you already own (your own DB, your own
   services), plain OpenAI-style function-calling as described here is sufficient and simpler — MCP
   earns its complexity when you need to plug in *external* tool servers you don't control, or share
   the same toolset across multiple different AI clients. Don't reach for it by default.
7. **Rate limiting / cost control**: Alba's caps (60 messages, 200KB body) are minimal placeholders
   sized for a private low-traffic app. For a public product, add real per-user rate limiting and
   token/cost budgets server-side before launch.

## 14. Models verified working at time of writing (re-verify before reuse)

These are **not general facts** — API providers change model availability/pricing/quotas
frequently, and results are specific to the API keys tested. Re-verify against your own accounts.

- `gemini-3.1-flash-lite` (via `.../v1beta/openai`) — confirmed working (chat, streaming, tool
  calls) on a fresh free-tier key. `gemini-2.0-flash` returned `429` (quota limit 0 on that key);
  `gemini-2.5-flash`/`gemini-2.5-flash-lite` returned `404` ("no longer available to new users").
  `gemini-flash-latest` worked in isolated tests but later started hanging/timing out under load —
  prefer a pinned version over a `-latest` alias for predictability.
- `z-ai/glm-5.2` (via NVIDIA's `integrate.api.nvidia.com/v1`) — confirmed working, including
  reliable tool-calling, and subjectively the strongest instruction-follower of the three tested.
- `gpt-4o-mini` — used as the OpenAI default; not independently load-tested in this session (no key
  available at the time). `gpt-5-nano` was tested by the project owner and rejected any explicit
  `temperature` (see §4.3) — that's the one confirmed OpenAI-specific finding.
