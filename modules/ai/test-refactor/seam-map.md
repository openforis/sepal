# seam-map.md — AI test refactor

One row per existing test file. Status, behaviours pinned, target seam, target
scenario file, coverage targets, replan notes. Populated in **Phase 2**;
referenced in **Phase 3**.

## Seam vocabulary (per PRACTICES.md §"Stable seams")

| Seam | Drives |
|---|---|
| `wsHandler` (WS protocol) | End-to-end including protocol concerns |
| `userChat` | Multi-turn, abort, title-gen timing, lifecycle |
| `messageHandler` / `conversation.sendUserMessage$` | Single turn end-to-end |
| Tool factory `invoke$` | Specialist-internal — validation retry, closure interpretation |
| Tool registry `invoke$` | Envelope contract — validation, error codes, unknown tool |
| LLM port (`llm.respondTo$`) | Provider swap, cross-provider contract |
| Pure algorithm | Single-responsibility input → output |
| Adapter wire boundary | Translation-only |

## Status keys

- `delete` — pure brittle internals test; behaviour to be reached at a stable seam in the planned scenario file
- `consolidate-into-scenario` — behaviour belongs in a stable-seam scenario file
- `keep-as-is` — already at a stable seam (adapter / pure-algorithm / port-conformance / LLM provider)
- `keep-as-is + relocate` — content fine but file lives in the wrong directory

## Target scenario files (planned)

Under `test/chat/scenarios/`:
- `userTurns.test.js` — single-turn happy paths through `messageHandler` / `conversation.sendUserMessage$`
- `multiTurnConversation.test.js` — multi-turn, abort, history persistence at `userChat`
- `recipeEdits.test.js` — `update_recipe` + `describe_recipe` flows at the tool-factory seam
- `specialistConsultations.test.js` — `consult_*` orchestration at the tool-factory seam
- `conversationLifecycle.test.js` — list / select / delete / drift at `userChat`
- `toolFailures.test.js` — registry contract failures + envelope shapes at the registry seam, plus tool-loop guard / cap / retry behaviour at `conversation`
- `wsProtocol.test.js` — WS frame in → frame out at the `wsHandler` seam

No additional scenario files proposed.

## Entries

### test/recipesImport.test.js

- Status: keep-as-is
- LOC: 28
- Behaviours pinned:
    - `#recipes` import surface still resolves `listRecipeSpecs` / `getRecipeSpec` / `validateRecipe` / `getRecipeSchema` / `getRecipeDefaults`
    - `MOSAIC` is in the registry
    - end-to-end validation succeeds on a valid MOSAIC model
- Target seam: Adapter wire boundary (import-map / shared-lib integration)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): boot-time integration check that the shared recipes library is reachable from the AI module — no `src/` lines beyond the require resolver path
- Replan notes:

### test/chat/conversation/userChatAbort.test.js

- Status: consolidate-into-scenario
- LOC: 29
- Behaviours pinned:
    - abort completes the channel and drops later LLM events
    - abort with no in-flight stream is a no-op
- Target seam: `userChat`
- Target scenario file: test/chat/scenarios/multiTurnConversation.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/userChat.js`, `src/chat/conversation/conversation.js` (abort path), `src/chat/conversation/conversationLoop.js` (in-flight teardown)
- Replan notes:

### test/chat/conversation/wsHandler.guiBridge.test.js

- Status: consolidate-into-scenario
- LOC: 29
- Behaviours pinned:
    - `gui-response` routed to `guiRequests.respond` with subscription identity
    - `subscriptionDown` cancels pending GUI requests for that subscription
- Target seam: `wsHandler`
- Target scenario file: test/chat/scenarios/wsProtocol.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/wsHandler.js` (gui-response branch, subscriptionDown branch)
- Replan notes:

### test/chat/llm/providers/openaiChatCompletions.manual.test.js

- Status: keep-as-is
- LOC: 29
- Behaviours pinned:
    - real OpenAI-compatible LLM streams text deltas (manual smoke test)
- Target seam: Adapter wire boundary (manual)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/llm/providers/openaiChatCompletions.js` — real-network smoke
- Replan notes:

### test/chat/conversation/userChatTurnQueue.test.js

- Status: consolidate-into-scenario
- LOC: 37
- Behaviours pinned:
    - turns serialize for one conversation; second turn sees completed first-turn history
    - different conversations run independently
- Target seam: `userChat`
- Target scenario file: test/chat/scenarios/multiTurnConversation.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/conversation.js` (turn queue), `src/chat/conversation/conversations.js` (per-conversation isolation)
- Replan notes:

### test/chat/tools/guiContextTool.test.js

- Status: keep-as-is
- LOC: 39
- Behaviours pinned:
    - no-argument schema
    - returns turn-snapshot when context present
    - reports unavailable when context missing or absent
- Target seam: Tool factory `invoke$` (single-call pure tool — closest to "pure algorithm")
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/guiContextTool.js`
- Replan notes:

### test/chat/conversation/cleanTitle.test.js

- Status: keep-as-is
- LOC: 42
- Behaviours pinned:
    - strips wrapping quotes, trailing punctuation, preamble, list markers, `<think>` tags
    - empty / null input returns null
    - keeps only first line; truncates at 80 chars
- Target seam: Pure algorithm
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/conversation/cleanTitle.js`
- Replan notes:

### test/chat/conversation/redisHistory.test.js

- Status: keep-as-is
- LOC: 44
- Behaviours pinned:
    - load returns appended messages; key TTL applied
    - empty load before any append
    - clear deletes the key
- Target seam: Adapter wire boundary (Redis)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/conversation/redisHistory.js`
- Replan notes:

### test/chat/conversation/wsHandler.context.test.js

- Status: consolidate-into-scenario
- LOC: 45
- Behaviours pinned:
    - forwards a `context` message into `userChat.handle$` with subscription identity
    - routes a `clear-context` command on `subscriptionDown`
- Target seam: `wsHandler`
- Target scenario file: test/chat/scenarios/wsProtocol.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/wsHandler.js` (context, clear-context branches)
- Replan notes:

### test/chat/orchestratorToolRegistry.test.js

- Status: keep-as-is
- LOC: 47
- Behaviours pinned:
    - orchestrator surface lists tool names in a stable order
    - raw `recipe_load` / `recipe_patch` / `load_for_update` are NOT on the orchestrator surface (specialist-private)
- Target seam: Tool registry `invoke$` / surface contract (composition root)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/orchestratorToolRegistry.js` (composition + `schemas()` filtering)
- Replan notes:

### test/chat/conversation/userChatMessages.test.js

- Status: consolidate-into-scenario
- LOC: 49
- Behaviours pinned:
    - locks the conversation, broadcasts user message, streams reply, completes
    - title generation runs only on known conversation turns
    - title generation does not block the next turn
- Target seam: `userChat`
- Target scenario file: test/chat/scenarios/multiTurnConversation.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/messageHandler.js`, `src/chat/conversation/titleGenerator.js` (fire-and-forget timing)
- Replan notes:

### test/chat/tools/projectTools.test.js

- Status: keep-as-is
- LOC: 49
- Behaviours pinned:
    - no-argument schema
    - forwards subscription and `list-projects` action to GUI bridge
    - projects each project to id+name, drops unknown fields
    - GUI failure propagates
- Target seam: Tool factory `invoke$` (single-tool, GUI-bridge wrapper)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/projectTools.js`
- Replan notes:

### test/chat/conversation/conversationListDrift.test.js

- Status: delete
- LOC: 57
- Behaviours pinned:
    - whole-turn history isolation: a completed project_list turn does not drift the next recipe_list request
- Target seam: `conversation.sendUserMessage$`
- Target scenario file: test/chat/scenarios/userTurns.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/llmMessages.js` (history projection), `src/chat/conversation/conversationLoop.js` (two-turn isolation)
- Replan notes: This file pins behaviour at the right seam but its asserts re-encode the entire LLM history projection. The whole-blob `toEqual` on `llm.receivedMessages[2..3]` and on `history.appended` is exactly the red flag PRACTICES.md flags. Replace with one `userTurns.test.js` scenario asserting "second turn's first LLM call sees completed prior turn (no tool noise) and the new user message" — narrow facet pin, no whole-history snapshot. Delete the rest; `llmMessages.test.js` already covers projection.

### test/chat/conversation/wsHandler.errors.test.js

- Status: consolidate-into-scenario
- LOC: 59
- Behaviours pinned:
    - `wsConnectionError` published when inbound stream errors
    - `wsRouteError` published when routing throws
    - `workFailed` published when dispatched work errors
- Target seam: `wsHandler`
- Target scenario file: test/chat/scenarios/wsProtocol.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/wsHandler.js` (error branches)
- Replan notes: Keep all three error paths in `wsProtocol.test.js`; they require the wire-frame seam to fire.

### test/chat/conversation/redisConversationsStore.test.js

- Status: keep-as-is
- LOC: 62
- Behaviours pinned:
    - add / list (newest-first) with TTL
    - get by id, missing-id is undefined
    - touch returns whether the record existed
    - updateTitle returns whether the record existed
    - delete removes meta + history key
- Target seam: Adapter wire boundary (Redis)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/conversation/redisConversationsStore.js`
- Replan notes:

### test/chat/tools/sepalTools.test.js

- Status: keep-as-is
- LOC: 63
- Behaviours pinned:
    - `sepalTools` returns the pure SEPAL product tool list (no specialist-backed tools)
    - `describe_recipe` is added at chat-level composition, not by `sepalTools`
    - product tools do not flag `directAnswer`
    - `specialistInnerTools` keeps `recipe_load`, `recipe_patch`, `load_for_update`
    - orchestrator surface does not expose `recipe_patch` or `load_for_update`
- Target seam: Tool registry `invoke$` / surface contract (composition root)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/sepalTools.js`
- Replan notes:

### test/chat/conversation/conversationOrchestratorTools.test.js

- Status: delete
- LOC: 66
- Behaviours pinned:
    - orchestrator can call `get_gui_context` and see the GUI context in tool results
    - `describe_recipe` streams specialist prose verbatim through `directAnswer` bypass
    - `recipe_load` not exposed to the orchestrator
- Target seam: `conversation.sendUserMessage$`
- Target scenario file: test/chat/scenarios/userTurns.test.js (describe-recipe flow → move to recipeEdits.test.js)
- Coverage targets (src lines this currently exercises): `src/chat/orchestratorToolRegistry.js` (composition), `src/chat/conversation/conversationLoop.js` (`directAnswer` bypass)
- Replan notes: The `describe_recipe` `directAnswer` happy-path belongs in `recipeEdits.test.js` reached via `aConversationHarness` + the real registry. The `get_gui_context` happy path is a duplicate of `userTurns.test.js` once turn-context routing is pinned there. The "not exposed" assertion already lives in `orchestratorToolRegistry.test.js` and `sepalTools.test.js` — drop it.

### test/chat/tools/recipeMetadata.test.js

- Status: keep-as-is
- LOC: 67
- Behaviours pinned:
    - issues `recipe-metadata` GUI request with the supplied recipeId
    - wraps success as `{ok: true, data}`
    - wraps unstructured failure as `TOOL_FAILED`
    - propagates structured error codes (e.g. `RECIPE_NOT_FOUND`) instead of flattening
    - passes channel emissions through unwrapped (regression: double tool-result)
- Target seam: Tool factory `invoke$` / pure helper (envelope shaping for one GUI action)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/recipeMetadata.js`
- Replan notes:

### test/chat/tools/jsonPointer.test.js

- Status: keep-as-is
- LOC: 69
- Behaviours pinned:
    - `parsePointer` empty, slashed, escape sequences, leading-slash validation
    - `resolvePointer` walks objects + arrays; throws on missing / bad index / non-object descent
    - `formatPointer` empty, slashed, escapes
- Target seam: Pure algorithm
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/jsonPointer.js`
- Replan notes:

### test/chat/emitOnEnd.test.js

- Status: keep-as-is
- LOC: 71
- Behaviours pinned:
    - emits terminal sentinel on natural completion, on error, after `takeUntil`, on empty, never before source ends
- Target seam: Pure algorithm (RxJS operator)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/emitOnEnd.js`
- Replan notes:

### test/app.manual.test.js

- Status: keep-as-is
- LOC: 74
- Behaviours pinned:
    - real app boots, accepts WS connection, creates conversation, streams chat-response (manual smoke test)
- Target seam: Adapter wire boundary (manual end-to-end)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/main.js`, `src/app.js`, `src/server.js`
- Replan notes:

### test/server.test.js

- Status: keep-as-is
- LOC: 75
- Behaviours pinned:
    - routes a `/ws` connection through `wsStream` to the wsHandler
    - wraps the start in a `server.start` span
- Target seam: Adapter wire boundary (HTTP / WS server composition)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/server.js`
- Replan notes:

### test/chat/tools/guiRequests.diagnostics.test.js

- Status: delete
- LOC: 88
- Behaviours pinned:
    - publishes `gui.request` event on request
    - publishes `gui.response` event with matched / unmatched / not-found flags depending on routing outcome
- Target seam: event publisher (internal — not a seam per PRACTICES.md)
- Target scenario file: n/a (subsumed by the positive routing tests in `guiRequests.test.js` and by `wsProtocol.test.js` / `userTurns.test.js`)
- Coverage targets (src lines this currently exercises): `src/chat/guiRequests.js` (diagnostic event-publish branches inside `request` / `respond`)
- Replan notes: This is the "asserts event ordering / exact log strings" red flag. `guiRequests.test.js` (kept) pins routing on the user-observable surface (request / response / cancel side effects). The diagnostic events are observability tuning surface — `levels` and `messages` change without behaviour change. If a specific diagnostic-emission contract is load-bearing (e.g. `pendingFound: false` distinct from `matched: false` for downstream alarms), reframe that one assertion at the consumer's seam — otherwise drop.

### test/chat/llmText/prompts.test.js

- Status: keep-as-is
- LOC: 92
- Behaviours pinned:
    - `loadPromptFile` returns contents, throws on empty / missing
    - `mainSystemPrompt`, `titleSystemPrompt`, `specialistPrompt` load expected assets
    - asset content includes prompt-intent markers (regex-based, not verbatim)
- Target seam: Pure algorithm + asset-load contract
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/llmText/prompts.js`
- Replan notes:

### test/chat/tools/registry.diagnostics.test.js

- Status: delete
- LOC: 94
- Behaviours pinned:
    - publishes `tool.result` debug event with kind/count/firstItemKeys for arrays
    - publishes `tool.result` with error code on failure
    - publishes `tool.resultPayload` trace event
- Target seam: event publisher (internal)
- Target scenario file: n/a (subsumed by `registry.test.js` positive envelopes + by tool-loop scenarios)
- Coverage targets (src lines this currently exercises): `src/chat/tools/registry.js` (diagnostic publish branches)
- Replan notes: Asserts exact log strings (e.g. `"tool recipe_list -> ok kind=array count=3 named=2"`) — classic "tuning surface" red flag. Behaviour the bus events enable (tool-end channel events) is covered in `userTurns.test.js`/`recipeEdits.test.js`. Drop wholesale; if a specific event field becomes load-bearing for `logListener` routing it earns its own assertion at the consumer.

### test/chat/conversation/conversation.queue.test.js

- Status: consolidate-into-scenario
- LOC: 101
- Behaviours pinned:
    - queue serializes concurrent sends on the shared messages array
    - abort tears down the in-flight turn; no further events emit
    - abort is a no-op when nothing is in-flight
    - abort cancels the running turn only; queued turns proceed
    - `isStreaming` toggles around the turn
    - on abort the user message stays in history
- Target seam: `userChat` (queue + abort) and `conversation.sendUserMessage$` (isStreaming, history-on-abort)
- Target scenario file: test/chat/scenarios/multiTurnConversation.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/conversation.js` (queue + abort + isStreaming)
- Replan notes: Move queue + abort facets to `multiTurnConversation.test.js`; `isStreaming` is a read-back of an internal flag — keep it only if a scenario observes it (otherwise drop). The persisted-on-abort facet belongs in `userTurns.test.js`.

### test/chat/conversation/conversation.test.js

- Status: consolidate-into-scenario
- LOC: 116
- Behaviours pinned:
    - emits assistant reply, persists user + assistant turn
    - streams text chunks; persists assembled assistant message
    - second turn sees completed prior history
    - initial messages in LLM view but not persisted
    - existing history loaded before next turn
    - runtime turn context used but not stored
    - wraps user turn and LLM call in trace spans
- Target seam: `conversation.sendUserMessage$`
- Target scenario file: test/chat/scenarios/userTurns.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/conversation.js`, `src/chat/conversation/conversationLoop.js` (happy text-only turn), `src/chat/turnContext.js` (turn-context routing), `src/chat/conversation/llmMessages.js` (history projection)
- Replan notes: The "wraps in trace spans" assertion is event-publisher coupling — keep only if a downstream consumer depends on span names. Otherwise drop. Everything else is core `userTurns.test.js` material, using `aConversationHarness`.

### test/chat/conversation/conversationSpecialists.test.js

- Status: consolidate-into-scenario
- LOC: 116
- Behaviours pinned:
    - `consult_map` `directAnswer` streams specialist prose directly (no orchestrator restate)
    - `update_recipe` `directAnswer` streams specialist prose directly
    - `describe_recipe` `directAnswer` streams specialist prose directly
    - tools without `directAnswer` get a restate round even if data has an `answer` field
    - `consult_map` inner loop uses its scoped map inspection tools through the real registry
- Target seam: `conversation.sendUserMessage$` (the `directAnswer` bypass is the orchestrator-loop contract)
- Target scenario file: test/chat/scenarios/specialistConsultations.test.js (consult_map + the cross-cutting `directAnswer` semantics); the `update_recipe` row belongs in `recipeEdits.test.js`; the negative "no directAnswer" facet lives in `userTurns.test.js`
- Coverage targets (src lines this currently exercises): `src/chat/conversation/conversationLoop.js` (directAnswer branch), `src/chat/specialists/specialistConsultationTools.js`, `src/chat/orchestratorToolRegistry.js`
- Replan notes: The `directAnswer` flag is the orchestrator-loop contract, not a specialist-internal — pin it once at the orchestrator-loop seam (`userTurns.test.js` for the negative case is the cleanest pin; the positive case fits in each specialist's scenario file).

### test/chat/conversation/llmMessages.test.js

- Status: keep-as-is
- LOC: 120
- Behaviours pinned:
    - completed tool turns replay as plain user/assistant dialogue
    - assistant text from tool-call messages survives; the executable call drops
    - post-tool rounds isolate history to system + active turn
    - context message splices between completed history and current user message
    - context message splices even with `isolateHistory`
    - null contextMessage omits the slot entirely
- Target seam: Pure algorithm
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/conversation/llmMessages.js`
- Replan notes:

### test/chat/tools/mapTools.test.js

- Status: keep-as-is
- LOC: 125
- Behaviours pinned:
    - `map_area_list` and `layer_list` schemas (no-arg, additionalProperties:false)
    - forwards subscription + `list-map-areas` / `list-layers` actions to GUI bridge
    - returns populated summary unchanged
    - returns unavailable marker when no recipe is active
    - GUI failure propagates
- Target seam: Tool factory `invoke$` (single-tool GUI-bridge wrapper)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/mapTools.js`
- Replan notes:

### test/chat/turnContext.test.js

- Status: keep-as-is
- LOC: 126
- Behaviours pinned:
    - `shapeTurnContext` whitelist, caps (open recipes/apps + any array), string truncation, dropping empties, null handling
    - `turnContextMessage` produces a non-persisted system message, escapes markup, drops largest fields under byte budget
- Target seam: Pure algorithm
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/turnContext.js`
- Replan notes:

### test/chat/llm/index.test.js

- Status: keep-as-is
- LOC: 132
- Behaviours pinned:
    - builds both provider adapters from the shared config
    - routes non-reasoning lmstudio requests to the native path
    - routes reasoning lmstudio requests to the OpenAI-compatible path
    - routes lmstudio tool requests through OpenAI with `enable_thinking: false`
    - never sends structured tool history to the native path
    - preserves caller extra params when disabling thinking
    - non-lmstudio providers always go through OpenAI-compatible path
- Target seam: LLM port (`llm.respondTo$`) — provider selector
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/llm/index.js`
- Replan notes: Uses `jest.mock` on adapter modules and `toHaveBeenCalledWith` — acceptable for an adapter-of-adapters selector test. A future iteration could swap to fake provider instances passed in via constructor, but the present shape is fit for purpose; leave alone.

### test/chat/conversation/userChatContext.test.js

- Status: consolidate-into-scenario
- LOC: 138
- Behaviours pinned:
    - sending subscription's context attaches to the LLM turn (and isolates between subscriptions)
    - subscription-targeted context drops after `clearContext$`
    - tools receive `{conversationId, clientId, subscriptionId, guiContext}` for tool invocations
    - message-supplied GUI context wins over stale cached context (both for LLM and tool context)
    - tool-start and tool-end broadcast to the channel for each invocation
    - tool-round-cap notice broadcast to the channel when the loop hits the cap
- Target seam: `userChat`
- Target scenario file: test/chat/scenarios/multiTurnConversation.test.js (context routing) plus a slice in test/chat/scenarios/userTurns.test.js (tool-context propagation + tool-start/end broadcast); the tool-round cap notice is `toolFailures.test.js`
- Coverage targets (src lines this currently exercises): `src/chat/conversation/userChat.js`, `src/chat/conversation/guiContexts.js`, `src/chat/conversation/messageHandler.js`, `src/chat/conversation/conversationLoop.js` (tool-round cap)
- Replan notes:

### test/chat/llm/providers/lmStudioNativeChat.test.js

- Status: keep-as-is
- LOC: 138
- Behaviours pinned:
    - constructable without `baseURL`
    - calls `/api/v1/chat` with reasoning off, model + headers correct
    - never sends `tools` / `tool_choice` on the native path
    - errors observable on non-OK responses
    - publishes compact debug `llm.request` / `llm.response` events under a `debugLabel`
- Target seam: Adapter wire boundary (LLM provider)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/llm/providers/lmStudioNativeChat.js`
- Replan notes:

### test/logListener.test.js

- Status: keep-as-is
- LOC: 145
- Behaviours pinned:
    - `onEvent` logs at declared level; lazy message functions pass through; events with no level/message are ignored
    - `categoryOf` first-segment routing; span suffix stripping; orchestrator/update_recipe/specialist routing; ws fallback bucket
    - `log.json` declares orchestrator + update_recipe categories
    - memoization sketch via tracking-loggerFor
- Target seam: Pure algorithm + adapter (log4js routing)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/logListener.js` (partial — same as baseline 42.3 %)
- Replan notes:

### test/chat/conversation/titleGenerator.test.js

- Status: consolidate-into-scenario
- LOC: 147
- Behaviours pinned:
    - generates a title via the LLM and emits a `conversation-updated` event
    - passes user/assistant exchange with the title system prompt
    - asks the LLM with bounded, deterministic, reasoning-off settings
    - publishes `title.prompt` (trace) + `title.rawResponse` (debug)
    - persists the final title to the store
    - streams partial titles as the LLM emits chunks
    - ignores non-text events while accumulating the title
    - does not re-enter while a previous title generation is still in flight
- Target seam: `userChat` (title-gen timing + persistence outcome) — the title-generator itself is an internal collaborator
- Target scenario file: test/chat/scenarios/multiTurnConversation.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/titleGenerator.js`
- Replan notes: At the `userChat` seam, "title gets generated and persisted after the first turn" is one observable assertion; "second turn does not block on it" is one more (already in `userChatMessages.test.js`). The streaming-chunks behaviour is title-generator-internal — likely drop unless a downstream consumer observes per-chunk updates over the channel (in which case pin it at the channel). `title.prompt` / `title.rawResponse` are event-publisher events — drop unless `logListener` routing depends on them.

### test/chat/specialists/specialistConsultationTools.test.js

- Status: consolidate-into-scenario
- LOC: 147
- Behaviours pinned:
    - exposes a `consult_map` tool with question schema
    - opts into `directAnswer`
    - throws at construction when an allowed tool is not registered
    - seeds the inner LLM with the map specialist prompt
    - forwards the user question to the inner LLM
    - offers only the allowed tool schemas to the inner LLM
    - lets the inner LLM call `map_area_list` through the inner registry
    - returns the specialist answer as tool result data
    - refuses non-allowed tool calls (`TOOL_NOT_ALLOWED`)
- Target seam: Tool factory `invoke$`
- Target scenario file: test/chat/scenarios/specialistConsultations.test.js
- Coverage targets (src lines this currently exercises): `src/chat/specialists/specialistConsultationTools.js`, `src/chat/specialists/specialistScope.js`, `src/chat/specialists/runSpecialist.js` (allowed-tool gate + happy-path inner loop)
- Replan notes:

### test/chat/toolCallGuard.test.js

- Status: keep-as-is
- LOC: 157
- Behaviours pinned:
    - `blockedRepeat` returns null for unseen calls, blocks after a prior failure with `TOOL_REPEAT_BLOCKED`
    - same-keys-different-order treated as identical; nested + arrays canonicalised
    - arrays are order-sensitive
    - `bail` returns the configured sentinel after consecutive failures / invalid args
    - same-tool success resets the consecutive counter
    - `INVALID_TOOL_ARGS` counts only against the invalid-args limit
    - keeps the first bail value once triggered
- Target seam: Pure algorithm
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/toolCallGuard.js`
- Replan notes:

### test/chat/tools/recipePatchTool.test.js

- Status: keep-as-is
- LOC: 158
- Behaviours pinned:
    - schema (recipeId / baseModelHash / operations required) — points specialist at `load_for_update` not `recipe_load`
    - issues `recipe-patch` GUI request with full input
    - wraps success / unstructured failure / structured failure (`STALE_WRITE`, `INVALID_PATCH`, `PATCH_APPLY_FAILED`, `VALIDATION_FAILED`, `RECIPE_NOT_FOUND`)
    - passes channel emissions through unwrapped
- Target seam: Tool factory `invoke$` (single GUI-bridge tool)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/recipePatchTool.js`
- Replan notes: The schema body's `toEqual` is whole-shape — marginally a smell, but the schema body **is** the contract sent to the LLM, so the whole-shape pin earns its place. Leave alone.

### test/chat/conversation/messageHandler.test.js

- Status: delete
- LOC: 162
- Behaviours pinned:
    - GUI context resolution: message-supplied wins over cached
    - emits status + user-message at turn start, chat-response complete at end
    - translates `textDelta` / `toolStart` / `toolEnd` / `notice` events into channel events
    - unwraps channel emissions and forwards the bare event
    - persists-or-touches before the turn; runs the title generator after
- Target seam: `messageHandler` / `conversation.sendUserMessage$`
- Target scenario file: test/chat/scenarios/userTurns.test.js (turn-boundary notifications + event routing); test/chat/scenarios/multiTurnConversation.test.js (persist-or-touch + title-gen sequencing)
- Coverage targets (src lines this currently exercises): `src/chat/conversation/messageHandler.js`
- Replan notes: Behaviour is right but the fakes are local `aFakeConversation` / `aFakeConversations` / `aFakeGuiContexts` — the `aUserChatHarness` covers all of this with real collaborators. Move the assertions into scenario files; drop the file once those scenarios pin the channel-event shape.

### test/eventBus.test.js

- Status: keep-as-is
- LOC: 163
- Behaviours pinned:
    - `events$` delivers published events to subscribers
    - `track` (Promise) publishes started + completed + failed events with `durationMs`; re-throws; returns the work value
    - `track$` (Observable) publishes started + completed + failed; propagates values; re-emits errors
- Target seam: Pure algorithm (RxJS-based event bus)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/eventBus.js`
- Replan notes: One whole-shape `toEqual` on a started/completed event is acceptable here — the event shape **is** the contract consumed by `logListener`.

### test/chat/promptSnapshot.test.js

- Status: keep-as-is
- LOC: 164
- Behaviours pinned:
    - `messages` header + one block per message; renders full text for system/user
    - renders assistant tool calls with id/name/input JSON
    - renders tool-result messages with `toolCallId`, `toolName`, `ok`, bounded shape; failed result shows error code
    - real ~10KB system prompt survives unclamped to the snapshot cap; huge content gets capped with `...`
    - tools section header + per-tool block (name/description/parameter JSON); `tools: (none)` empty fallback; over-cap schemas truncated
- Target seam: Pure algorithm (debug snapshot renderer)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/promptSnapshot.js`
- Replan notes:

### test/chat/conversation/titleGenerator.fallback.test.js

- Status: keep-as-is + relocate
- LOC: 171
- Behaviours pinned:
    - already-titled conversation: no LLM call, no title update
    - aborted turn (no assistant reply): no LLM call, title empty
    - LLM call fails: title empty
    - LLM returns nothing usable: deterministic fallback for greetings, thanks, NDVI-style user prompts, assistant-summary fallback when user has none, gives up only when neither side has usable content
- Target seam: Pure algorithm (`fallbackTitle.js`) + the title-generator's own fallback wiring (skip-LLM / empty-LLM-stream paths)
- Target scenario file: n/a — these are deterministic fallback algorithm tests
- Coverage targets (src lines this currently exercises): `src/chat/conversation/fallbackTitle.js`, `src/chat/conversation/titleGenerator.js` (skip-LLM and empty-LLM branches)
- Replan notes: Mostly pure algorithm coverage routed through `titleGeneratorHarness`. The `bus.published.find(event => event.type === 'title.generated').message` and `title.empty` assertions pin event-publisher names — replace with channel-event observation (no title update vs a particular fallback title) once `multiTurnConversation.test.js` exercises this path; the algorithm assertions stay. **Relocation suggested**: split into `test/chat/conversation/fallbackTitle.test.js` mirroring `src/chat/conversation/fallbackTitle.js` (the pure cases) and let `multiTurnConversation.test.js` cover the skip-LLM / fail-LLM / no-fallback-possible facets. Defer to Phase 3.

### test/chat/conversation/wsHandler.logging.test.js

- Status: delete
- LOC: 172
- Behaviours pinned:
    - heartbeats, gateway lifecycle, empty messages logged at trace level with `kind: ignored`
    - every wire command publishes a self-describing `wsIn` event with `kind`, `level`, `message`
- Target seam: event publisher (internal)
- Target scenario file: n/a (subsumed by `wsProtocol.test.js` exercising the actual routing on each command + by `logListener.test.js` for category routing)
- Coverage targets (src lines this currently exercises): `src/chat/conversation/wsHandler.js` (publishWsIn branches)
- Replan notes: The whole file is "exact log strings + log levels" — the canonical PRACTICES.md red flag. The routing behaviour the events enable (each command produces the right downstream effect) belongs in `wsProtocol.test.js`. If a single `wsIn` event field becomes load-bearing for `logListener` (e.g. `kind` is used to drive category routing today and that's coupled), pin that **one** assertion at the consumer's seam.

### test/chat/specialists/assembleSpecialistPrompt.test.js

- Status: keep-as-is
- LOC: 176
- Behaviours pinned:
    - returns base prompt unchanged when spec is null
    - throws on missing / unknown `purpose`
    - base prompt is the cache-stable prefix
    - includes spec id + name in the type-specific section
    - `describe` purpose renders description + outputs only; suppresses selection / edit / schema content
    - `update` purpose renders edit guidance; suppresses selection / describe content
    - `update` purpose includes schema in fenced JSON when `includeSchema: true`, after edit guidance
    - returns base prompt when the spec has no matching facts function
- Target seam: Pure algorithm
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/specialists/assembleSpecialistPrompt.js`
- Replan notes:

### test/chat/conversation/userChatLifecycle.test.js

- Status: consolidate-into-scenario
- LOC: 182
- Behaviours pinned:
    - create-conversation: pending state + claim
    - persistence only after first message
    - touch updatedAt on subsequent messages
    - lists persisted conversations
    - select loads messages + status while streaming
    - rebuilds a persisted conversation before sending / loading
    - ignores unknown conversation ids for load / send / delete
    - delete one / delete all + no-notifications when delete-all empty
    - in-flight stream stopped on delete
    - direct `aUserChat` builder works
- Target seam: `userChat`
- Target scenario file: test/chat/scenarios/conversationLifecycle.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/userChat.js`, `src/chat/conversation/conversations.js`, `src/chat/conversation/conversation.js` (delete cancellation)
- Replan notes: The "stops in-flight stream on delete" facet uses a controllable LLM Subject — that pattern is preserved via the `aUserChatHarness` collectors. The "direct `aUserChat` builder works" assertion is a meta-test on the legacy harness — drop once Phase 3 retires `userChatHarness.js`.

### test/chat/tools/guiRequests.test.js

- Status: keep-as-is
- LOC: 190
- Behaviours pinned:
    - emits a `gui-action` channel event first
    - emits response data after the channel event on matching `gui-response`
    - errors on `success: false` with structured / plain-string / coded errors
    - preserves extra fields on structured errors (`STALE_WRITE.currentModelHash`, `VALIDATION_FAILED.errors[]`)
    - ignores unknown / mis-routed responses (different requestId, subscriptionId, clientId)
    - ignores late responses
    - errors on timeout
    - cancels pending requests for a subscription, scoped per-subscription
- Target seam: Tool factory `invoke$` / pure helper (request bridge — single source of GUI-bridge contract)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/guiRequests.js`
- Replan notes:

### test/chat/tools/recipeProjection.test.js

- Status: keep-as-is
- LOC: 195
- Behaviours pinned:
    - root load returns model fields at root + `baseModelHash`
    - drops identity fields (id/type/name/projectId/model)
    - path-scoped load returns `{value, baseModelHash}`
    - reference-data marker on item / array paths; omitted when above
    - throws on invalid pointer
    - returns no `value` for missing path
    - throws when loaded recipe has no `modelHash`
    - silent-passthrough for unspecced recipe types
    - MOSAIC: projects through `toEffectiveModel` (strips dormant fields) before pointer
- Target seam: Pure algorithm
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/recipeProjection.js`
- Replan notes:

### test/chat/tools/loadForUpdateTool.test.js

- Status: keep-as-is
- LOC: 201
- Behaviours pinned:
    - schema (recipeId + instruction required)
    - issues `load-recipe` GUI request
    - returns `baseModelHash` from the loaded recipe
    - returns MOSAIC date closure on target-date intent (`/dates/targetDate`, dependentPaths, guidance)
    - returns broad closure when no deterministic intent
    - projects through `toEffectiveModel` before closure (strips dormant fields)
    - does not return the full model when a deterministic closure is available
    - passes channel emissions through unwrapped
    - wraps unstructured / structured failures (`RECIPE_NOT_FOUND`, `UNSUPPORTED_RECIPE_TYPE`, `MISSING_MODEL_HASH`)
- Target seam: Tool factory `invoke$` (single GUI-bridge tool with intent-based closure planning)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/loadForUpdateTool.js`
- Replan notes:

### test/chat/tools/registry.test.js

- Status: keep-as-is
- LOC: 204
- Behaviours pinned:
    - `schemas()` returns provider-agnostic name/description/parameters; never includes `directAnswer`
    - `flag()` reflects descriptor booleans; false for unknown tool
    - `invoke$` wraps success into `{ok: true, data}` envelope; pass-through for already-enveloped tool results
    - logs structured validation error details
    - passes turn context to the tool
    - `UNKNOWN_TOOL` envelope for missing tools
    - `TOOL_FAILED` envelope when tool throws
    - `INVALID_TOOL_ARGS` envelope for schema mismatches and adapter parse errors
    - does not invoke the tool when args are invalid
- Target seam: Tool registry `invoke$`
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/registry.js`
- Replan notes: The `bus.published.find(event => event.type === 'tool.result')` assertion pins event-publisher detail — drop it (covered by drop of `registry.diagnostics.test.js`). All other facets are clean envelope-contract assertions.

### test/chat/diagnostics.test.js

- Status: keep-as-is
- LOC: 206
- Behaviours pinned:
    - `truncateString` truncates / passes scalars through / defaults to `MAX_DEBUG_TEXT`
    - `summarizeMessages` bounded by default: replaces content with `contentChars`; preserves assistant tool-call shape with `inputKeys`; replaces tool-result envelopes with shape descriptors; failed tool results with error code; deterministic key order; handles circular refs
    - `summarizeTools` bounded by default: keeps names + parameter keys, drops descriptions to size; handles tools without parameters
    - `summarizeObject` reports shape, array length, scalar types with size, handles circular refs
    - full-payload opt-in: emits full stable JSON, still truncates over-long payloads at `MAX_DEBUG_TEXT`, sorts keys
    - exposes the `fullPayloads` flag
- Target seam: Pure algorithm
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/diagnostics.js` (file exists but is not in the active path — leave the test green for now)
- Replan notes: `src/chat/diagnostics.js` is not on the active code path per the conversationEvents pruning (see `conversationEvents.test.js` notes). If diagnostics is genuinely dead, file this for Phase 3 cleanup — delete the test alongside the src file. For now, keep-as-is.

### test/chat/tools/recipeTools.test.js

- Status: keep-as-is
- LOC: 219
- Behaviours pinned:
    - `recipe_list` schema (optional type / projectId filter)
    - forwards subscription + filter params; omits absent filters
    - projects each recipe to compact summary, drops unknown fields, falls back to title / placeholder for missing name, omits absent / empty projectId
    - GUI failure propagates
    - `recipe_open` opens recipe by id with `open` action
    - `recipe_load` schema (recipeId required, optional path)
    - asks GUI to load without forwarding the model path
    - returns projected fields + baseModelHash for root load
    - returns `{baseModelHash, value}` for path-scoped load; `value` undefined for missing path
    - fails when GUI response has no `modelHash`
- Target seam: Tool factory `invoke$` (single GUI-bridge tools, three tools per file)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/tools/recipeTools.js`
- Replan notes:

### test/chat/specialists/specialistEvents.test.js

- Status: delete
- LOC: 234
- Behaviours pinned:
    - `publishSpecialistRequest` shape + render
    - `publishSpecialistResponse` empty/non-empty shape, lazy text
    - `publishSpecialistToolRequest`, `publishSpecialistToolResponse` per-tool shape summaries
    - `publishUpdateRecipeOutcome` outcomes (`ok` / `UPDATE_NOT_ATTEMPTED` / `UPDATE_FAILED` / `RECIPE_NOT_FOUND`)
- Target seam: event publisher (internal — not a seam)
- Target scenario file: n/a (the outcomes that downstream consumers depend on — `update_recipe.outcome` — are already asserted in `updateRecipeTool.test.js` at the tool-factory seam, which is the right place since it's the producer)
- Coverage targets (src lines this currently exercises): `src/chat/specialists/specialistEvents.js`
- Replan notes: This is whole-object `toEqual` on rich event shapes including the exact `message` string — the canonical "pins tuning surface" red flag. The user-observable behaviour (update_recipe outcomes) is pinned in `updateRecipeTool.test.js`. Drop wholesale.

### test/chat/conversation/conversationEvents.test.js

- Status: delete
- LOC: 285
- Behaviours pinned:
    - orchestrator-loop debug log prefixes (`LLM orchestrator …` / `debugLabel orchestrator …`)
    - `orchestrator.prompt` trace event shape, lazy message, category routing
    - `conversation.llmMessages` / `llmTools` / `llmToolCallPayload` / `historyProjectionPayload` are bounded by default; full-payload opt-in via `diagnostics.fullPayloads`
    - `conversation.llmEmptyReply` / `llmEmptyRetry` enrichment fields
- Target seam: event publisher (internal)
- Target scenario file: n/a — the empty-reply retry behaviour is in `userTurns.test.js` / `toolFailures.test.js` (via `conversationToolLoop.test.js`); orchestrator log attribution is observability tuning
- Coverage targets (src lines this currently exercises): `src/chat/conversation/conversationEvents.js`
- Replan notes: Whole-file event-publisher pinning — exact log prefixes, lazy-message presence/absence, full vs bounded payloads. Drop. If `logListener` routing requires the `orchestrator.prompt` type/category be stable, pin that **one** assertion in `logListener.test.js`. The retry/empty-reply behaviour the events report on is the responsibility of `conversationToolLoop.test.js` / scenarios.

### test/chat/conversation/wsHandler.commands.test.js

- Status: consolidate-into-scenario
- LOC: 285
- Behaviours pinned:
    - `subscriptionUp` pushes the conversation list on connect
    - `create-conversation` emits `conversation-created` (targeted) + `conversation-claimed` (broadcast-except)
    - `message` emits `chat-response` as broadcast; uses supplied `conversationId`; drops messages before / after `subscriptionUp` / `Down`
    - recovers a missing subscription on reconnect with persisted conversation
    - `select-conversation` emits `conversation-loaded` targeted
    - `list-conversations` emits `conversations` targeted; recovers missing subscription
    - `subscriptionDown` cancels pending GUI requests without creating subscription
    - `message` lock cycle (status broadcast + user-message broadcast-except)
    - `abort` routes through to `chat-response complete`
    - `delete-conversation` / `delete-all-conversations` emit `conversation-deleted` broadcasts
- Target seam: `wsHandler`
- Target scenario file: test/chat/scenarios/wsProtocol.test.js
- Coverage targets (src lines this currently exercises): `src/chat/conversation/wsHandler.js`, `src/chat/conversation/wsChannel.js` (frame-out routing)
- Replan notes: All these facets need the wire-frame seam — the targeted vs broadcast vs broadcast-except routing is exactly what only this seam pins. Trim aggressively though: the per-command "lock cycle" and "drop messages before subscriptionUp" facets can collapse into ≤3 scenarios; the rest are one-liner targeting assertions.

### test/chat/conversation/wsChannel.test.js

- Status: keep-as-is + relocate
- LOC: 301
- Behaviours pinned:
    - per-channel-event dispatch translates to the right wire shape with the right targeting (broadcast / broadcast-except / targeted)
    - `wsOut` published at expected levels with formatted messages
- Target seam: Adapter wire boundary (channel events → WS frame)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/conversation/wsChannel.js`
- Replan notes: This is the outbound-adapter test. Wire-shape `toEqual` is the contract here; targeting flags are not incidental. The `wsOut` log-message assertions are tuning surface — drop those (each test currently has both a wire `toEqual` and a `published[0]` log assertion); keep only the wire assertion. After that trim, file size halves and stays as a focused adapter test.

### test/chat/specialists/recipeSpecialists.test.js

- Status: consolidate-into-scenario
- LOC: 305
- Behaviours pinned:
    - `describe_recipe` description steers off chaining + opts into `directAnswer`
    - schema (recipeId required, question optional)
    - throws at construction when inner registry is missing `recipe_load`
    - seeds inner LLM with recipe specialist prompt; passes recipeId + question in user message
    - only offers `recipe_load` to the specialist; calls it through the inner registry
    - returns derived description as `{answer}`, not raw model
    - fresh-session semantics across invocations
    - refuses `recipe_load` for a different recipeId (`RECIPE_SCOPE_VIOLATION`)
    - refuses non-allowed inner tool calls (`TOOL_NOT_ALLOWED`)
    - per-type prompt assembly (MOSAIC includes describeFacts; suppresses selection facts + edit guidance; falls back to base for unspecced types)
    - metadata-lookup failure short-circuits before specialist runs; uses `recipe-metadata` GUI request not `recipe_load`; no preflight `recipe_load`
- Target seam: Tool factory `invoke$`
- Target scenario file: test/chat/scenarios/recipeEdits.test.js
- Coverage targets (src lines this currently exercises): `src/chat/specialists/recipeSpecialists.js` (describeRecipeTool half), `src/chat/specialists/assembleSpecialistPrompt.js` (integration), `src/chat/specialists/specialistScope.js`, `src/chat/specialists/runSpecialist.js`
- Replan notes:

### test/chat/llm/providers/openaiChatCompletions.test.js

- Status: keep-as-is
- LOC: 491
- Behaviours pinned:
    - passes bounded generation params + provider extra params
    - sends tool schemas in provider function format; `tool_choice: 'auto'`
    - defaults `max_tokens: 4096`; explicit caller `maxTokens` wins
    - omits tools / tool_choice when no tools supplied
    - formats internal tool-call / tool-result messages into provider message shape; names originating tool in result content
    - whitespace-only assistant content with tool calls → null
    - strips GUI display descriptor from assistant messages before sending
    - parses streamed tool calls into normalised `toolCall` events (multi-chunk, multi-call, JSON-parse errors with `argsError`)
    - text deltas emit before tool calls when both present
    - `length-cap observability`: retries once on `finish_reason=length` with empty payload; retries instead of emitting a length-capped partial tool call; doesn't retry a second time; `empty=false` when partial content was streamed; doesn't fire on `stop`
    - request option logging — surfaces `max_tokens`, `temperature`, `tool_choice`, `chat_template_kwargs.enable_thinking`
    - publishes `llm.response` with `attempt=0` on normal stream, `attempt=1` on length-cap retry
    - compact `llm.request` / `llm.response` debug summaries without raw chunk logs
    - captures `reasoning_content` deltas in response summary
- Target seam: Adapter wire boundary (LLM provider — the largest provider adapter)
- Target scenario file: n/a
- Coverage targets (src lines this currently exercises): `src/chat/llm/providers/openaiChatCompletions.js`
- Replan notes: This is the canonical provider-adapter test — wire-format `toHaveBeenCalledWith`, mocked SDK. The size reflects the wire surface (streaming, tool-call accumulation, length-cap retry, debug logging) and earns its place. Some bus-event assertions (`request.message()` containing specific text, `llm.lengthCap` whole-object shape) are tuning surface — drop those during Phase 3 cleanup if the file goes back through review, but no rush.

### test/chat/conversation/conversationToolLoop.test.js

- Status: consolidate-into-scenario
- LOC: 581
- Behaviours pinned:
    - passes available tool schemas to the LLM (round 0)
    - invokes a requested tool, feeds result back, emits tool events, persists the full turn
    - passes the turn `toolContext` to the invoked tool
    - invokes every tool call in one response and feeds all results back together
    - structured error for unknown tool, propagating to the LLM round 1
    - tool failure gets `TOOL_FAILED` envelope; LLM still answers
    - empty post-tool reply logs `conversation.llmEmptyReply` with prior tool result summary
    - blocks identical tool call after prior failure (`TOOL_REPEAT_BLOCKED`); doesn't count short-circuit toward consecutive-failure cap
    - consecutive-failure bail with translatable notice + persisted assistant notice
    - INVALID_TOOL_ARGS bail with translatable notice + persisted assistant notice
    - tool round cap with translatable notice
    - runtime context retained across same-turn rounds (round 0, post-tool, empty-after-tool retry); not persisted to history
    - channel-emission collision safety: lookalike `{kind, targeting}` data treated as data; faked `streamType` strings treated as data
    - empty-after-tool retry: retries once with trailing system hint; doesn't retry twice; bus events for retry + still-empty outcomes; no retry on round 0; retry can re-call tools; tools available on retry whether prior round was success or failure; no hint injected when first post-tool reply had text
- Target seam: `conversation.sendUserMessage$` (this is the orchestrator-loop contract, exercised through one user message)
- Target scenario file: test/chat/scenarios/userTurns.test.js (happy tool-round path + multi-call + unknown-tool envelope + runtime-context retention across rounds + channel-emission collision); test/chat/scenarios/toolFailures.test.js (tool failure with `TOOL_FAILED`; `TOOL_REPEAT_BLOCKED`; consecutive-failure bail; `INVALID_TOOL_ARGS` bail; tool round cap; empty-after-tool retry path including the bus-event facets — strip those to the channel notice instead)
- Coverage targets (src lines this currently exercises): `src/chat/conversation/conversationLoop.js` (full file), `src/chat/conversation/conversationEvents.js` (bus event emit sites), `src/chat/toolCallGuard.js` (in-context), `src/chat/conversation/terminalNotices.js` (notice rendering)
- Replan notes: Largest brittle internals file. Breakdown:
    - `userTurns.test.js` absorbs: round-0 schema passing, single-call happy turn, multi-call happy turn, unknown-tool envelope, runtime-context-across-rounds, channel-emission collision safety. ~5 scenarios.
    - `toolFailures.test.js` absorbs: tool-failure envelope (with assistant still answers), TOOL_REPEAT_BLOCKED + doesn't-count-toward-cap, consecutive-failure bail with notice, INVALID_TOOL_ARGS bail, tool-round cap with notice, empty-after-tool retry happy path, empty-after-tool retry that gives up, retry can re-call tools, tools retained on retry. ~9 scenarios.
    - The `conversation.llmEmptyReply` / `llmEmptyRetry` bus-event assertions inside this file get **dropped** — pin user-observable instead (no second LLM call, notice on channel, history shape). The "logs empty post-tool LLM reply with tool result summary" facet is pure event-publisher coupling.

### test/chat/specialists/updateRecipeTool.test.js

- Status: consolidate-into-scenario
- LOC: 635
- Behaviours pinned:
    - directAnswer flag, schema (recipeId + instruction required), description steers off describe pre-inspection
    - construction-time validation: throws if `load_for_update` or `recipe_patch` missing from inner registry
    - preflights `recipe-metadata` GUI request before specialist run
    - passes recipeId + instruction in user message
    - offers `load_for_update` + `recipe_patch` only (no raw `recipe_load`, no `recipe_list`)
    - inner LLM can call `load_for_update` and `recipe_patch` through the inner registry
    - recipeId scope: `RECIPE_SCOPE_VIOLATION` for `recipe_patch` / `load_for_update` on a different recipeId
    - rejects raw `recipe_load` even if in inner registry (`TOOL_NOT_ALLOWED`); rejects other non-allowed tools (`TOOL_NOT_ALLOWED`)
    - outer envelope reflects whether patch applied: `{ok:true, answer}` on success; `{ok:false, UPDATE_FAILED, patchError, specialistAnswer}` on patch failure; `{ok:false, UPDATE_NOT_ATTEMPTED, specialistAnswer}` when specialist never patched
    - success when a later patch succeeds even if an earlier one failed
    - per-type system prompt assembly (MOSAIC edit guidance; no schema JSON; unspecced types fall back)
    - metadata-lookup failure short-circuits with failure envelope; no specialist invocation
    - regression: channel emission before metadata data doesn't trigger duplicate specialist runs
    - `update_recipe.outcome` bus event: `ok` / `UPDATE_NOT_ATTEMPTED` / `UPDATE_FAILED` / preflight-failure outcomes with appropriate `lastPatchErrorCode` / `answerChars`
- Target seam: Tool factory `invoke$`
- Target scenario file: test/chat/scenarios/recipeEdits.test.js (the bulk — directAnswer, schema, preflight, prompt assembly, scope violations, success/failure envelopes, retry within specialist budget, channel-emission regression); test/chat/scenarios/toolFailures.test.js for the construction-time validation throws (registry-precondition facet) and the metadata-failure short-circuit pattern (envelope shape)
- Coverage targets (src lines this currently exercises): `src/chat/specialists/recipeSpecialists.js` (updateRecipeTool half), `src/chat/specialists/runSpecialist.js`, `src/chat/specialists/specialistScope.js`, `src/chat/specialists/assembleSpecialistPrompt.js` (integration), `src/chat/specialists/specialistEvents.js` (update_recipe.outcome producer)
- Replan notes: Second-largest file. Breakdown:
    - `recipeEdits.test.js`: directAnswer + schema (1 scenario), description steer (1), preflight + user message routing (1), allowed-tool scoping (1), inner tool invocations through registry (1), recipeId scope violations (1 — combine both tools), TOOL_NOT_ALLOWED (1), outer envelope success/failure (3: succeeded, UPDATE_FAILED, UPDATE_NOT_ATTEMPTED), retry within specialist budget (1 — keep the "third attempt succeeds" case), prompt assembly per type (1 — MOSAIC; one negative for unspecced type), channel-emission regression (1). ~13 scenarios.
    - `toolFailures.test.js`: construction-time validation throws (1 — combine both missing-tool cases), metadata-failure short-circuit (1).
    - `update_recipe.outcome` bus event facets: keep one assertion in `recipeEdits.test.js` that the outcome event fires with the right `code` for the success path (consumer for `logListener` routing) and drop the rest. Or move to `logListener.test.js` if all consumers are routing.
    - The "DESIGN §3 prompt-byte budget" describe with a `console.log` and no assertion → drop or move to a manual smoke.

### test/chat/specialists/runSpecialist.test.js

- Status: delete
- LOC: 709
- Behaviours pinned:
    - direct text reply emits final answer; seeds inner LLM with `[system, user]` + allowed schemas
    - one tool round happy path; threads context through
    - cap behaviour: falls back to cap sentinel; caps inner loop; still executes the cap-round tool call; keeps partial text
    - stall recovery (empty inner response): retries once with transient user-role nudge; keeps scoped tools on recovery; recovery applies whether or not there was prior text or tool calls
    - probable additional cases in lines 200-709 covering: empty after tool round, channel emission passthrough, span events, etc.
- Target seam: This file tests `runSpecialist$` directly — i.e. a specialist internal collaborator. Per PRACTICES.md §"Stable seams", **`runSpecialist` is explicitly an internal, not a seam.** Behaviour is reachable from each specialist's tool-factory seam.
- Target scenario file: test/chat/scenarios/specialistConsultations.test.js (cap behaviour reached through `consult_map` — pin the user-observable outcome: "specialist returns an answer even when the inner LLM never stops asking for tools"); test/chat/scenarios/recipeEdits.test.js (stall recovery reached through `update_recipe` — pin "specialist recovers from empty inner response and produces an answer")
- Coverage targets (src lines this currently exercises): `src/chat/specialists/runSpecialist.js` (full inner-loop runtime including cap + stall recovery + scope enforcement + bus events)
- Replan notes: Largest brittle internals file. Read 200/709 lines; the rest is more stall-recovery / cap / event-publisher coverage. The user-observable consequences:
    - "specialist always returns an answer, even past round cap" → 1 scenario per consuming specialist
    - "stall recovery means the orchestrator gets a non-empty answer on the empty-inner path" → 1 scenario per consuming specialist
    - tool-scope enforcement (RECIPE_SCOPE_VIOLATION, TOOL_NOT_ALLOWED) → already covered in `recipeSpecialists.test.js` / `updateRecipeTool.test.js` / `specialistConsultationTools.test.js`
    - context threading → indirectly covered every time a specialist calls a tool
    - bus events (`specialist.request` / `specialist.response` / cap / stall events) → drop
  Don't write `runSpecialist.test.js`-shaped tests for this; expose the behaviour via the existing tool-factory seam tests.

## Appendix A — Test helpers / harnesses

### test/chat/builders.js
- Status: delete-when-last-consumer-migrates
- Last consumers (importers): `test/chat/conversation/conversation.queue.test.js`, `test/chat/conversation/conversation.test.js`, `test/chat/conversation/conversationEvents.test.js`, `test/chat/conversation/conversationListDrift.test.js`, `test/chat/conversation/conversationOrchestratorTools.test.js`, `test/chat/conversation/conversationSpecialists.test.js`, `test/chat/conversation/conversationToolLoop.test.js`, `test/chat/conversation/messageHandler.test.js`, `test/chat/conversation/titleGenerator.test.js`, `test/chat/conversation/titleGenerator.fallback.test.js`, `test/chat/conversation/userChatAbort.test.js`, `test/chat/conversation/userChatContext.test.js`, `test/chat/conversation/userChatLifecycle.test.js`, `test/chat/conversation/userChatMessages.test.js`, `test/chat/conversation/userChatTurnQueue.test.js`, `test/chat/diagnostics.test.js` (no, this one uses createDiagnostics directly — not a consumer), `test/chat/emitOnEnd.test.js` (no), `test/chat/orchestratorToolRegistry.test.js`, `test/chat/specialists/recipeSpecialists.test.js`, `test/chat/specialists/runSpecialist.test.js`, `test/chat/specialists/specialistConsultationTools.test.js`, `test/chat/specialists/updateRecipeTool.test.js`, `test/chat/toolCallGuard.test.js` (no), `test/chat/tools/guiContextTool.test.js`, `test/chat/tools/loadForUpdateTool.test.js`, `test/chat/tools/mapTools.test.js`, `test/chat/tools/projectTools.test.js`, `test/chat/tools/recipeMetadata.test.js`, `test/chat/tools/recipePatchTool.test.js`, `test/chat/tools/recipeTools.test.js`, `test/chat/tools/registry.diagnostics.test.js`, `test/chat/tools/registry.test.js`
- Successor: `harness.js` for `aConversation`, `aFakeLlm`, `aFakeHistory`, `aFakeTools`, `aFakeBus`, `aFakeDiagnostics`, `aFakeGuiRequests`, `aControllableLlm`, `aFakeTitleGenerator`, `read`, `readError`, `run`. The `harness.js` already exposes the equivalents (`aConversationHarness`, `aToolFactoryHarness`, etc.); Phase 3 migrates importers as their consuming test files are rewritten into scenarios. Some `keep-as-is` adapter tests (`guiContextTool`, `mapTools`, `projectTools`, `recipeTools`, `recipeMetadata`, `recipePatchTool`, `loadForUpdateTool`, `guiRequests`) can keep importing the bare `read` / `aFakeGuiRequests` helpers — split a small `test/chat/builders.js` -> `test/chat/adapterBuilders.js` if the `harness.js` builder API doesn't fit single-tool tests cleanly, or expose `aFakeGuiRequests` / `read` from `harness.js`.

### test/chat/conversation/userChatHarness.js
- Status: delete-when-last-consumer-migrates
- Last consumers: `test/chat/conversation/userChatAbort.test.js`, `test/chat/conversation/userChatContext.test.js`, `test/chat/conversation/userChatLifecycle.test.js`, `test/chat/conversation/userChatMessages.test.js`, `test/chat/conversation/userChatTurnQueue.test.js`
- Successor: `aUserChatHarness` in `harness.js`

### test/chat/conversation/wsHandlerHarness.js
- Status: delete-when-last-consumer-migrates
- Last consumers: `test/chat/conversation/wsHandler.commands.test.js`, `test/chat/conversation/wsHandler.context.test.js`, `test/chat/conversation/wsHandler.errors.test.js`, `test/chat/conversation/wsHandler.guiBridge.test.js`, `test/chat/conversation/wsHandler.logging.test.js`
- Successor: A new `wsHandler` builder (not in current `harness.js`) — Phase 3 extracts it from `wsHandlerHarness.js` and adds it to `harness.js` when `wsProtocol.test.js` is built. Until then, `wsHandlerHarness.js` is the scaffolding the wsProtocol scenario will consume; once it migrates, retire.

### test/chat/conversation/titleGeneratorHarness.js
- Status: delete-when-last-consumer-migrates
- Last consumers: `test/chat/conversation/titleGenerator.test.js`, `test/chat/conversation/titleGenerator.fallback.test.js`
- Successor: For `titleGenerator.test.js` consolidation into `multiTurnConversation.test.js`, the `aUserChatHarness` covers title-gen timing (it injects a silent title generator by default, so a Phase 3 knob `titleGenerator` would let the real generator + real LLM exercise it from the userChat seam). For `titleGenerator.fallback.test.js` relocation to `fallbackTitle.test.js` (pure algorithm), no harness is needed. Retire the file once both move.

### test/chat/conversation/inMemoryHistory.js
- Status: delete-when-last-consumer-migrates (already a thin re-export per progress.md Phase 1)
- Last consumers: any test importing `./inMemoryHistory` — re-grep at migration time
- Successor: `createInMemoryHistory` in `harness.js`

### test/chat/conversation/inMemoryConversationsStore.js
- Status: delete-when-last-consumer-migrates
- Last consumers: `test/chat/conversation/titleGenerator.fallback.test.js`, `test/chat/conversation/wsHandlerHarness.js` (transitive)
- Successor: `createInMemoryConversationsStore` in `harness.js`. Per progress.md Phase 1 nit, this is duplicated; Phase 3 collapses to the harness copy.

### test/chat/conversation/fakeRedis.js
- Status: keep
- Last consumers: `test/chat/conversation/redisHistory.test.js`, `test/chat/conversation/redisConversationsStore.test.js`
- Successor: n/a — `fakeRedis` is the Redis adapter-test double; it lives alongside its two adapter tests, which themselves stay `keep-as-is`. Genuinely orthogonal to `harness.js`.

### test/chat/llm/providerConformance.js
- Status: keep
- Last consumers: `test/chat/llm/providers/openaiChatCompletions.test.js`, `test/chat/llm/providers/lmStudioNativeChat.test.js`
- Successor: n/a — provider-conformance fixtures (`toolSchemas`, `conversationWithToolRoundTrip`) live with the provider adapter tests, which stay `keep-as-is`.

### test/chat/harness.js
- Status: keep (the new consolidated builder)
- Last consumers: `test/chat/harness.test.js` (Phase 1 scaffolding); Phase 3 scenarios.
- Successor: n/a

## Appendix B — Scenario file consumption plan

### test/chat/scenarios/userTurns.test.js
- Source entries consolidated:
    - `test/chat/conversation/conversation.test.js` (most of the file: happy turn, streaming, multi-turn history, initial messages, runtime context routing — drop trace-spans facet)
    - `test/chat/conversation/conversationListDrift.test.js` (collapse to one narrow assertion: second-turn LLM call sees only prior user/assistant — no tool noise)
    - `test/chat/conversation/conversationOrchestratorTools.test.js` (the `get_gui_context` flow only — the describe_recipe row moves to `recipeEdits.test.js`)
    - `test/chat/conversation/messageHandler.test.js` (turn-boundary notifications, event routing portions)
    - `test/chat/conversation/userChatContext.test.js` (the tool-context propagation + tool-start/tool-end broadcast facets)
    - `test/chat/conversation/conversationToolLoop.test.js` (round-0 schema, single-call happy turn, multi-call happy turn, unknown-tool envelope, runtime-context-across-rounds, channel-emission collision safety, no-orchestrator-restate for non-directAnswer tools)
    - `test/chat/conversation/conversationSpecialists.test.js` (the negative "no `directAnswer` → orchestrator restates" facet)
    - `test/chat/conversation/conversation.queue.test.js` (persisted-on-abort facet only)
- Behaviours pinned (union):
    - one user message → channel emits assistant text deltas + complete
    - assistant message persists; user message persists
    - second turn sees completed prior turn (no projection drift)
    - runtime turn context attaches per-turn and is not persisted
    - initial messages are LLM-visible but not persisted
    - tool round: LLM tool call → registry invoked → result fed back → assistant answer streams; tool-start/tool-end on the channel
    - multi-call in one round; all results fed back together
    - unknown tool surfaces `UNKNOWN_TOOL` envelope
    - non-`directAnswer` tools always get a restate round
    - runtime context retained across post-tool and empty-after-tool retry rounds
    - tool result `{kind, targeting}` lookalikes treated as data not channel emissions
    - user message remains in history when the turn is aborted
- Builders used: `aConversationHarness` (primary) — for cases where the seam is `conversation.sendUserMessage$` and the channel/history side-effects suffice. The tool-context propagation + tool-start/end broadcast facets need `aUserChatHarness` because the channel events surface there.
- Approximate expected size: ≤ 250 LOC

### test/chat/scenarios/multiTurnConversation.test.js
- Source entries consolidated:
    - `test/chat/conversation/userChatAbort.test.js`
    - `test/chat/conversation/userChatTurnQueue.test.js`
    - `test/chat/conversation/userChatMessages.test.js`
    - `test/chat/conversation/conversation.queue.test.js` (queue + abort facets — the persisted-on-abort facet moved to `userTurns.test.js`)
    - `test/chat/conversation/userChatContext.test.js` (the cross-subscription context routing + clear-context behaviour)
    - `test/chat/conversation/titleGenerator.test.js` (title-gen timing surfaced at userChat — fire-and-forget; persists title; emits `conversation-updated`)
- Behaviours pinned (union):
    - turns serialize for one conversation; second turn LLM call sees completed first-turn history
    - different conversations run independently
    - abort completes channel and drops later LLM events for an in-flight stream
    - abort with no in-flight stream is a no-op
    - abort cancels running turn only; queued turns proceed
    - first turn locks conversation, broadcasts user message, streams reply, completes
    - title generation runs only for known-conversation turns; does not block the next turn
    - title generated + persisted + `conversation-updated` event after first turn
    - cross-subscription GUI context routing: only the sending subscription's context attaches to the LLM turn
    - clear-context drops the cached context
- Builders used: `aUserChatHarness`
- Approximate expected size: ≤ 220 LOC

### test/chat/scenarios/recipeEdits.test.js
- Source entries consolidated:
    - `test/chat/specialists/updateRecipeTool.test.js` (bulk — directAnswer flag, schema, preflight, prompt assembly, scope violations, allowed-tool scoping, outer envelope success/failure, retry-within-budget, channel-emission regression, one update_recipe.outcome happy-path assertion)
    - `test/chat/specialists/recipeSpecialists.test.js` (describeRecipeTool — directAnswer flag, schema, prompt assembly, scope violations, fresh-session semantics, metadata-lookup failure short-circuit, no-preflight-recipe_load)
    - `test/chat/conversation/conversationOrchestratorTools.test.js` (the `describe_recipe` `directAnswer` integration row reached through `aConversationHarness`)
    - `test/chat/conversation/conversationSpecialists.test.js` (the `update_recipe` + `describe_recipe` `directAnswer` streaming rows)
    - `test/chat/specialists/runSpecialist.test.js` (the stall-recovery facet observed through `update_recipe` — "specialist recovers from empty inner response and produces an answer")
- Behaviours pinned (union):
    - `describe_recipe` flow: directAnswer streams specialist prose verbatim; specialist receives recipeId + question; specialist sees recipe specialist prompt + recipe_load schema only; refuses cross-recipeId loads and non-allowed tools; metadata-lookup failure short-circuits
    - `update_recipe` flow: directAnswer; construction-time precondition (load_for_update + recipe_patch required); preflight recipe-metadata; specialist sees recipeId + instruction; load_for_update + recipe_patch only; refuses cross-recipeId calls; refuses raw recipe_load
    - outer envelope reflects whether patch applied: `{ok:true, answer}` on success; `UPDATE_FAILED` carrying patch error; `UPDATE_NOT_ATTEMPTED` when never patched; later patch success overrides earlier patch failure
    - per-type prompt assembly: MOSAIC includes edit guidance; unspecced types fall back to base
    - stall recovery: empty inner response → specialist still returns an answer
    - regression: channel emission before metadata data doesn't trigger duplicate specialist runs
    - one `update_recipe.outcome` event fires with the right `code` for the success path (for `logListener` routing)
- Builders used: `aToolFactoryHarness` primarily (with `specialist: 'describe_recipe'` and a future `specialist: 'update_recipe'` knob — needs a `factory:` knob per Phase 1 nit). `aConversationHarness` for the directAnswer-through-orchestrator integration assertions.
- Approximate expected size: ≤ 300 LOC

### test/chat/scenarios/specialistConsultations.test.js
- Source entries consolidated:
    - `test/chat/specialists/specialistConsultationTools.test.js` (consult_map factory)
    - `test/chat/conversation/conversationSpecialists.test.js` (consult_map directAnswer streaming row)
    - `test/chat/specialists/runSpecialist.test.js` (the cap-behaviour facet observed through consult_map — "specialist always returns an answer even when inner LLM never stops asking for tools")
- Behaviours pinned (union):
    - `consult_map` factory: directAnswer; schema; construction-time precondition (allowed tools must be registered); seeds inner LLM with map specialist prompt + scoped schemas; refuses non-allowed tools (TOOL_NOT_ALLOWED)
    - inner LLM can call `map_area_list` / `layer_list` / `get_gui_context` through the inner registry
    - returns specialist answer as `{answer}`
    - through-orchestrator integration: `consult_map` streams specialist prose verbatim (directAnswer); the inner loop's scoped tools see the same context
    - cap behaviour: specialist always returns an answer (even when inner LLM never stops asking for tools)
- Builders used: `aToolFactoryHarness` (with `specialist: 'consult_map'`); `aConversationHarness` for the directAnswer-through-orchestrator integration
- Approximate expected size: ≤ 180 LOC

### test/chat/scenarios/conversationLifecycle.test.js
- Source entries consolidated:
    - `test/chat/conversation/userChatLifecycle.test.js`
- Behaviours pinned (union):
    - create-conversation pending state + claim
    - persistence only after first message
    - touch updatedAt on subsequent messages
    - list persisted conversations
    - select loads messages + status while streaming
    - rebuild persisted conversation before sending / loading
    - ignore unknown conversation ids for load / send / delete
    - delete one / delete all + no-notifications when delete-all empty
    - in-flight stream stopped on delete
- Builders used: `aUserChatHarness`
- Approximate expected size: ≤ 200 LOC

### test/chat/scenarios/toolFailures.test.js
- Source entries consolidated:
    - `test/chat/conversation/conversationToolLoop.test.js` (tool failure with TOOL_FAILED envelope + assistant still answers; TOOL_REPEAT_BLOCKED + doesn't count toward cap; consecutive-failure bail with notice; INVALID_TOOL_ARGS bail; tool-round cap; empty-after-tool retry path)
    - `test/chat/specialists/updateRecipeTool.test.js` (construction-time validation throws; metadata-failure short-circuit envelope pattern)
    - `test/chat/conversation/userChatContext.test.js` (tool-round-cap notice broadcast facet — pin the notice on the user's channel here)
- Behaviours pinned (union):
    - tool failure surfaces `{ok:false, TOOL_FAILED}` envelope to the LLM and `tool-end` on the channel; assistant still answers
    - identical tool call after prior failure is short-circuited with `TOOL_REPEAT_BLOCKED`; the short-circuit doesn't count toward the consecutive-failure cap
    - consecutive-failure bail emits a translatable channel notice and persists an assistant notice
    - repeated `INVALID_TOOL_ARGS` triggers the invalid-args bail with its own translatable notice
    - tool-round cap emits a translatable notice and persists the assistant notice
    - empty-after-tool retry: one retry with a trailing system hint; doesn't retry twice; can re-emit a tool call on the retry; tools available on retry
    - specialist construction-time precondition (`update_recipe` requires both load_for_update and recipe_patch) throws if either is missing
    - specialist preflight metadata-lookup failure short-circuits with the right error envelope (RECIPE_NOT_FOUND / TOOL_FAILED)
- Builders used: `aConversationHarness` (primary — exercises the orchestrator-loop guard + cap + retry); `aUserChatHarness` (for the channel-notice broadcast); `aToolFactoryHarness` (for the specialist preconditions)
- Approximate expected size: ≤ 220 LOC

### test/chat/scenarios/wsProtocol.test.js
- Source entries consolidated:
    - `test/chat/conversation/wsHandler.commands.test.js` (all wire-frame command routing)
    - `test/chat/conversation/wsHandler.context.test.js` (context + clear-context routing)
    - `test/chat/conversation/wsHandler.errors.test.js` (wsConnectionError / wsRouteError / workFailed)
    - `test/chat/conversation/wsHandler.guiBridge.test.js` (gui-response routing; subscriptionDown cancels)
- Behaviours pinned (union):
    - `subscriptionUp` pushes conversation list on connect
    - command commands → channel events with correct targeting (broadcast / broadcast-except / targeted)
    - `create-conversation` emits conversation-created (targeted) + conversation-claimed (broadcast-except)
    - `message` lock cycle: status (broadcast) + user-message (broadcast-except) + chat-response (broadcast)
    - `abort` → chat-response complete (broadcast)
    - `delete-conversation` / `delete-all-conversations` → conversation-deleted (broadcast)
    - `select-conversation` → conversation-loaded (targeted)
    - `list-conversations` → conversations (targeted)
    - drops messages before subscriptionUp / after subscriptionDown
    - recovers a missing subscription on reconnect when conversation persists
    - `subscriptionDown` cancels pending GUI requests without creating a subscription
    - `context` + `clear-context` route to userChat with subscription identity
    - `gui-response` routes to guiRequests.respond scoped by subscription
    - inbound errors publish `wsConnectionError` / `wsRouteError` / `workFailed`
- Builders used: A new `aWsHandlerHarness` (Phase 3 extracts it; today's `wsHandlerHarness.js` is its precursor). The harness's collectors should expose `arg$.next(...)` for inbound frames and `sent[]` / `published[]` for outbound frames and bus events, so test bodies stay frame-in/frame-out only.
- Approximate expected size: ≤ 250 LOC
