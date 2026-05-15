# Punch list — modules/ai

Lean list of active-code gaps. Broader specialist/tool architecture lives in
`DESIGN_chat_specialists_v2.md`.

## Concurrency And Cancellation

- **No `aborted: true` flag on final completion** — abort and natural
  completion both emit `chat-response complete`. Add a flag so the GUI can
  distinguish "cancelled" from "finished."
- **Partial assistant text is not replayed on re-entry** — selecting an
  in-flight conversation re-emits `status`, but chunks sent before re-entry are
  not replayed because the partial accumulator lives inside `Conversation.step$`.

## Tool And GUI Bridge

- **Read tools only** — Phase 1A/1B wired the read-only product tools
  (`get_context`, `recipe_list`, `project_list`, `recipe_load`). Recipe
  create/update/delete/move/save tools and `recipe_patch` are not implemented
  yet.
- **Map specialist read tools are minimal** — `consult_map` exposes
  `get_context`, `map_area_list` (layout + areas + AOI + view), and
  `layer_list` (per-area imageLayer + featureLayers). Still missing:
  per-layer loading/error state, dynamic-vis legend/palette inspection, and
  any live per-area viewport beyond `map.view` (per-area viewports under
  `mapCommand$` are not in Redux).
- **`recipe_patch` write path is not implemented** — `recipe_load` returns a
  `modelHash` (stamped GUI-side) ready to serve as the `baseModelHash`
  optimistic-concurrency token, but the patch tool, its validation, and the
  GUI write path that checks `baseModelHash` are not built yet.
- **Remove transport smoke-test tools from production code** — `echo` and
  `ask_gui_echo` were useful before real tools existed, but they now add
  confusing production surface area even behind a dev flag. Move any remaining
  coverage to test fixtures or a clearly isolated dev-only module.
- **Tool-loop safety is partial** — there is a `MAX_TOOL_ROUNDS` cap and a
  structured tool-error envelope, but no repeated-failure bail-out, no
  validation-error retry limit, and no no-repeat handling for identical failing
  tool calls (DESIGN §15 "before writable tools").
- **Specialist safety/observability is minimal** — `runSpecialist$` has a
  `SPECIALIST_MAX_ROUNDS` cap and a tracer span, but no recursion guard
  beyond the two-layer registry (specialists can't call specialists today
  only because the inner registry doesn't hold them), no per-specialist token
  budget, no `specialist.invoked` / `specialist.completed` bus events for
  per-specialist accounting, and the cap-exceeded fallback is a flat English
  string with no descriptor path.
- **UI language is not in turn context** — the GUI knows the selected locale,
  but AI turns only receive selection/runtime state. Include the UI language as
  runtime data so the model can reply in the active interface language without
  guessing from the user's text.
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
