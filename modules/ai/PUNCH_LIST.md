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

- **Recipe operation dispatchers** — `describe_recipe({recipeId, question?})`,
  `update_recipe({recipeId, instruction})`, and
  `create_recipe({recipeType, instruction, projectId?, name?})` are on the
  orchestrator surface. Update and create both run the same handle-based
  workflow internally: picker chooses handles, prepare builds a handle-keyed
  packet, the specialist calls `{update,create}_recipe_values({values})`, and
  deterministic code maps handles to internal paths (patch ops for update,
  effective-model construction for create). Create always pulls user-required
  handles (`userRequired: true` in the catalog, e.g. MOSAIC `aoi`) into the
  writable set so missing values surface as clarifications instead of being
  defaulted/invented. Both share the same pending-action/clarification resume.
- **Recipe-type coverage is still MOSAIC-first** — MOSAIC has the live handle
  catalog, selector metadata, applicability facts, and handle-keyed update
  flow. Other recipe types still need shared schema/effective-model support,
  handle catalogs, operational facts, and scenario coverage before they should
  use the same update/create workflow.
- **Map specialist read tools are minimal** — `consult_map` exposes
  `get_gui_context`, `map_area_list` (layout + areas + AOI + view), and
  `layer_list` (per-area imageLayer + featureLayers). Still missing:
  per-layer loading/error state, dynamic-vis legend/palette inspection, and
  any live per-area viewport beyond `map.view` (per-area viewports under
  `mapCommand$` are not in Redux).
- **AI `create_recipe` starting point** — use `spec.defaultModel()` as the seed
  and treat creation as an update over defaults. The create workflow should use
  the handle picker/prepare/updater shape where it fits, surface
  `CLARIFICATION_NEEDED` for missing AOI/date/training/class details, and rely
  on the pending-action lifecycle instead of guessing.
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
- **MOSAIC default/effective-model consistency needs watching** — source-specific
  defaults and effective-model cleanup can hide invalid dormant fields. The
  handle update path now diffs against the effective model and rejects
  inapplicable selector items before patching; creation should get the same
  treatment from the start.
- **Summary/value labels are handle-first now, but nested prose still needs
  observation** — applied values and invalidations are handle-keyed, and rich
  item metadata supplies user-facing labels. If raw nested enum IDs leak into
  summaries for whole-object handles such as `datasets`, add a recursive
  handle/value label renderer rather than reintroducing paths.
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

- **Agent-loop vocabulary is explicit in both loops; verdict: keep them
  separate** — both `createSpecialistRuntime` and `conversationLoop` now speak the
  `DESIGN_chat_specialists_v2.md` §4 "Agent-loop north star" vocabulary
  explicitly. In the specialist loop: each round classifies into a closed
  RoundOutcome (`answered`/`tool-requested`/`silent`), a `decideNext` stop
  policy returns a continue/stop Directive read off the outcome + a Timeline
  projection, and the loop (not the policy) owns transient-vs-persisted nudge
  well-formedness. `noProgressNudge`/`finishOnEmpty` read the timeline's
  `{name, ok}` projection; the result exposes `{answer, finishReason, timeline}`
  (tool entries carry `{name, ok, result, input}`); `update_recipe` derives its
  update outcome via a pure `projectUpdateOutcome(timeline)`; prose-only callers
  collapse to `{answer}` via `answerOnly()`. In the orchestrator loop:
  `classifyRound(acc)` produces the same three outcomes, and the stop policy is
  named per round-end — `decideAfterStream$` (no-tool round: empty-after-tool
  retry vs reply) and `decideAfterTools$` (post-tool round: directAnswer / guard
  bail / round cap / continue).

  Decision: **keep two loops, shared vocabulary — do not extract a shared
  primitive.** The shape reads the same in both, but the concrete axes still
  diverge and a unifying primitive would have to parameterize all of them. The
  divergence inventory, re-confirmed: output mode (orchestrator streams channel
  events / specialist collects `{answer}` + timeline), persistence (orchestrator
  mutates `messages` and appends every turn via the `history` port / specialist
  threads an immutable list with no history), tool-outcome record (orchestrator
  reads `isPostToolRound()` off the last message role + guard state / specialist
  keeps an explicit timeline), retry trigger (post-tool-only / any silent
  round), retry hint role+content (`system`+`emptyAfterToolHint`, fires once /
  `user`+`STALL_NUDGE`, stall budget), cap behavior (translatable notice with
  `display`-tagged history append / sentinel string), direct-answer shortcut
  (orchestrator-only), round-0 prompt construction
  (`messagesForLlm({contextMessage, isolateHistory})` / raw), tool envelope
  emission to outer stream (`{toolStart,toolEnd}` / silent), and bail-result
  type (`{key, args, fallback}` display object / string). The structurally
  identical `prompt` trace event is already consolidated in
  `src/chat/loopEvents.js`. The deepest blocker is representational: the
  orchestrator records tool outcomes as persisted history it inspects by role,
  the specialist as an in-memory timeline it projects — unifying would force one
  of them to carry the other's record redundantly. A >=12-parameter primitive
  with per-axis policy hooks was net-neutral on lines while raising the cost of
  future behavior changes; the shared vocabulary captures the commonality without
  that cost.
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
- **Pending actions are process-local v1 state** — active pending actions are
  conversation sidecar workflow state, not chat messages or LLM context. The
  current bridge can keep them in memory if select/reload projects the active
  action back to the client, but production scale needs durable sidecar storage
  (`get/set/clearPendingAction`) in the conversation store before worker
  failover, restarts, or non-sticky load balancing.
- **In-memory caches grow unbounded** — the per-username `chats` map in
  `src/chat/conversation/userChats.js` and the per-user `instances`/`pendingMetas`
  maps in `src/chat/conversation/conversations.js` never evict. Add idle
  eviction or an LRU cap if uptime/user count makes this matter.
- **Conversation store boundary should outlive Redis** — old conversations
  cannot stay resident in production. Keep storage APIs oriented around
  metadata, paged/append-only messages, workflow sidecars, and an evictable
  runtime cache rather than assuming Redis-backed histories are always loaded
  into live `Conversation` objects.
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
