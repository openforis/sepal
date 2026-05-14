# Updated design proposal: orchestrated specialists + recipe patches

Successor to `DESIGN_chat_specialists.md`. This version incorporates the current
active AI rewrite state and the design decision that specialists do not call
other specialists in V1.

## 1. Core stance

The user talks to one user-facing orchestrator.

Specialists are tools behind that orchestrator. They can reason with a narrower
prompt and narrower tool surface, but they do not own the user conversation and
do not delegate to each other.

V1 rule:

```text
user -> orchestrator -> specialist/tool -> orchestrator -> user
```

Not:

```text
user -> orchestrator -> workflow specialist -> recipe specialist -> map specialist
```

The orchestrator owns:

- user intent and conversation history
- classification/routing
- missing-info questions
- conversational plan confirmation before non-trivial work
- ordering of multi-step work
- retries and final response
- tracing/cancellation caps across the whole turn

Tool implementations own GUI hard-confirmation boundaries. The LLM may decide
to call a destructive/high-impact tool, but it does not implement, phrase, or
bypass the confirmation dialog.

Specialists own bounded expertise:

- recipe specialists create/update one recipe type
- workflow specialist recommends a workflow plan
- map layout specialist plans/applies map layout and visualization changes
- browse/direct tools list/open/move/delete projects and recipes

## 2. Why specialists exist

The old tool surface put too much schema and operational guidance into every
turn. Recipe schemas, recipe rules, map tools, visualization tools, and workflow
examples compete with normal conversation context even when the user asks a
simple question.

Recipe-specific agents solve this by moving heavy knowledge behind one typed
tool call. The orchestrator sees compact dispatcher tools; a recipe specialist
sees only the schema/rules/guidance for one recipe type.

This should reduce:

- per-turn token cost
- tool-selection confusion
- irrelevant recipe-schema exposure
- whole-recipe model round trips

It also keeps mutation logic narrow: a recipe specialist can be judged against
one recipe schema and one set of validation rules.

## 3. Current implementation constraints

Active AI code is a rewrite, not a refactor of the archived orchestrator.

Current state:

- `modules/ai/src/app.js` still injects `noTools()`.
- `Conversation` has a tool-call loop placeholder, but the real LLM adapter does
  not yet send tool schemas or parse streamed tool calls.
- `wsHandler` logs `context` but does not store or use it.
- `gui-response` is not handled server-side.
- GUI already has partial support for `context`, `tool-start`, `tool-end`, and
  `gui-action` responses.
- Existing GUI chat actions can create, save, load, list, move, delete, open,
  close, map, and visualize, but they are not reachable from active AI tools.

Implication: Phase 0 must reintroduce the actual tool protocol, not just add
new specialist files.

## 4. Main actors

### Orchestrator

The normal chat model. It receives user messages and has a small, stable tool
surface.

Responsibilities:

- decide whether the request is conversational, direct-tool, recipe-specific,
  workflow-planning, map-layout, or browse/project work
- extract known arguments from conversation and current GUI context
- ask the user for missing required inputs
- call specialists/tools in sequence
- interpret specialist results
- ask for plan confirmation before non-trivial work
- summarize outcome to the user

The orchestrator should not carry all recipe schemas.

### Recipe specialist

One logical specialist per recipe type. It creates or updates recipes for that
type only.

Inputs:

- `type`
- `mode`: `create` or `update`
- `brief`
- optional `recipeId`
- optional workflow context from the orchestrator
- optional recent user/orchestrator context selected by the orchestrator

Knowledge:

- recipe description/use cases
- choose/dont-choose guidance
- defaults
- JSON Schema or LLM-compatible schema projection
- cross-field rule prose
- gotchas and cost notes

Allowed writes:

- recipe creation through a GUI-backed create action
- recipe updates through `recipe_patch`

The recipe specialist does not call workflow/map/browse specialists.

### Workflow specialist

Planner/advisor only. It maps user intent to a possible multi-recipe workflow.

It returns structured instructions to the orchestrator, not side effects.

Example result:

```json
{
  "status": "matched",
  "summary": "Forest change workflow using baseline mosaic, index change, and optional alerts.",
  "assumptions": [
    "User wants a map-ready workflow, not just an explanation."
  ],
  "missing": [
    "AOI",
    "baseline period",
    "monitoring period"
  ],
  "steps": [
    {
      "id": "baseline",
      "kind": "recipe.create",
      "recipeType": "MOSAIC",
      "purpose": "Create cloud-free optical baseline imagery.",
      "inputsNeeded": ["AOI", "baseline season", "sensor preference"],
      "outputRole": "baselineImage"
    },
    {
      "id": "change",
      "kind": "recipe.create",
      "recipeType": "INDEX_CHANGE",
      "purpose": "Compare vegetation index between baseline and monitoring imagery.",
      "dependsOn": ["baselineImage"],
      "inputsNeeded": ["monitoring season", "index"]
    }
  ]
}
```

The orchestrator then decides whether to ask the user for missing data, present
the plan, or call recipe specialists.

Workflow specialist inputs should include more than a bare `brief`; otherwise it
will ask avoidable "do you already have X?" questions. Pass:

- user brief
- compact current GUI context
- selected project and open recipe summaries
- compact recipe inventory when relevant
- workflow capability summaries and examples

### Map bounds tools

V1 should keep most map bounds work deterministic, not specialist-driven.

Direct tools:

- get current map view
- set camera
- fit bounds
- geocode place and fit bounds
- pan/zoom
- set sync

These tools are small, deterministic, and do not need a separate LLM loop.

### Map layout/visualization specialist

This may be a real specialist because it can require judgment:

- choose layout for comparison
- place recipes/assets into areas
- pick visualization mode and bands
- handle source registration
- explain tradeoffs when changing layout drops visible tiles

It should use scoped map/visualization tools, not arbitrary Redux access.

### Browse/project tools

Prefer direct deterministic tools for V1:

- list recipes/projects
- open/close recipe
- select project
- move recipes
- delete recipes/projects, with hard confirmation enforced inside the tool
  implementation

A browse specialist can be added later if intent disambiguation becomes hard,
but CRUD/listing is not where the first specialist complexity should land.

## 5. Dispatcher tool surface

Target orchestrator tools:

```text
get_context()
recipe_load({recipeId, path?})
call_recipe_specialist({type, mode, brief, recipeId?, workflowContext?})
call_workflow_specialist({brief, context?, recipeSummaries?})
call_map_layout_specialist({brief})
map_get_view()
map_set_camera(...)
map_fit_bounds(...)
map_zoom_to_place(...)
recipe_list(...)
project_list(...)
recipe_open(...)
recipe_move(...)
recipe_delete(...)
resume_specialist({sessionId, additionalInfo})
```

This is intentionally mixed:

- specialist tools for high-context reasoning
- direct tools for low-context deterministic actions

Do not force every action through an agent. The point is context isolation, not
agent purity.

`recipe_patch` is intentionally not an always-visible orchestrator tool in V1.
It is a specialist-internal write tool used by recipe specialists after the
orchestrator has routed the request. Any hard confirmation required by the
write operation is enforced by the tool implementation and GUI bridge.

Budget: low double-digit dispatcher tools are acceptable if their schemas stay
small. Use both counts and bytes:

- target: <= 15 always-visible orchestrator tools
- target: <= 15 KB provider-formatted tool schema/description bytes
- direct tools must have narrow params and short descriptions
- any tool needing recipe-domain prose, large enums, or long examples belongs
  behind a specialist

Measure the actual provider-formatted byte size in Phase 0. If the surface
drifts past the budget, collapse related direct tools behind a specialist or a
single dispatcher tool.

## 6. Specialist session protocol

Specialists run short hidden conversations with the orchestrator.

```text
call_<kind>_specialist(args) -> {sessionId?, result}
resume_specialist({sessionId, additionalInfo}) -> {result}

result:
  {status: "done", summary, sideEffects?, invalidated?}
  {status: "need_info", missing, questions?}
  {status: "failed", reason}
```

V1 session policy:

- Create a session only when a specialist returns `need_info`.
- Keep the session only until resume, timeout, or cancellation.
- Drop the session on `done` or `failed`.
- Store sessions in memory only.
- Use clock-driven TTL.

Do not keep successful specialist history around by default. It is likely to be
stale after recipe edits and can make later routing harder to reason about.

If follow-up reuse becomes important, add explicit `continueSpecialistSession`
behavior later instead of making hidden persistence the default.

This does not give up prompt-prefix caching. A specialist's static system prompt
and tool schemas can still hit provider prompt caches across invocations within
the cache TTL. What V1 gives up is reuse of the specialist's own hidden message
history after `done` or `failed`.

## 7. Cache strategy

Static prefixes matter independently from in-process session lifetime.

Dispatcher:

- system prompt is identical bytes across users/conversations/turns
- dispatcher tool schemas are compact and static
- username/current GUI context/recipe inventory are injected outside the static
  prompt, either through `get_context()` or a small per-turn context block

Specialists:

- each specialist has a static per-kind/per-type prompt
- each specialist has a small stable tool subset
- recipe specialists carry only one recipe type's schema/rules/guidance

In-process specialist sessions buy hidden message-history reuse only while the
session is alive. Provider prefix caches, where available, work across fresh
specialist invocations because the static prompt and tools remain byte-identical.

Cache support is provider-specific. Anthropic exposes cache behavior directly;
the active adapter is OpenAI-compatible. Treat cache-hit metrics as an
optimization and rollout signal, not as a correctness dependency.

## 8. Observability and inspection

The event bus is the cross-cutting observability backbone. Main orchestration,
tool, specialist, GUI, and LLM code should emit structured events; logging,
usage accounting, tracing, metrics, and future inspection UIs should subscribe
to those events rather than adding accounting/logging logic into every hot path.

Events should separate cheap metadata from expensive payloads.

Convention:

```js
bus.publish({
  type: 'specialist.request',
  category: 'specialists.recipe',
  level: 'debug',
  summary: {
    specialistKind: 'recipe',
    recipeType: 'MOSAIC',
    mode: 'update',
    briefBytes,
    contextBytes,
    messageCount
  },
  message: () => `recipe.MOSAIC update briefBytes=${briefBytes} contextBytes=${contextBytes}`,
  payload: () => ({
    request,
    messages
  })
})
```

Rules:

- Cheap, safe metadata goes in eager fields such as `summary`, `conversationId`,
  `turnId`, `spanId`, `provider`, `model`, and `modelProfile`.
- Expensive rendered log text uses `message: () => string`.
- Full request/response bodies use `payload: () => object`.
- Subscribers must decide whether to evaluate `message` or `payload`.
- Full payload serialization belongs in log/inspection subscribers, not in the
  core event emission path.
- `trace` may include full user/project/recipe payloads and should be disabled
  in normal deployments.

Recommended levels:

- `info`: lifecycle summaries only, such as specialist kind, status, and
  duration.
- `debug`: safe summaries, byte counts, token counts, message counts, status,
  patch op counts, missing-info field names, and model profile.
- `trace`: full prompts, specialist request/response bodies, tool args/results,
  GUI request/response payloads, raw LLM chunks, and provider raw responses.

Boundary events to emit:

```text
orchestrator.request
orchestrator.response
specialist.request
specialist.response
tool.request
tool.response
gui.request
gui.response
llm.request
llm.response
llm.usage
```

Recipe specialist example:

- `specialist.request` at debug summarizes recipe type, mode, brief bytes,
  context bytes, selected recipe id, and message count.
- `specialist.request` payload at trace includes the orchestrator's summarized
  brief, workflow context, selected GUI context, and specialist messages.
- `specialist.response` at debug summarizes status, missing fields, patch op
  count, result bytes, duration, and usage summary.
- `specialist.response` payload at trace includes the full specialist response
  JSON.

Tool example:

```js
bus.publish({
  type: 'tool.response',
  category: 'tools.recipePatch',
  level: 'debug',
  summary: {
    tool: 'recipe_patch',
    status: 'ok',
    durationMs: 84,
    patchOps: 4,
    resultBytes: 1200
  },
  message: () => `tool recipe_patch ok duration=84ms patchOps=4 resultBytes=1200`,
  payload: () => result
})
```

This convention is also how usage accounting stays out of main logic. LLM
adapters emit low-level `llm.usage` events. Specialist/tool/orchestrator runners
add enough attribution metadata (`turnId`, `spanId`, role, specialist kind,
recipe type, model profile) for a separate usage-accounting subscriber to roll
up costs and context size.

## 9. Model profiles and usage accounting

Specialists must not be hard-wired to the same model as the orchestrator.
Different jobs have different latency, context, reasoning, tool-use, privacy,
and cost requirements. A recipe specialist that needs a large schema context may
use a different provider/model than the orchestrator; a title generator or
classification helper may use a cheaper or local model.

V1 should route every LLM call through a resolved `modelProfile`.

Example profile:

```json
{
  "id": "recipe.mosaic.default",
  "provider": "lmstudio",
  "adapter": "openai-chat-completions",
  "model": "qwen/qwen3.5-9b",
  "capabilities": ["tool_calls", "json_schema"],
  "options": {
    "temperature": 0,
    "maxTokens": 4096,
    "disableReasoning": false
  },
  "fallbacks": [
    "recipe.generic.local",
    "recipe.generic.remote"
  ]
}
```

Profiles describe concrete runtime choices. Specialist policy describes when a
specialist is allowed to use them.

Example specialist model policy:

```json
{
  "specialistId": "recipe.MOSAIC",
  "defaultProfile": "deep",
  "allowedProfiles": ["medium", "deep"],
  "operationProfiles": {
    "create_from_brief": "deep",
    "update_existing_patch": "medium",
    "explain_validation_error": "fast"
  },
  "requiredCapabilities": ["tool_calls", "json_schema"],
  "fallbackProfiles": ["recipe.generic.remote"]
}
```

Profile resolution is runtime policy, not prompt policy:

- The LLM should not freely choose providers or model IDs.
- Each specialist declares its default profile, allowed profiles,
  per-operation overrides, required capabilities, and fallbacks.
- Config can override specialist policy globally, per environment, per
  specialist kind, per recipe type, and per operation, but runtime requirements
  are hard filters.
- The orchestrator may pass intent hints such as `interactive`, `cheap`,
  `careful`, `high_risk`, `small_patch`, or `large_context`, but it should not
  choose a concrete provider/model/profile for a specialist.
- The runtime resolver combines orchestrator hints, specialist policy, provider
  capabilities, environment config, and fallbacks. Specialist policy wins over
  orchestrator preference when they conflict.
- Fallback profile selection belongs in runtime code and must be logged.
- Every invocation records the resolved `provider`, `model`, `modelProfile`,
  role, specialist kind, and recipe type where relevant.
- Direct deterministic tools, such as most map-bounds operations, bypass LLM
  profile resolution entirely.

Expected defaults:

- orchestrator: balanced interactive profile
- workflow specialist: deep profile by default
- recipe specialist: per recipe type and operation; MOSAIC-like creation may be
  deep, while small existing-recipe patches may be medium
- map layout/visualization specialist: medium profile by default
- map bounds tools: direct tools, no LLM
- palette helper: fast profile or deterministic helper when possible

Suggested role keys:

```text
orchestrator
titleGenerator
workflowSpecialist
mapLayoutSpecialist
recipeSpecialist.<TYPE>
```

## 10. Provider-neutral LLM/tool contract

Conversation and specialist code should use provider-neutral chat semantics.
Provider adapters own wire-format conversion.

Internal message shapes:

```js
{role: 'system', content}
{role: 'user', content}
{role: 'assistant', content, toolCalls}
{role: 'tool', toolResults}
```

Internal tool call shape:

```js
{
  id: 'call-1',
  name: 'recipe_list',
  input: {}
}
```

Internal tool result shape:

```js
{
  toolCallId: 'call-1',
  toolName: 'recipe_list',
  result: {
    ok: true,
    data: {}
  }
}
```

Structured errors use the same envelope:

```js
{
  ok: false,
  error: {
    code: 'TOOL_FAILED',
    message: '...'
  }
}
```

Adapter responsibilities:

- Convert internal tool schemas to provider request format.
- Convert internal messages to provider message/content-block format.
- Convert provider streamed deltas into internal `{textDelta}` and `{toolCall}`
  events.
- Convert provider usage/cache metadata into normalized `llm.usage` events.
- Keep provider-specific fields out of `Conversation` and specialist tests.

Provider mapping examples:

- OpenAI chat completions: `tools: [{type: 'function', function: ...}]`,
  assistant `tool_calls`, one `role: 'tool'` message per tool result.
- Anthropic/Claude messages: `tools: [...]`, assistant `tool_use` content
  blocks, user `tool_result` content blocks.
- OpenAI-compatible local servers: use the OpenAI adapter when they support the
  same tool-call contract.
- LM Studio native no-reasoning path: title-generation only in V1; no tools.

The OpenAI adapter may expand one internal `{role: 'tool', toolResults: [...]}`
message into multiple provider messages. This is expected. The internal domain
shape is not required to be a one-to-one provider message shape.

Add a reusable provider conformance fixture for tool turns in Phase 0. The first
consumer is `openai.test.js`; a future `claude.test.js` should reuse the same
internal fixture and assert Anthropic-specific formatting/parsing. This prevents
OpenAI message shape from leaking into domain behavior.

Specialist runtime resolves a model profile; the LLM client factory chooses the
adapter from that profile. Specialists should express requirements as
capabilities such as `tool_calls`, `json_schema`, `large_context`, or
`prompt_cache`, not as provider/model IDs.

## 11. Usage accounting

Every LLM adapter should emit normalized usage data when the provider supplies
it, and approximate what it can when the provider does not.

Per-call usage event shape:

```json
{
  "type": "llm.usage",
  "turnId": "turn-1",
  "conversationId": "conv-1",
  "spanId": "span-1",
  "role": "recipeSpecialist",
  "specialistKind": "recipe",
  "recipeType": "MOSAIC",
  "provider": "lmstudio",
  "model": "qwen/qwen3.5-9b",
  "modelProfile": "recipe.mosaic.default",
  "contextWindowTokens": 131072,
  "inputTokens": 2100,
  "outputTokens": 420,
  "reasoningTokens": 0,
  "cachedInputTokens": 1500,
  "cacheWriteTokens": 600,
  "inputBytes": 18000,
  "outputBytes": 2200,
  "toolSchemaBytes": 9500,
  "durationMs": 1800
}
```

Field notes:

- `inputTokens` and `outputTokens` are tracked separately.
- `reasoningTokens` are separate from visible output where the provider reports
  them.
- `cachedInputTokens` and `cacheWriteTokens` are provider-specific; leave them
  absent when unavailable.
- `contextWindowTokens` is the effective model context size, not the current
  prompt size.
- `inputBytes`, `outputBytes`, and `toolSchemaBytes` are useful fallbacks when a
  local/OpenAI-compatible server does not report token usage.
- Usage logging should include both successful and failed calls when request
  size is known.

Aggregation requirements:

- per LLM call
- per specialist invocation
- per user turn, including orchestrator plus all specialists/tools
- per conversation
- by orchestrator vs specialist role
- by specialist kind and recipe type
- by provider, model, and model profile
- by cache behavior where available
- time-window totals for operations/cost tuning

Usage accounting is not just billing telemetry. It is the main way to validate
the specialist design:

- Did moving recipe schema behind a specialist reduce orchestrator input tokens?
- Did specialist invocations add more overhead than they saved?
- Which recipe types are too expensive for their observed value?
- Are prompt cache hits actually happening for static specialist prefixes?
- Are retry/failure loops inflating cost?

Rollout dashboards can come later. V1 only needs durable structured events or
logs that can be aggregated.

`llm.usage` is emitted on the event bus. A dedicated usage-accounting subscriber
correlates usage by `turnId`/`spanId` and builds per-turn, per-specialist, and
per-conversation aggregates. The orchestrator and specialists should pass
`usageContext` into LLM calls, but they should not manually count or aggregate
tokens.

## 12. Recipe patch model

Recipe updates should use JSON Patch rather than full-model replacement for
incremental changes.

Contract:

- operations: `add`, `remove`, `replace`, `move`, `copy`, and optional `test`
- atomic apply: all operations apply or none do
- validate post-apply using schema plus cross-field rules
- persist through GUI as the source of truth
- return concise summary and invalidated paths

V1 optimistic concurrency token: `baseModelHash`.

`recipe_load` returns the current `modelHash`, read from
`getHash(recipe.model)` in the GUI. If a loaded model has no hash, the load path
must stamp one before returning it. This is a volatile GUI-side revision token,
not a durable content hash; it protects against concurrent edits to the loaded
model. `recipe_patch` requires:

```json
{
  "recipeId": "r1",
  "baseModelHash": "hash-from-recipe-load",
  "operations": []
}
```

Before persistence, the GUI write path compares `baseModelHash` with the current
`getHash(recipe.model)`. Mismatch returns a structured stale-write error; the
orchestrator or specialist must reload and retry from the new model. This is
required because index-addressed JSON Patch is unsafe when the user edits the
same recipe while the LLM is thinking.

`test` operations are still useful for semantic assertions ("this field still
has value X"), but they are not the primary concurrency mechanism.

SEPAL recipe API notes for tool implementations:

- Do not use direct DB access; recipe persistence goes through existing SEPAL
  APIs or GUI actions.
- The server-side recipe save API stores a gzip-compressed UTF-8 JSON contents
  envelope, not just the recipe model.
- The contents envelope includes recipe identity/type/project plus `model`,
  UI state, and map-layer state. AI-facing `recipe_load` should expose a
  projected model view, not the full browser/UI envelope by default.
- Recipe list endpoints return metadata only, not full contents.
- Delete has both single-recipe and bulk endpoints; destructive tools must
  enforce GUI hard confirmation before calling either path.
- In V1 the GUI remains persistence authority, so the AI-side tool contract
  should avoid duplicating gzip/envelope details unless a later server-side
  persistence path is deliberately introduced.

Projected paths:

- `recipe_load` may omit heavy fields with markers such as
  `{ "_omitted": 5234, "_kind": "referencePoints" }`.
- The LLM may replace a whole omitted region.
- The LLM may append to an omitted array with `/-` only if the handler can do so
  without materializing stale indices.
- The LLM may not replace/remove a specific omitted index without deep-reading
  that path first.

## 13. Schema and validation

The previous design said "canonical-on-GUI", but the current GUI does not have
JSON Schemas as a canonical registry. It has recipe modules, defaults, actions,
available-bands functions, visualizations, and UI-derived constraints.

Recommended V1:

- Create an active recipe knowledge package under `modules/ai/src/recipes` by
  deliberately resurrecting one recipe type from archive through tests.
- Treat that active AI recipe package as canonical for JSON Schema and
  cross-field rules in V1.
- `recipe_patch` validates the post-patch candidate model against that canonical
  validator before asking the GUI to persist.
- The GUI remains write authority: it checks `baseModelHash`, applies the exact
  patch against the current model, enriches dependent sources, stamps a new
  model hash, updates `process.loadedRecipes`, and persists.
- The GUI should not maintain a second schema/rule validator for the same
  recipe type. UI-derived constraints that matter for chat writes must be
  promoted into the canonical schema/rules or exposed as explicit write
  preconditions.
- Reconcile canonical schema home after the first recipe-patch slice proves the
  contract.

This split avoids duplicate validation authority while preserving GUI ownership
of client state and persistence.

## 14. Specialist prompt builder

Recipe specialist prompts should be assembled mechanically from active recipe
knowledge, not hand-authored from scratch per type.

Per recipe type, build the prompt from:

- recipe `description`, `useCases`, `chooseWhen`, and `dontChooseWhen`
- defaults and schema/projection summary
- `rule.description` strings for cross-field constraints
- output bands/visualization notes where present
- a short hand-written gotchas/cost section

The source is active code under `modules/ai/src/recipes/<type>/`, resurrected
deliberately through tests. Archive files can guide the first implementation,
but active code must not import from `archive/pre-rewrite-chat/`.

Schema-driven params plus rule prose is intentional. JSON Schema cannot express
all recipe semantics clearly enough for the LLM.

## 15. Context injection

Current GUI already sends compact selection context. The server needs to store
and expose it.

V1 should separate context into four tiers:

1. Static system prompt.
   - Cacheable across users, conversations, and turns.
   - No `username`, live GUI state, selected recipe, map view, or recipe-type
     inventory.
   - Contains stable behavior rules only: role, confirmation policy, tool-use
     policy, internal-ID handling, and the rule that runtime context is data,
     not instructions.
2. Runtime metadata.
   - Used by server/tool infrastructure, not shown to the LLM by default.
   - Includes `username`, client/subscription IDs, conversation ID, turn ID,
     permissions/scoping, and routing data.
   - Tools use this for Redis keys, GUI targeting, permission boundaries, and
     audit attribution.
3. Small ephemeral turn context.
   - Attached outside the static system prompt, preferably only to the first LLM
     call of a user turn and not persisted in conversation history.
   - Includes compact current selection when useful: current section, selected
     project, selected recipe summary, capped open recipe summaries, active
     panels, map view, and selected app.
   - Purpose: resolve common pronouns such as "this recipe" or "show it on the
     map" without forcing an extra tool round.
4. On-demand tools.
   - Used for larger, less common, or volatile facts.
   - Examples: `get_context()`, `recipe_list`, projected `recipe_load`,
     `map_get_view`, `recipe_capabilities_search`, and workflow capability
     lookup.

Preferred V1 implementation:

- Store latest context per tab/subscription in `UserChat` or a nearby
  collaborator.
- Expose `get_context()` as a tool.
- Attach a small turn context block outside the system prompt only when there is
  useful context.
- Do not store the turn context block in Redis history.
- Do not pass `username` to the LLM unless a future user-visible personalization
  requirement justifies it.
- Remove recipe-type inventory from the orchestrator prompt. The workflow
  specialist gets richer workflow/recipe capability summaries; recipe
  specialists get exactly one recipe type's schema/rules. The orchestrator can
  route obvious requests through compact tool descriptions and use
  `recipe_capabilities_search({brief})` for ambiguous cases.

Reasoning:

- The orchestrator often needs selected recipe/project to resolve "this".
- A tool avoids injecting stale GUI state into every historical message.
- A small per-turn block helps cheap pronoun resolution without forcing a tool
  round on every request.
- Keeping user identity and GUI state out of the static system prompt preserves
  prompt-prefix cacheability and avoids cross-user prompt fragmentation.
- Username is usually infrastructure data, not reasoning context. Giving it to
  the model by default adds privacy exposure and tokens with little benefit.

The system prompt should be static. Delete `{{username}}`,
`{{currentContext}}`, and `{{recipeTypes}}` placeholders from runtime prompt
content now. Until Phase 1 context injection lands, runtime prompt text should
say that no live GUI context is available rather than shipping literal template
placeholders.

## 16. GUI request/response and confirmations

Server-side tools need a request/response bridge to GUI actions:

```text
AI -> GUI: {type: "gui-action", requestId, action, params}
GUI -> AI: {type: "gui-response", requestId, success, data?, error?}
```

The GUI already sends `gui-response`; the active AI server needs to handle it.

Gateway/session routing notes:

- Inbound websocket messages include authenticated `username`, `clientId`, and
  `subscriptionId`; user-visible chat context is tab-local, so ephemeral GUI
  context is keyed by `clientId:subscriptionId`, not by conversation.
- `subscriptionDown` is the primary cleanup signal for tab-scoped state.
  `clientDown`, if reintroduced, should only be a safety-net cleanup for missed
  subscriptions.
- Outbound GUI requests must target the relevant subscription when the result
  depends on the sending tab's state.

Request lifecycle:

- AI side generates `requestId` and stores a pending request with timeout.
- AI sends targeted `{type: "gui-action", requestId, action, params}`.
- GUI handler runs and responds with matching `{type: "gui-response",
  requestId, success, data?, error?}`.
- Success resolves the pending request; `success: false`, timeout, websocket
  disconnect, or turn cancellation rejects it with a structured tool error.
- Cancellation unsubscribes the pending request and ignores late responses.

`tool-start`/`tool-end` wrap the logical tool invocation. A tool may make zero,
one, or multiple GUI requests internally.

Hard confirmations are part of tool execution, not orchestrator reasoning.
The tool implementation declares when confirmation is required, sends the GUI
confirmation request, waits for the GUI response, and aborts the operation if
the user declines or the request times out. The LLM never writes the
confirmation copy, never sees the confirmation as an instruction, and cannot
bypass it with phrasing.

Initial hard-confirmation set:

- delete recipe
- delete project
- move recipes to another project when target differs from selected project
- layout changes that remove/drop visible map areas
- project switch that closes or hides open work

Chat plan confirmation still applies before non-trivial constructive work.
Data loss and shared-state mutations use GUI dialogs.

## 17. Tool-loop safety

Tool-loop safety is not a single later phase. Blockers by milestone:

- Phase 0 blockers: max tool-call rounds, structured tool-error envelope,
  GUI-request timeout/cancellation, cancellation propagation through active
  tool work, boundary request/response events, and `tool.invoke` tracing.
- Before writable tools/specialists: repeated failure bail-out, validation-error
  retry limits, and no-repeat handling for identical failing tool calls.
- Before rollout/tuning: normalized token/cache usage logging where provider
  supports it, with byte/count fallbacks where it does not.
- Nice-to-have before specialists: stall handling for empty assistant responses.

The archived loop had several of these ideas. Reintroduce them by test, not by
copying archive code.

## 18. Phasing

### Phase 0: real tool transport

Goal: one trivial tool round trip works end to end.

Scope:

- Extend LLM port to accept tool schemas.
- Update OpenAI-compatible adapter to send tools and parse streamed tool calls,
  through the provider-neutral LLM/tool contract.
- Add tool registry/dispatcher in active code.
- Emit `tool-start` and `tool-end`.
- Reintroduce `gui-response` handling server-side.
- Add request timeout and cancellation behavior.
- Add max tool round cap.
- Add structured tool-error envelope.
- Add `tool.invoke` tracing.
- Add structured boundary events with lazy `message`/`payload`.
- Log provider-formatted tool schema byte size.
- Add model-profile resolution for orchestrator calls and specialist policy
  inputs.
- Emit basic `llm.usage` events with provider/model/profile and byte fallbacks.
- Add tests at `Conversation`, `UserChat`, `wsHandler`, and adapter boundaries.
- Add reusable provider conformance fixtures for internal tool-turn messages.

Acceptance:

- Fake LLM calls one fake tool.
- Tool result is fed back to LLM.
- OpenAI-specific tool formatting/parsing is covered in adapter tests, while
  `Conversation` tests assert only provider-neutral message/tool shapes.
- GUI request/response can complete a tool.
- Unknown or failing tool returns structured error to the LLM.
- Each LLM call logs its resolved provider/model/profile and whatever usage
  fields are available.
- Full request/response payloads are inspectable at trace without eager
  serialization in the main path.

### Phase 1: context and direct reads

Goal: orchestrator can resolve current GUI state and read recipes without full
tool bloat.

Scope:

- Static system prompt.
- Store latest GUI context.
- Add `get_context()`.
- Add `recipe_list`.
- Add projected `recipe_load({recipeId, path?})`.
- Add projection for heavy known fields in `CLASSIFICATION` first.

Acceptance:

- "this recipe" resolves through context.
- Loading a classification recipe with many reference points returns an omitted
  marker unless path-scoped.
- Runtime prompt contains no literal `{{...}}` template placeholders.

### Phase 2: recipe patch

Goal: incremental recipe updates without full-model round trip.

Scope:

- Add `baseModelHash` to `recipe_load` and require it in `recipe_patch`.
- Add JSON Patch apply path with GUI base-hash enforcement.
- Add canonical AI-side schema/rule validation path for one recipe type.
- Add `recipe_patch`.
- Keep full `recipe_save` only for full rewrite cases.

Acceptance:

- Single-field recipe update applies atomically.
- Invalid patch rolls back and returns path-specific error.
- Stale `baseModelHash` is rejected.

### Phase 3: one recipe specialist

Goal: prove agents-as-tools with one recipe type.

Scope:

- Add `call_recipe_specialist`.
- Add recipe-specialist model policy by recipe type and operation.
- Implement one recipe specialist.
- Recommended first type: `MOSAIC`, because it is common and domain-rich.
  This is representative rather than minimal; it trades fast shipping for a
  meaningful schema/rule acceptance gate.
- Specialist can create/update using create/patch tools only.
- Specialist returns `done`, `need_info`, or `failed`.
- Specialist sessions exist only for `need_info`.
- Usage events identify orchestrator vs recipe specialist and include
  `recipeType`.
- Specialist request/response events expose safe debug summaries and trace-only
  full payloads.

Decision gate:

- Can provider accept the chosen recipe schema/tool params?
- If not, build an LLM-compatible schema projection rather than weakening
  validation.
- If `MOSAIC` blocks progress for non-representative reasons, use a smaller
  fallback such as `MASKING` or `CCDC_SLICE` to prove the specialist loop first,
  then return to `MOSAIC`.

### Phase 4: workflow specialist

Goal: convert broad user goals into executable orchestrator plans.

Scope:

- Add workflow capability summaries.
- Add example workflows.
- Declare workflow-specialist model policy, with deep as the default unless
  environment config overrides it.
- Pass compact GUI context, selected project, open recipe summaries, and relevant
  recipe inventory.
- Return structured plan only.
- Orchestrator executes by calling recipe specialists/direct tools.

Acceptance:

- "I want to map deforestation alerts" returns a plan with missing inputs.
- After user supplies inputs and confirms, orchestrator calls recipe specialists
  in order.
- Workflow specialist never calls recipe specialists itself.

### Phase 5: map layout/visualization specialist

Goal: handle layout/source/visualization reasoning.

Scope:

- Keep map bounds as direct tools.
- Declare map-layout model policy, with medium as the default unless environment
  config overrides it.
- Specialist handles layout and visualization choices.
- Layout tools enforce GUI hard confirmation for destructive layout changes.

### Phase 6: roster expansion and tuning

Goal: expand recipe specialists and measure value.

Metrics:

- prompt tokens per user turn
- specialist tokens per invocation
- orchestrator tokens vs specialist tokens
- input tokens vs output tokens
- reasoning tokens where available
- cached input/write tokens where available
- context-window utilization
- usage by provider/model/model profile
- round-trip count
- tool failure rate
- `need_info` frequency
- patch payload size vs full save
- user-visible correction/retry rate

Stop expanding if Phase 2/3 gives enough value or if per-type authoring cost
exceeds observed benefit.

## 19. Decision gates

1. End of Phase 0: provider tool parsing and GUI request/response are stable,
   model-profile resolution works, usage events are emitted, boundary
   request/response inspection is available, and dispatcher tool schema bytes
   fit the budget. If not, shrink the direct surface before adding recipe work.
2. End of Phase 2: measure prompt tokens, cache behavior where available, patch
   payload size, and tool failure rate. If projection plus patches solve the
   user-visible cost/quality problem at current recipe count, defer Phase 3+.
3. Start of Phase 3: run schema-as-tool-param acceptance for the chosen recipe
   type. If provider rejects the schema, choose between schema projection and a
   smaller first specialist.
4. Mid roster expansion: if per-type gotchas authoring or schema projection cost
   dominates observed benefit, stop expansion and keep generic/direct fallback
   behavior for remaining types.

## 20. File layout target

```text
modules/ai/src/chat/
  system-prompt.md
  sendMessage/
    conversation.js
    modelProfiles.js
    usageAccounting.js
    eventInspection.js
    tools.js
    specialistModelPolicies.js
    recipePatch.js
    toolLoopSafety.js
    specialists/
      recipeSpecialist.js
      workflowSpecialist.js
      mapLayoutSpecialist.js
      specialistSessions.js
      promptBuilder.js
  io/
    openai.js
    wsHandler.js
    wsChannel.js

modules/ai/src/recipes/
  mosaic/
    index.js
    schema.json
    rules.js
    defaults.js

modules/gui/src/app/home/body/chat/
  chatPanel.jsx
  useConversation.js
  guiActionRegistry.js

modules/gui/src/app/home/body/process/chatActions/
  recipeActions.js
  mapActions.js
  visualizationActions.js
```

## 21. Open questions

- Where should canonical recipe schemas live after the first active recipe slice?
- Should `get_context()` be sufficient, or should every user turn also get a
  small context block?
- Which provider schemas are accepted unchanged, and which need an
  LLM-compatible projection?
- Which model profiles and specialist policies should be configurable globally,
  per environment, per specialist kind, per recipe type, and per operation?
- Which usage fields can each target provider report today, and which need byte
  or estimate fallbacks?
- Which event categories should map to log4js categories so trace inspection can
  be enabled for one boundary without turning on all AI trace logs?
- How long, if at all, should full trace payloads be retained outside normal
  logs?
- Should specialist text ever stream to the user, or should only orchestrator
  text be user-visible?
- How much recent conversation history should the orchestrator pass in a
  specialist brief?

## 22. Non-goals for V1

- Specialists calling other specialists.
- Persistent specialist sessions.
- Arbitrary Redux `get_state(slice)` access.
- Full MCP-over-WS protocol.
- Rewriting recipe schemas.
- Solving multi-AI-instance cross-tab sync.
- Replacing GUI as persistence authority.
- LLM-selected provider/model routing.
- Exact cross-provider cost accounting when providers do not expose equivalent
  usage/cache fields.
- Always-on full prompt/tool/recipe payload logging in normal deployments.

## 23. References

- `modules/ai/PRACTICES.md`: TDD, slices, ports/adapters, observables, event bus.
- `modules/ai/PUNCH_LIST.md`: deferred AI module cases.
- `modules/ai/archive/pre-rewrite-chat/src/recipes/`: archived recipe schemas,
  rules, defaults, and metadata for reference only.
- `modules/ai/archive/pre-rewrite-chat/src/mcp/tools/`: archived tool definitions
  for reference only.
- RFC 6901: JSON Pointer.
- RFC 6902: JSON Patch.
