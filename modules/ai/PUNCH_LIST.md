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
  question?})` and `update_recipe({recipeId, instruction})` are both on the
  orchestrator surface, each backed by its own per-type specialist
  (`recipe_load` only for describe; `prepare_update` + `recipe_patch` for
  update, with the generated update manual injected into the update prompt). Still missing:
  `create_recipe({recipeType, instruction, projectId?, name?})` dispatcher
  seeded with `spec.defaultModel()`.
- **Recipe specialist routing is partially type-aware** — `describeRecipeTool`
  and `updateRecipeTool` both resolve `recipeId -> recipeType` via
  `lookupRecipeMetadata$` and assemble a per-type system prompt from
  per-purpose fact buckets (`spec.describeFacts()` / `spec.editFacts()` —
  MOSAIC today; other types fall back to the generic base frame).
  `updateRecipeTool` additionally sees only `prepare_update` + `recipe_patch`
  in scope; `prepare_update` expands the specialist's chosen focus paths into
  the dependent + writable set via `spec.llmMetadata()` constraints. Still
  missing: per-type allowed-tool sets beyond the describe/update split, per-type
  prompt file overrides (if a recipe ever needs more than per-purpose facts can
  express), structured `editFacts` fields beyond `guidance` (e.g. `pathAliases`,
  `validationDependencies`), and `create_recipe` dispatcher routing.
- **Map specialist read tools are minimal** — `consult_map` exposes
  `get_gui_context`, `map_area_list` (layout + areas + AOI + view), and
  `layer_list` (per-area imageLayer + featureLayers). Still missing:
  per-layer loading/error state, dynamic-vis legend/palette inspection, and
  any live per-area viewport beyond `map.view` (per-area viewports under
  `mapCommand$` are not in Redux).
- **Recipe-domain validation is deferred** — JSON Patch envelope validation is
  not enough for safe recipe edits. Use the shared recipe spec/validation API
  (`lib/js/recipes`, currently MOSAIC only) from the GUI write path
  for authoritative validation and from recipe specialists for dependent-fragment
  planning and prompt facts.
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
- **`update_recipe` STALE_WRITE retry cap is prose-only** — `llmText/specialists/update.md`
  tells the specialist to retry once after STALE_WRITE; `toolCallGuard` catches
  exact-repeat tool calls but not reload-replan-retry cycles where each new
  patch differs. Acceptable for the spike (we want to observe real behavior),
  but production should add a per-`update_recipe`-invocation counter on
  `recipe_patch` calls to stop genuine loops without constraining a single
  LLM "thinking out loud."
- **Patch summary labels do not recurse into object values** — `update_recipe`
  now enriches successful `recipe_patch` results with schema-derived value
  labels for scalar enum fields and config-array members, so answers can say
  "aggressive" or "Landsat CFMask" instead of raw enum IDs. Object-shaped
  patch values (for example replacing `/sources/dataSets`) still stay raw.
  If raw nested enum IDs keep leaking into summaries, add a schema-aware
  recursive enricher that labels object members without inventing field labels.
- **Specialist safety/observability is partially in place** — `runSpecialist$`
  has a `SPECIALIST_MAX_ROUNDS` cap, per-turn tool-loop safety (no-repeat,
  consecutive-failure bail-out, invalid-args retry limit via the shared
  `toolCallGuard`), and a `specialist.run` bus span. Per-round lifecycle
  events (`specialist.request` / `specialist.response`) and per-tool events
  (`specialist.tool.request` / `specialist.tool.response`) now publish
  compact diagnostic summaries on the bus, and `update_recipe.outcome`
  emits a single info-level event with `patchAttempted` / `patchSucceeded`
  / `code` / `lastPatchErrorCode` / `answerChars` per dispatch. Still
  missing: recursion guard beyond the two-layer registry (specialists
  can't call specialists today only because the inner registry doesn't
  hold them), per-specialist token budget, and the cap-exceeded /
  bail-out fallbacks are flat English strings with no descriptor path
  back to the GUI.
- **UI language is not in turn context** — the GUI knows the selected locale,
  but AI turns only receive GUI/runtime state. Include the UI language as
  runtime data so the model can reply in the active interface language without
  guessing from the user's text.
- **No model-profile / thinking-effort resolution** — `llm.usage` + `turn.usage`
  + `conversation.usage` rollups now emit, but every call still uses one
  hard-wired adapter with no profile/thinking resolution. Wire per-specialist
  policy: `modelProfile` (tier) + orthogonal `thinking` (`off|low|medium|high`)
  resolved per call, with adapters translating `thinking` to each target's native
  control (see DESIGN_chat_specialists_v2 §11 "Reasoning effort") — update
  specialist `medium`/`high`, title `off`. Effort is runtime-enforced, never
  prompt-instructed. LM Studio/Qwen is on/off only (no graceful budget; that's a
  Nova/Claude production capability), so a no-effort model logs a warning and runs
  thinking-on + `max_tokens` cap.
- **Recipes-in-prod-GUI fails silently** — `sepal start gui -p` fails without
  visible errors. Dev server works (`recipes` resolves via `optimizeDeps.include`
  + node_modules symlink). Production goes through Rollup with different module
  resolution and probably needs explicit handling — possibilities to investigate:
  the `recipes` workspace dep + the Vite `optimizeDeps` interaction at build
  time vs serve time, the GUI Dockerfile's npm install order, or the nginx
  static serve config for the bundle. Need to (1) reproduce with build logs
  captured, (2) confirm the `recipes` source is in the production bundle
  (minified + tree-shaken), and (3) verify chat-driven recipe ops work through
  the production nginx reverse proxy.

## Observability

- **`runSpecialist$` and `conversationLoop.step$` share per-round shape but diverge on 9 substantive policy axes** — output mode (stream events vs collect `{answer}`), persistence (`history.append$` vs none), retry trigger (post-tool-only vs any-empty), retry hint role+content (`system`+`emptyAfterToolHint` vs `user`+`STALL_NUDGE`), cap behavior (translatable notice with `display`-tagged history append vs sentinel string), direct-answer shortcut (orchestrator-only), round-0 prompt construction (`messagesForLlm({contextMessage, isolateHistory})` vs raw), tool envelope emission to outer stream (`{toolStart,toolEnd}` vs silent), and bail-result type (`{key, args, fallback}` display object vs string). The structurally identical `prompt` trace event is consolidated in `src/chat/loopEvents.js`. Full primitive unification was considered and rejected: a ≥12-parameter primitive with per-axis policy hooks would be net-neutral on lines while raising the cognitive cost of future behavior changes. Reconsider if the parallel surface grows materially.
- **Late-bound span completion attrs** — `bus.track$(name, attrs, work$)`
  fixes attrs at construction. For LLM/tool spans we want completion attrs such
  as chunks, token usage, cache hits, result size, and status once they are
  known.
- **Over-think recovery** — today's length-cap retry re-reasons from scratch with
  a "be concise" system hint (`LENGTH_CAP_RETRY_HINT`), discarding the prior
  thinking and able to re-cap. Replace with the adapter-internal reasoning-off
  completion pass seeded with the captured reasoning (DESIGN_chat_specialists_v2
  §11 "Reasoning effort"), emitting only the final tool call/answer; log when it
  fires.

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

## Test design

- **`update_recipe` scenario tests pin MOSAIC-specific configuration** — the
  live-loop scenarios under `test/chat/scenarios/updateRecipe/`
  (`speedRequestFlow.test.js`, `prepareUpdateFlow.test.js`) bake in specific
  optical-mosaic field values and op sets (e.g. `cloudBuffer` 600→0,
  `tileOverlap` KEEP→QUICK_REMOVE, the speed-oriented focus-path list). That
  couples them to recipe-specific config/knowledge that will churn, and isn't
  what these tests should pin — they exist to exercise the
  `prepare_update -> recipe_patch` loop mechanics (forwarding, write-scope,
  success envelope), not to assert a particular MOSAIC tuning. They feel
  fragile. Rework to pin the loop generically, decoupled from specific
  optical-mosaic values (e.g. a minimal/synthetic recipe or value-agnostic
  assertions).

## Test coverage

`PRACTICES.md` (Coverage) now allows uncovered code in only two cases: wiring
(`main.js`/`app.js`/`config.js`) and the live I/O call to an uncontrolled external
(the `fetch`/SDK/driver line — translation logic around it is faked-and-tested).
Everything below is our code, testable through a seam, and was consciously left
uncovered for now. Configured coverage is ~98% line / ~88% branch over a subset;
full `src/` is ~94% / ~87%.

- **Observability thunks** — lazy `message: () => …` bodies and their summary/label
  helpers in `conversationEvents`, `titleGenerator`, `openaiChatCompletions`,
  `registry` (resultPayload), `wsChannel` (labels), `specialistEvents`, `llm/events`,
  `loopEvents`. Cover by invoking the thunk and asserting a marker (intent, not
  wording).
- **Defensive / fatal** — `conversation.js` prior-turn error swallow is real
  serialization behaviour (a failed turn must not block the next), test it;
  `logListener` `fatal` + bus `error`/`complete` (stub `process.exit`, error the bus);
  `recipeProjection` non-`PointerNotFound` rethrow (test if reachable, else delete as
  unreachable).
- **Branch gaps in logic** — `recipeSpecialists` metadata-failure / channel-emission
  short-circuits, `runSpecialist` stall/empty-reply paths, `fallbackTitle`
  greeting/thanks heuristics, `llm/index` `hasStructuredToolTraffic`,
  `lmStudioNativeChat` debugLabel/apiKey/empty-output branches, `conversationLoop`
  default-param + `directToolAnswer` guards.
- **Prod files outside the coverage glob** — `turnContext`, `guiRequests`,
  `loopEvents`, `promptSnapshot`, `emitOnEnd`, `diagnostics` are real code excluded
  from `collectCoverageFrom`, so their gaps are invisible. Widen `collectCoverageFrom`
  to `src/**/*.js` (minus the wiring above) and triage what surfaces.
