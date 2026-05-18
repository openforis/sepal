# Punch list — modules/ai

Lean list of active-code gaps. Broader specialist/tool architecture lives in
`DESIGN_chat_specialists_v2.md`.

## Concurrency And Cancellation

- **No `aborted: true` flag on final completion** — abort and natural
  completion both emit `chat-response complete`. Add a flag so the GUI can
  distinguish "cancelled" from "finished."
- **Partial assistant text is not replayed on re-entry** — selecting an
  in-flight conversation re-emits `status`, but chunks sent before re-entry are
  not replayed because the partial accumulator lives inside `ConversationLoop.step$`.

## Tool And GUI Bridge

- **Recipe operation dispatchers are partial** — `describe_recipe({recipeId,
  question?})` is implemented and routes to a single generic recipe specialist
  that holds raw `recipe_load` privately. Still missing:
  `update_recipe({recipeId, instruction})` and
  `create_recipe({recipeType, instruction, projectId?, name?})`. Existing
  recipes should resolve recipe type from `recipeId` (the orchestrator should
  not guess it); the type-resolution seam is not built yet.
- **Recipe specialist routing is generic, not type-aware** —
  `describeRecipeTool` loads a single hard-coded `specialistPrompt('recipe')`.
  Per-type specialist selection (different prompt asset + allowed tools per
  recipe type) needs a `recipeId -> recipeType` lookup plus per-type prompt
  files under `llmText/specialists/recipe/<TYPE>.md`. Lands naturally with the
  first `lib/js/recipes` package since that's the source of truth for
  per-type knowledge.
- **Map specialist read tools are minimal** — `consult_map` exposes
  `get_gui_context`, `map_area_list` (layout + areas + AOI + view), and
  `layer_list` (per-area imageLayer + featureLayers). Still missing:
  per-layer loading/error state, dynamic-vis legend/palette inspection, and
  any live per-area viewport beyond `map.view` (per-area viewports under
  `mapCommand$` are not in Redux).
- **`recipe_patch` must be specialist-private** — the patch wire contract needs
  GUI-side `baseModelHash` enforcement, atomic JSON Patch application, and
  structured stale/apply errors, but it should not remain on the always-visible
  orchestrator tool surface. Recipe specialists should call it after inspecting
  the needed recipe fragments.
- **Recipe-domain validation is deferred** — JSON Patch envelope validation is
  not enough for safe recipe edits. Add shared recipe knowledge/validation under
  `lib/js/recipes` and use it from the GUI write path for authoritative
  validation and from recipe specialists for dependent-fragment planning and
  prompt facts.
- **Specialist safety/observability is minimal** — `runSpecialist$` has a
  `SPECIALIST_MAX_ROUNDS` cap, per-turn tool-loop safety (no-repeat,
  consecutive-failure bail-out, invalid-args retry limit via the shared
  `toolCallGuard`), and a tracer span, but no recursion guard beyond the
  two-layer registry (specialists can't call specialists today only because
  the inner registry doesn't hold them), no per-specialist token budget, no
  `specialist.invoked` / `specialist.completed` bus events for per-specialist
  accounting, and the cap-exceeded / bail-out fallbacks are flat English
  strings with no descriptor path back to the GUI.
- **UI language is not in turn context** — the GUI knows the selected locale,
  but AI turns only receive GUI/runtime state. Include the UI language as
  runtime data so the model can reply in the active interface language without
  guessing from the user's text.
- **No model-profile resolution or `llm.usage` events** — every LLM call still
  goes through one hard-wired adapter; provider/model/profile resolution and
  normalized usage accounting (DESIGN §9) are not wired.
- ~~**Boundary events are not lazy**~~ — closed. Trace/debug bus events go through
  `src/chat/diagnostics.js` (`summarizeMessages` / `summarizeTools` /
  `summarizeObject` / `truncateString`); messages and tools/payload events use
  `message: () => ...` lazy strings throughout. Bounded by default; opt-in full
  payloads via `AI_FULL_TRACE_PAYLOADS=true`.

## Observability

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
- **In-memory caches grow unbounded** — the per-username `chats` map in
  `src/chat/conversation/userChats.js` and the per-user `instances`/`pendingMetas`
  maps in `src/chat/conversation/conversations.js` never evict. Add idle
  eviction or an LRU cap if uptime/user count makes this matter.
- **Single ai-module instance assumption** — cross-tab sync goes through
  the in-memory `UserChats` / `Conversations` state. Multiple ai-module
  instances behind a load balancer would need Redis pub/sub or an
  equivalent broadcast layer.

## Naming

- **`runTurn$` and the `turn` vocabulary are under-qualified** — both
  `conversationLoop.runTurn$` and the local helper in `messageHandler.js`
  share the name; the bare word "turn" doesn't say *of what*. Renaming to
  `respond$` / `runMessageTurn$` / `bookendedTurn$` / etc. was considered
  but no candidate landed. Park the smell; revisit when a better domain
  word surfaces.

## Configuration

- **`src/config.js` parses unused legacy fields** — `sepalEndpoint`,
  `geeEndpoint`, `rateLimit`, and `sessionTtlMinutes` are still required CLI
  options because compose passes them, but the active app does not wire SEPAL
  or GEE clients, server-side rate limiting, or session expiry. Drop the
  options or actually wire them.
