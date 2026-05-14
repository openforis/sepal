# Punch list — modules/ai

Lean list of active-code gaps. Broader specialist/tool architecture lives in
`DESIGN_chat_specialists_v2.md`.

## Concurrency And Cancellation

- **Concurrent `sendUserMessage$` calls** — `Conversation` has no internal
  serialization; two simultaneous sends for the same conversation can race on
  the mutable messages array. Current assumption: the caller/UI serializes.
  Add a server-side busy guard when needed.
- **No `aborted: true` flag on final completion** — abort and natural
  completion both emit `chat-response complete`. Add a flag so the GUI can
  distinguish "cancelled" from "finished."
- **Partial assistant text is not replayed on re-entry** — selecting an
  in-flight conversation re-emits `status`, but chunks sent before re-entry are
  not replayed because the partial accumulator lives inside `Conversation.step$`.

## Tool And GUI Bridge

- **Real tool transport is still not wired** — `app.js` injects `noTools()`,
  the OpenAI adapter does not send tool schemas or parse provider tool-call
  deltas, and server-side `gui-response` handling is still absent.
- **Multi-tool-call coverage is thin** — `Conversation` accumulates multiple
  individual `{toolCall}` events, but tests only pin the single-tool path.

## Context

- **`get_context()` tool is not wired** — GUI context is stored per
  tab/subscription in `UserChat` and injected as ephemeral turn context on the
  first LLM call of a user turn, but it is not yet exposed to the orchestrator
  through tool transport.

## Observability

- **Event log categories** — event-bus logs are flattened through
  `getLogger('ai')`, so `log.json` cannot enable trace/debug for one boundary
  such as `llm`, `tools`, `specialists`, or `ws` without affecting all AI
  events.
- **Late-bound span completion attrs** — `tracer.span$(name, attrs, work$)`
  fixes attrs at construction. For LLM/tool spans we want completion attrs such
  as chunks, token usage, cache hits, result size, and status once they are
  known.
- **Usage accounting events are not emitted** — active adapters log response
  summaries, but they do not emit normalized `llm.usage` events or per-turn
  rollups.

## Persistence And Runtime State

- **In-flight streams do not survive restart** — conversation metadata and
  history are persisted in Redis, but an active LLM stream is in-memory only.
- **In-memory caches grow unbounded** — `userChats` in `src/app.js` and
  `conversations` in `src/chat/sendMessage/userChat.js` never evict. Add idle
  eviction or an LRU cap if uptime/user count makes this matter.
- **Single ai-module instance assumption** — cross-tab sync goes through
  in-memory `UserChat` state. Multiple ai-module instances behind a load
  balancer would need Redis pub/sub or an equivalent broadcast layer.
