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

- **Read tools only — no write tools or specialists** — Phase 1A wired the
  read-only product tools (`get_context`, `recipe_list`, `project_list`).
  Recipe create/update/delete/move/save tools, map tools, and specialists are
  not implemented yet.
- **Projected `recipe_load` is deferred** — existing GUI `load-recipe` returns
  the full model; AI-facing load needs compact projection, `path?` semantics,
  omitted-heavy-field markers, and `baseModelHash` alignment before
  `recipe_patch`.
- **`ask_gui_echo` has no GUI handler** — the GUI-backed smoke-test tool stays
  unregistered (even under the dev flag) because the real GUI has no `echo`
  `gui-action` handler. The server-side GUI request/response bridge is complete
  and tested; a diagnostic GUI `echo` handler would be needed to exercise a
  successful end-to-end round trip in a running app.
- **Tool-loop safety is partial** — there is a `MAX_TOOL_ROUNDS` cap and a
  structured tool-error envelope, but no repeated-failure bail-out, no
  validation-error retry limit, and no no-repeat handling for identical failing
  tool calls (DESIGN §15 "before writable tools").
- **No model-profile resolution or `llm.usage` events** — every LLM call still
  goes through one hard-wired adapter; provider/model/profile resolution and
  normalized usage accounting (DESIGN §9) are not wired.
- **Boundary events are not lazy** — tool/LLM events publish eager `message`
  strings; the `message: () => ...` / `payload: () => ...` split from DESIGN §8
  is only partially applied.

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
