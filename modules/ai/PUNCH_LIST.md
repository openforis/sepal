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
  that holds raw `recipe_load` privately. The `recipe_patch` wire (tool +
  stubbed GUI handler) now exists in the specialist inner registry but has no
  specialist consumer yet. Still missing:
  `update_recipe({recipeId, instruction})` and
  `create_recipe({recipeType, instruction, projectId?, name?})` dispatchers
  that wire `recipe_patch` into a per-type write-capable specialist.
- **Recipe specialist routing is partially type-aware** —
  `describeRecipeTool` now resolves `recipeId -> recipeType` via a preflight
  `recipe_load` and assembles a per-type system prompt from the shared
  `spec.promptFacts()` (MOSAIC today; other types fall back to the generic
  base frame). Still missing: per-type allowed-tool sets, per-type
  `update_recipe` / `create_recipe` dispatcher routing, and per-type prompt
  file overrides (if a recipe ever needs more than `promptFacts()` can express).
- **Map specialist read tools are minimal** — `consult_map` exposes
  `get_gui_context`, `map_area_list` (layout + areas + AOI + view), and
  `layer_list` (per-area imageLayer + featureLayers). Still missing:
  per-layer loading/error state, dynamic-vis legend/palette inspection, and
  any live per-area viewport beyond `map.view` (per-area viewports under
  `mapCommand$` are not in Redux).
- **`recipe_patch` GUI handler is stubbed — applies + validates but does not
  persist.** The wire contract is complete (specialist-private tool in
  `modules/ai/src/chat/tools/recipePatchTool.js`; GUI handler in
  `modules/gui/src/app/home/body/process/chatActions/recipeActions.js`
  enforces `baseModelHash`, applies the patch atomically against the
  effective model, validates via the shared recipe spec, and returns
  `{summary, modelHash, invalidatedPaths}` or structured `STALE_WRITE`,
  `INVALID_PATCH`, `PATCH_APPLY_FAILED`, `VALIDATION_FAILED`,
  `RECIPE_NOT_FOUND` envelopes). The handler does not yet replace
  `process.loadedRecipes[recipeId].model` or call `api.recipe.save$` — the
  next slice flips the stub by routing the post-apply effective model
  through the same write path `createRecipe` / `updateRecipe` use.
- **Recipe-domain validation is deferred** — JSON Patch envelope validation is
  not enough for safe recipe edits. Use the shared recipe spec/validation API
  (`lib/js/recipes`, currently MOSAIC only) from the GUI write path
  for authoritative validation and from recipe specialists for dependent-fragment
  planning and prompt facts.
- ~~**Shared recipe spec lacks `promptFacts()`**~~ — closed. MOSAIC spec exposes
  `promptFacts()` returning `{description, useCases, chooseWhen, dontChooseWhen,
  outputs}`. Consumed by `describe_recipe` via `assembleSpecialistPrompt`
  (per-type prompt assembled with the base frame first for cache stability).
  Additional fields from DESIGN §8 (defaults/projection summary, rule prose,
  output bands, gotchas) land when a consumer needs them.
- ~~**`describe_recipe` preflight `recipe_load` is wasteful**~~ — closed.
  Type resolution now goes through `lookupRecipeMetadata$` (see
  `modules/ai/src/chat/tools/recipeMetadata.js`) which hits the GUI's
  `recipe-metadata` bridge handler in
  `modules/gui/src/app/home/body/process/chatActions/recipeActions.js` —
  identity-only response, no model fetch, no gzip envelope. Reusable by
  the future `update_recipe` / `create_recipe` dispatchers.
- **Shared recipe spec lacks `fragmentsForEdit({intent, targetPaths})`** —
  DESIGN §6/§7. Needed by the patch specialist to plan dependent-fragment
  reads/writes deterministically. Land alongside `recipe_patch` and the recipe
  create/update tools.
- **AI patch-apply path (future GUI slice)** — apply the LLM's effective
  output directly; no re-merge of dormant fields. Validation runs on the
  effective shape via `spec.validate(model)`. Contract is fixed in
  `lib/js/recipes/README.md` (LLM-facing model contract); do not
  relitigate at apply time.
- **AI `create_recipe` starting point** — use `spec.defaultModel()` (already
  in effective shape) as the LLM's seed; AI-created recipes persist in
  effective shape, never expanded into the GUI's stored shape.
- **Heavy-field omission belongs on the recipe spec, not in AI tools** —
  `omitReferenceData` / `isReferenceDataPath` in
  `modules/ai/src/chat/tools/recipeProjection.js` hardcode CLASSIFICATION's
  `/trainingData/dataSets/<n>/referenceData` path so a `recipe_load` doesn't
  blow the LLM context with thousands of reference points. The pattern is the
  right contract (marker + path-addressable items), but the *what's heavy*
  knowledge belongs next to the recipe's schema. When CLASSIFICATION is ported
  to `lib/js/recipes/`, move the omission there — likely as a
  declarative schema annotation (`x-llmOmit: 'count'` etc.) walked by a
  generic engine, with a per-spec method as an escape hatch for cases that
  need summarization/sampling. AI tools should go back to being type-agnostic.
- **GUI `defaultModel` ships an internally inconsistent default** — for the
  MOSAIC recipe, the GUI's committed `defaultModel.compositeOptions.includedCloudMasking`
  pre-lists `sentinel2CloudScorePlus` while `sources.dataSets` defaults to
  LANDSAT only. The shared `cloudMaskingMethodAvailability` rule correctly
  rejects the combination. Touching the GUI default is regression risk;
  reconcile when the patch specialist lands and there's a real recipe-write
  path that needs the default to round-trip through `validate()`.
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
