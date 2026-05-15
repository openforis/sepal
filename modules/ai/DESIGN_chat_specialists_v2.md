# Updated design proposal: orchestrated specialists + recipe patches

Successor to `DESIGN_chat_specialists.md`. This version incorporates the current
active AI rewrite state, the design decision that specialists do not call other
specialists in V1, and the newer boundary that raw recipe JSON belongs only to
recipe specialists.

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

- recipe specialists describe/create/update one recipe type
- workflow specialist recommends a workflow plan
- map layout specialist plans/applies map layout and visualization changes
- browse/direct tools list/open/move/delete projects and recipe metadata

## 2. Why specialists exist

The old tool surface put too much schema and operational guidance into every
turn. Recipe schemas, recipe rules, map tools, visualization tools, and workflow
examples compete with normal conversation context even when the user asks a
simple question.

Recipe-specific agents solve this by moving heavy knowledge and raw recipe JSON
behind typed operation tools. The orchestrator sees compact dispatcher tools; a
recipe specialist sees only the schema/rules/guidance and recipe fragments for
one recipe type.

This should reduce:

- per-turn token cost
- tool-selection confusion
- irrelevant recipe-schema exposure
- raw recipe JSON exposure outside recipe specialists

It also keeps read/write logic narrow: a recipe specialist can be judged against
one recipe schema, one set of validation rules, and the patches it emits.

## 3. Current implementation constraints

Active AI code is a rewrite, not a refactor of the archived orchestrator.

Current state:

- Static prompt placeholders are removed. Compact GUI selection context is
  stored per tab/subscription and injected as ephemeral turn context on the first
  LLM call of a user turn.
- `Conversation` can pass tool schemas to the LLM, consume provider-normalized
  tool calls, invoke the tool registry, feed structured tool results back, cap
  tool rounds, and emit `tool-start`/`tool-end`.
- The OpenAI-compatible adapter sends tool schemas and parses streamed tool
  calls. The LM Studio native no-reasoning path is title-generation only in V1
  and does not support tools.
- `app.js` wires product tools and specialist tools into the conversation
  registry. Product read tools currently include context, recipe metadata/load,
  project reads, and map inspection helpers. Diagnostic smoke tools are not part
  of the production surface.
- `wsHandler` handles `gui-response`; GUI request resolution is scoped to the
  initiating `clientId:subscriptionId`, and `subscriptionDown` cancels pending
  GUI requests for that subscription.
- GUI chat supports `context`, `tool-start`/`tool-end` using `toolName`/`ok`, and
  `gui-action` responses.
- Existing GUI chat actions can create, save, load, list, move, delete, open,
  close, map, and visualize. The AI product surface should expose only the
  narrow subset appropriate for the orchestrator; raw recipe load/write actions
  should move behind recipe specialists as that boundary lands.

Implication: direct read tools and the first map specialist POC are no longer
the blocker. The next architectural pressure is tool visibility: the
orchestrator should keep metadata/routing tools, while raw recipe inspection and
patching move behind recipe specialists.

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

One logical specialist per recipe type. It describes, creates, or updates
recipes for that type only. It is the only actor that should see raw recipe
JSON or detailed recipe fragments.

Inputs:

- `operation`: `describe`, `create`, or `update`
- resolved `recipeType`
- user instruction or question
- optional `recipeId`
- optional workflow context from the orchestrator
- optional recent user/orchestrator context selected by the orchestrator

Knowledge:

- recipe description/use cases
- choose/dont-choose guidance
- defaults
- JSON Schema/rule summaries or LLM-compatible schema projection
- cross-field rule prose
- gotchas and cost notes

Allowed writes:

- recipe creation by patching the recipe type's GUI/default model
- recipe updates through JSON Patch against the current GUI model

Private read/write tools:

- recipe fragment load
- recipe create-from-patches
- recipe update-from-patches
- recipe-type schema/rule helpers for planning, not authoritative validation

The recipe specialist does not call workflow/map/browse specialists. It returns
derived descriptions, edit summaries, missing-information requests, or failure
reasons to the orchestrator; it should not pass raw recipe JSON back unless a
specific later design requires it.

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
- recipe-specialist descriptions when workflow reasoning needs recipe internals
- compact recipe inventory when relevant
- workflow capability summaries and examples

The workflow specialist should not inspect raw recipe JSON. If it needs to know
what a recipe does or produces, the orchestrator asks the appropriate recipe
specialist for a derived description and passes that description along.

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
recipe_list(...)
describe_recipe({recipeId, question?})
update_recipe({recipeId, instruction})
create_recipe({recipeType, instruction, projectId?, name?})
call_workflow_specialist({brief, context?, recipeSummaries?})
call_map_layout_specialist({brief})
map_get_view()
map_set_camera(...)
map_fit_bounds(...)
map_zoom_to_place(...)
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

Recipe operation tools are public dispatcher tools, not per-type tools. They
route to the appropriate recipe-type specialist internally. This keeps the
orchestrator surface proportional to operations, not the number of recipe types.
With roughly twenty recipe types, public tools such as
`update_mosaic_recipe`, `update_classification_recipe`, and so on would bloat
the tool list and force type-specific guidance back into the orchestrator.

For existing recipes, `describe_recipe` and `update_recipe` should resolve
`recipeType` from `recipeId`; the orchestrator should not guess it. For
creation, `create_recipe` requires `recipeType` because no recipe exists yet.

`describe_recipe` is an inquiry operation and must be stateless. Its tool
description should tell the orchestrator to call it again for follow-ups with
the follow-up question plus relevant prior derived context. The recipe
specialist does not own a conversational thread for descriptions.

Raw `recipe_load` and `recipe_patch` are intentionally not always-visible
orchestrator tools in V1. They are specialist-internal tools used only after the
orchestrator has routed the request to a recipe specialist. Other specialists
receive recipe-specialist descriptions, not raw recipe JSON. Any hard
confirmation required by a write operation is enforced by the tool
implementation and GUI bridge.

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

Diagnostic/smoke tools are not product tools. They must stay out of the default
production tool surface; prefer test fixtures or clearly isolated development
harnesses over runtime flags.

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

- Specialist operations are stateless by default. Each call answers or acts from
  the supplied arguments and context only.
- Inquiry operations such as `describe_recipe`, inspect/explain map state, and
  workflow advice must stay stateless. Follow-up continuity is owned by the
  orchestrator, which calls the specialist again with the follow-up question and
  relevant prior derived context.
- Action operations such as `create_recipe` and `update_recipe` can also be
  stateless. If a specialist needs more information, it returns `need_info`
  with questions plus a compact continuation summary. The orchestrator asks the
  user and then calls the same operation again with the original instruction,
  additional information, and continuation summary.
- Stateful action sessions are a later optimization only. They may be useful
  when repeated fragment loading, prompt setup, or partial planning becomes
  expensive. A stateful specialist would return `need_info` with a `sessionId`;
  the orchestrator would call `resume_specialist({sessionId, additionalInfo})`,
  and the session would live only until resume, timeout, cancellation, `done`,
  or `failed`.
- If stateful sessions are added, store them in memory only and use clock-driven
  TTL.

Do not keep successful specialist history around by default. It is likely to be
stale after recipe edits and can make later routing harder to reason about.
Do not turn inquiry specialists into conversational agents; the orchestrator is
the only user-facing conversation owner.

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
- recipe specialists inline one recipe type's schema/rules/guidance directly
  in the system prompt; tool input schemas stay minimal

In-process specialist sessions buy hidden message-history reuse only while the
session is alive. Provider prefix caches, where available, work across fresh
specialist invocations because the static prompt and tools remain byte-identical.

### Provider support

Cache support is provider-specific. The Bedrock Converse API is the primary
cache-aware path for production. Exact model IDs live in model-profile config;
the examples below describe the behavior the profile should declare.

- Amazon Nova Lite-family profiles, including any configured Nova 2 Lite
  profile: cache `system` and `messages`; do not accept cache markers in
  `tools`. 5-min sliding TTL only. 1K min tokens per checkpoint, max 4
  checkpoints per request. Implicit caching (latency only, no cost discount) is
  on by default; explicit markers are needed for the cost discount.
- Anthropic Claude 4.5 family on Bedrock (`anthropic.claude-opus-4-5`,
  `anthropic.claude-sonnet-4-5`, `anthropic.claude-haiku-4-5`): caches
  `system`, `messages`, and `tools`. 5-min and 1-hour TTL options. 4K min
  tokens per checkpoint, max 4 checkpoints per request. Fully opt-in via cache
  markers.
- OpenAI direct: auto-caches stable prefixes without markers. Treat as a free
  latency/cost win when present.
- OpenAI-compatible local servers (LM Studio): no caching. Larger system
  prompts cost full price every turn; tune accordingly.

The 4-checkpoint cap is shared across `system`, `messages`, and `tools`. The
5-min TTL is sliding (resets on every hit), so an active session keeps the
cache warm continuously.

### Cache point placement

Three rules cover the relevant cases. The adapter applies them based on the
resolved model profile's cache capabilities.

1. **After the static system content.** Unconditional on any cache-aware
   provider. Caches across users and conversations within the AWS
   account/region.
2. **At the boundary between stable history and the new turn.** For the
   orchestrator on cache-aware providers; the marker advances forward each
   turn so the just-finished history joins the cached prefix on the next
   request. Specialists do not benefit under V1's drop-session-on-done policy
   (§6); they have no growing history to mark.
3. **After the tools array.** Only when the model exposes `cache_in_tools`
   capability (Claude 4.5 family). Omitted for Nova 2 Lite and any other
   model that does not accept cache markers in `tools`.

Markers must not sit after per-turn ephemeral content (turn context block, GUI
selection state, current map view, anything injected for one turn). Those
bytes do not repeat and would only incur write cost.

### Adapter responsibility

The Bedrock Converse adapter owns marker emission. Specialist and orchestrator
code does not know about `cachePoint` syntax or per-model cache rules.

- Model profiles declare behavior capabilities: `prompt_cache`, optionally
  `cache_in_tools`, optionally `cache_ttl_1h`. These names mean "this profile
  can request caching", "this profile can place a marker after tools", and
  "this profile can request a 1-hour TTL"; they are not provider wire fields.
- The adapter inspects the resolved profile and applies rules 1, 2, 3 as
  capabilities allow.
- The adapter advances rule 2's marker as conversation history accumulates.
- The adapter omits rule 3 for models without `cache_in_tools`.
- Profiles for non-cache-aware providers leave `prompt_cache` off; the
  adapter emits no markers in that case.

Cache-hit metrics from `llm.usage` events (§11 `cachedInputTokens`,
`cacheWriteTokens`) validate marker placement. Consistently zero
`cachedInputTokens` under expected reuse patterns indicates a marker placement
bug or unexpected byte drift in the prefix.

### Implications for prompt structure

- Push detailed task descriptions and routing prose into the system prompt
  where it caches, not into per-tool descriptions in the `tools` field. This
  matters most for the orchestrator, where the dispatcher tool surface hits
  the wire every turn on Nova (rule 3 unavailable) and the orchestrator is
  the highest-frequency LLM call in the system.
- Recipe specialists inline schemas, defaults, cross-field rule prose, and
  gotchas directly in the system prompt. Tool input schemas (for example
  JSON Patch operations for `recipe_patch`) stay minimal; semantic guidance
  about when and how to construct them lives in the system prompt.
- The orchestrator captures two cache wins simultaneously: static prefix
  (rule 1) and growing history (rule 2). Specialists capture only the static
  prefix. The orchestrator is the highest-value cache target in the system.
- Rule 1's cross-user reuse depends on byte-identical system prompts across
  users. Do not interpolate `username`, current date, or per-user feature
  flags into system text. §15 already requires this; it is what preserves
  rule 1's value.
- Caching is enabled everywhere by default. The penalty for a cache-miss
  invocation is bounded by invocation count and stays small for slow
  specialists; the gain when calls cluster within TTL is real. Provider-side
  minimum-token filtering (Nova 1K, Claude 4.5 family 4K) silently drops
  too-small prompts from caching with no penalty.

Treat cache-hit metrics as an optimization and rollout signal, not as a
correctness dependency.

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

Cache-aware profiles add behavior capabilities such as `prompt_cache`,
`cache_in_tools`, and `cache_ttl_1h`; adapters translate those capabilities
into provider-specific cache markers.

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
- AWS Bedrock Converse: unified API across Amazon Nova and Anthropic Claude
  models; `toolConfig.tools` for tool schemas, assistant `toolUse` content
  blocks, user `toolResult` content blocks; optional cache markers in
  `system`/`messages`/`tools` per model capability (§7). The adapter maps the
  internal placement rules to Bedrock's `cachePoint` blocks.
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

## 12. Recipe create/update model

Recipe specialists should express changes as JSON Patch operations, not full
recipe documents. The GUI applies those operations to the authoritative complete
model, validates the full candidate locally, and persists through the existing
recipe save path.

Contract:

- operations: `add`, `remove`, `replace`, `move`, `copy`, and optional `test`
- atomic apply: all operations apply or none do
- validate post-apply in the GUI using schema plus cross-field rules
- persist through GUI as the source of truth
- return concise summary and invalidated paths

Creation uses the same patch discipline. The specialist emits operations against
the recipe type's default model. The GUI loads the default model, applies the
operations, validates, creates/persists the recipe, and returns the new
`recipeId` and `modelHash`. Specialist-authored complete recipe JSON is a
fallback for small/immature recipe types, not the preferred path.

Update uses operations against the current model snapshot. The specialist may
generate obvious patches from schema/rule knowledge alone, or first load the
fragments needed to reason about the requested change.

V1 optimistic concurrency token: `baseModelHash`.

The specialist-private recipe load path returns the current `modelHash`, read
from `getHash(recipe.model)` in the GUI. If a loaded model has no hash, the load
path must stamp one before returning it. This is a volatile GUI-side revision
token, not a durable content hash; it protects against concurrent edits to the
loaded model. `recipe_patch` requires:

```json
{
  "recipeId": "r1",
  "baseModelHash": "hash-from-recipe-load",
  "operations": []
}
```

Before persistence, the GUI write path compares `baseModelHash` with the current
`getHash(recipe.model)`. Mismatch returns a structured stale-write error; the
recipe specialist must reload and retry from the new model or report the
conflict. This is required because index-addressed JSON Patch is unsafe when the
user edits the same recipe while the specialist is thinking.

`test` operations are still useful for semantic assertions ("this field still
has value X"), but they are not the primary concurrency mechanism.

SEPAL recipe API notes for tool implementations:

- Do not use direct DB access; recipe persistence goes through existing SEPAL
  APIs or GUI actions.
- The server-side recipe save API stores a gzip-compressed UTF-8 JSON contents
  envelope, not just the recipe model.
- The contents envelope includes recipe identity/type/project plus `model`,
  UI state, and map-layer state. Specialist-private recipe load should expose a
  projected model view, not the full browser/UI envelope by default.
- Recipe list endpoints return metadata only, not full contents.
- Delete has both single-recipe and bulk endpoints; destructive tools must
  enforce GUI hard confirmation before calling either path.
- In V1 the GUI remains state, validation, and persistence authority. The
  specialist proposes JSON Patch operations; the GUI applies them against the
  complete current/default model, validates the full candidate, enriches the
  recipe state, stamps a new model hash, updates Redux, and persists through the
  existing gzip/envelope save path.
- The AI side should not assemble or ship complete recipes for normal
  create/update flows. That would duplicate GUI authority, move heavy
  `CLASSIFICATION` training data over the wire unnecessarily, and force the AI
  to reconstruct fields omitted from projections.

Projected paths:

- Specialist-private recipe loads may omit heavy fields with markers such as
  `{ "_omitted": 5234, "_kind": "referencePoints" }`.
- The LLM may replace a whole omitted region.
- The LLM may append to an omitted array with `/-` only if the handler can do so
  without materializing stale indices.
- The LLM may not replace/remove a specific omitted index without deep-reading
  that path first.

Future fragment tools:

- A specialist may use `recipe_fragments_load({recipeId, paths})` to inspect
  explicit model fragments before emitting a patch.
- Relevance inference should live in the recipe knowledge package, not the GUI
  bridge. For example, `fragmentsForEdit({recipeType, intent, targetPaths})`
  can deterministically expand target paths to dependent fragments using the
  specialist's schema/rules.
- Avoid a public `recipe_relevant_fragment_load` tool until the deterministic
  rule layer exists. It would mix two responsibilities: deciding what matters
  and loading current GUI state.

## 13. Schema and validation

Validation authority belongs with the GUI write path. The GUI has the complete
current/default model, owns browser recipe state, and already persists through
the correct gzip/envelope flow. This is especially important for heavy
`CLASSIFICATION` recipes: changing an SVM parameter should not require sending
training data through the AI module just so a server-side validator can rebuild
the full model.

The schema/rule code should be shared, not duplicated:

- GUI imports and runs the authoritative validators against full candidate
  models before create/update persistence.
- Recipe specialists import summaries, projections, defaults, and deterministic
  helper metadata from the same source where practical.
- The specialist uses that knowledge to choose fragments, ask questions, and
  propose likely-valid patches; it is not the final validation authority.
- Patch envelope validation still happens at the AI tool boundary: operation
  shape, required fields, JSON Pointer strings, and non-empty operation lists.

Recommended V1:

- Create a shared active recipe knowledge package under `lib/js/recipes` by deliberately resurrecting
  one recipe type from archive through tests. It must be usable by the GUI
  validator and by AI prompt/fragment-planning code without importing
  browser-only modules into the AI runtime.
- Treat archived recipe schemas/rules as source material, not runtime
  dependencies. Do not import active code from `archive/pre-rewrite-chat`.
- Reuse archive ideas selectively: schema properties, defaults, cross-field rule
  descriptions, gotchas, cost notes, output bands, and visualization hints.
- Verify archived assumptions against current recipe models and GUI save
  behavior before promoting them into active validators.
- Keep default-model construction close to the validator. `create_recipe`
  applies specialist patches to that default model and validates the full
  candidate in the GUI.
- Keep deterministic fragment expansion close to the recipe knowledge:
  `fragmentsForEdit({recipeType, intent, targetPaths})` can tell a specialist
  which paths to inspect before patching.
- Keep this as library code, not a deployable module. `lib/js/recipes` is the
  intended home because SEPAL `modules/*` conventionally represent containerized
  runtime modules.

This split avoids duplicate validation authority while preserving GUI ownership
of client state and persistence. The first patch-wire slice may validate only
the JSON Patch envelope and operation syntax; domain validation belongs in the
GUI/shared recipe validation package and should land by recipe type.

Possible active package shape for the first resurrected recipe:

```text
lib/js/recipes/src/mosaic/
  index.js
  schema.json
  defaults.js
  rules.js
  promptFacts.js
  validate.js
  fragments.js
```

Expected export shape:

```js
{
  id: 'MOSAIC',
  name: 'Optical Mosaic',
  schema,
  defaults,
  defaultModel(),
  validate(model),
  promptFacts(),
  fragmentsForEdit({intent, targetPaths})
}
```

Do not bulk-migrate every archived recipe schema. Bring recipe packages back one
at a time, starting with the Phase 3 recipe type. Each resurrected package must
land with focused tests for defaults, schema acceptance, validation rules,
fragment expansion, and prompt facts. GUI validation tests must prove that
create/update reject invalid full candidates before persistence.

## 14. Specialist prompt builder

Recipe specialist prompts should be assembled mechanically from active recipe
knowledge, not hand-authored from scratch per type.

Per recipe type, build the prompt from:

- recipe `description`, `useCases`, `chooseWhen`, and `dontChooseWhen`
- defaults and schema/projection summary
- `rule.description` strings for cross-field constraints
- output bands/visualization notes where present
- a short hand-written gotchas/cost section

The source is active shared recipe knowledge code, resurrected deliberately
through tests. Archive files can guide the first implementation, but active code
must not import from `archive/pre-rewrite-chat/`.

Schema-driven params plus rule prose is intentional. JSON Schema cannot express
all recipe semantics clearly enough for the LLM.

## 15. Context injection

Current GUI already sends compact selection context. The server stores it per
tab/subscription and injects a capped ephemeral turn-context block. On-demand
context read tools are still pending.

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
   - Examples: `get_context()`, `recipe_list`, `describe_recipe`,
     `map_get_view`, `recipe_capabilities_search`, and workflow capability
     lookup. Raw/projected recipe JSON load tools are specialist-private.

Preferred V1 implementation:

- Continue storing latest context per tab/subscription in `UserChat` or a nearby
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
- Keep raw recipe JSON out of orchestrator context. When another specialist
  needs recipe internals, the orchestrator asks a recipe specialist for a
  derived description and passes that derived text/structure onward.

Reasoning:

- The orchestrator often needs selected recipe/project to resolve "this".
- A tool avoids injecting stale GUI state into every historical message.
- A small per-turn block helps cheap pronoun resolution without forcing a tool
  round on every request.
- Keeping user identity and GUI state out of the static system prompt preserves
  prompt-prefix cacheability and avoids cross-user prompt fragmentation.
- Username is usually infrastructure data, not reasoning context. Giving it to
  the model by default adds privacy exposure and tokens with little benefit.

The system prompt should stay static. Do not reintroduce `{{username}}`,
`{{currentContext}}`, or `{{recipeTypes}}` placeholders into runtime prompt
content. Runtime context belongs in ephemeral turn context or explicit tool
results, not in the cacheable system prompt.

## 16. GUI request/response and confirmations

Server-side tools use a request/response bridge to GUI actions:

```text
AI -> GUI: {type: "gui-action", requestId, action, params}
GUI -> AI: {type: "gui-response", requestId, success, data?, error?}
```

Gateway/session routing notes:

- Inbound websocket messages include authenticated `username`, `clientId`, and
  `subscriptionId`; user-visible chat context is tab-local, so ephemeral GUI
  context is keyed by `clientId:subscriptionId`, not by conversation.
- `subscriptionDown` is the primary cleanup signal for tab-scoped state.
  `clientDown`, if reintroduced, should only be a safety-net cleanup for missed
  subscriptions.
- Outbound GUI requests are subscription-scoped in V1. They target the
  subscription that initiated the turn and are not rebound to another tab.
- On `subscriptionDown`, pending GUI requests for that subscription are
  cancelled and late responses are ignored.
- A `gui-response` resolves a pending request only when both `requestId` and the
  authenticated `clientId:subscriptionId` match the owning pending request.
  Unknown or wrong-subscription responses are ignored.
- Tab-independent operations should be implemented as server/direct tools, not
  as rebindable GUI actions.

Request lifecycle:

- AI side generates `requestId` and stores a pending request with timeout and
  owning `clientId:subscriptionId`.
- AI sends targeted `{type: "gui-action", requestId, action, params}`.
- GUI handler runs and responds with matching `{type: "gui-response",
  requestId, success, data?, error?}`.
- Server verifies the response came from the owning subscription. Success
  resolves the pending request; `success: false`, timeout,
  `subscriptionDown`, websocket disconnect, or turn cancellation rejects it with
  a structured tool error.
- Cancellation unsubscribes the pending request and ignores late responses.

`tool-start`/`tool-end` wrap the logical tool invocation and use the canonical
wire fields `toolName` and `ok`. A tool may make zero, one, or multiple GUI
requests internally.

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

### Phase 0: tool transport foundation

Goal: provider-neutral tool transport is stable enough for product tools and
specialists, while diagnostic tools stay out of the production model surface.

Implemented foundation:

- LLM port accepts tool schemas.
- OpenAI-compatible adapter sends tools and parses streamed tool calls through
  the provider-neutral LLM/tool contract.
- Tool registry/dispatcher exists in active code.
- Production tool surface includes real product read tools and the first
  specialist POC; diagnostic smoke tools are not part of the runtime surface.
- `Conversation` invokes tools, feeds `{ok, data?, error?}` results back to the
  LLM, emits `tool-start`/`tool-end`, and enforces a max tool-round cap.
- Structured tool-error envelope exists for unknown, invalid, failing, and
  repeated failing tool calls.
- Server handles targeted GUI request/response, timeout, wrong-subscription
  responses, and `subscriptionDown` cancellation.
- Tests cover `Conversation`, `UserChat`, `wsHandler`, GUI request bridge,
  OpenAI-compatible adapter formatting/parsing, GUI reducer tool rendering, and
  provider-conformance fixtures for internal tool-turn messages.

Remaining foundation work:

- Split the current OpenAI-compatible adapter into provider-neutral LLM
  contract/common code and provider adapters.
- Keep LM Studio native no-reasoning title generation isolated from normal
  OpenAI-compatible chat/tool transport.
- Add model-profile resolution for orchestrator calls and specialist policy
  inputs.
- Emit basic `llm.usage` events with provider/model/profile and byte/count
  fallbacks.
- Add structured boundary events with lazy `message`/`payload` where still
  missing.
- Log provider-formatted tool schema byte size.
- Ensure `tool.invoke` tracing remains covered after the adapter refactor.
- Run a successful browser GUI request/response E2E only when a real GUI action
  or explicit dev-only diagnostic GUI handler exists.

Acceptance:

- Tool-loop tests can use fake tools and still feed the provider-neutral result
  back to the LLM.
- OpenAI-specific tool formatting/parsing is covered in adapter tests, while
  `Conversation` tests assert only provider-neutral message/tool shapes.
- Diagnostic tools are not visible to the production model by default.
- Server-side GUI request/response resolves only for the owning subscription and
  cancels on `subscriptionDown`.
- Unknown or failing tool returns structured error to the LLM.
- Each LLM call logs its resolved provider/model/profile and whatever usage
  fields are available.
- Full request/response payloads are inspectable at trace without eager
  serialization in the main path.

### Phase 1: context and direct reads

Goal: orchestrator can resolve current GUI state and read metadata without full
tool bloat.

Scope:

- Keep the static system prompt placeholder-free.
- Continue storing latest GUI context per tab/subscription.
- Add `get_context()`.
- Add `recipe_list`.
- Keep any raw/projected `recipe_load({recipeId, path?})` private to recipe
  specialists once the recipe-specialist boundary lands.
- Add projection for heavy known fields in `CLASSIFICATION` first for the
  specialist-private load path.

Acceptance:

- "this recipe" resolves through context.
- Specialist-private loading of a classification recipe with many reference
  points returns an omitted marker unless path-scoped.
- Runtime prompt contains no literal `{{...}}` template placeholders.

### Phase 2: recipe specialist boundary

Goal: route recipe-specific work through operation-level public tools while
keeping raw recipe JSON private to recipe specialists.

Scope:

- Add public operation tools:
  - `describe_recipe({recipeId, question?})`, stateless; follow-ups are new
    calls with relevant prior derived context
  - `update_recipe({recipeId, instruction})`
  - `create_recipe({recipeType, instruction, projectId?, name?})`
- Route each operation to the appropriate recipe-type specialist.
- Resolve `recipeType` from `recipeId` for existing recipes; do not trust the
  orchestrator to guess it.
- Move raw/projected recipe load behind the recipe specialist's private tool
  registry.
- Implement one recipe specialist enough to describe a recipe from private
  recipe fragments.
- Define private create/update tool contracts as patch-oriented operations:
  create patches a default model; update patches the current GUI model. Full
  recipe JSON is not LLM-visible.

Acceptance:

- The orchestrator can describe a selected recipe without seeing raw recipe
  JSON.
- Workflow specialist can receive a recipe-specialist description rather than a
  recipe model.
- Raw recipe load is not in the always-visible orchestrator tool surface.

### Phase 2.5: Bedrock Converse and prompt caching

Goal: add the production cache-aware provider path before recipe specialists
grow large schemas/rules and before specialist-private recipe writes increase
LLM prompt size.

Scope:

- Add a Bedrock Converse provider adapter beside the existing provider
  adapters.
- Add model-profile resolution sufficient to choose Bedrock Converse vs
  OpenAI-compatible adapters from runtime policy.
- Support Bedrock Converse tool calls and tool results through the same
  provider-neutral LLM/tool contract as §10.
- Implement the cache placement rules from §7 inside the Bedrock adapter:
  after static system content, at the stable-history/new-turn boundary, and
  after tools only for profiles with `cache_in_tools`.
- Add profile cache capabilities (`prompt_cache`, `cache_in_tools`,
  `cache_ttl_1h`) as behavior flags consumed by adapters, not by conversation
  or specialist code.
- Normalize Bedrock usage/cache metadata into `llm.usage`, including cache
  read/write token fields where the provider reports them.
- Add provider conformance tests for Bedrock tool turns and cache marker
  placement.

Acceptance:

- `Conversation` and specialist tests remain provider-neutral; no Bedrock wire
  shape leaks into domain tests.
- Bedrock adapter formats tool schemas, tool calls, and tool results from the
  shared conformance fixture.
- Cache markers are emitted only when the resolved profile declares cache
  support, and the tools marker is omitted unless `cache_in_tools` is present.
- `llm.usage` events include normalized provider/model/profile and cache
  read/write fields when available.

### Phase 3: specialist-private recipe patch

Goal: incremental recipe updates without full-model round trip, through the
recipe specialist boundary.

Scope:

- Add recipe-specialist model policy by recipe type and operation.
- Recommended first type: `MOSAIC`, because it is common and domain-rich.
  This is representative rather than minimal; it trades fast shipping for a
  meaningful schema/rule acceptance gate.
- Add `baseModelHash` to specialist-private `recipe_load` and require it in
  `recipe_patch`.
- Add JSON Patch apply path with GUI base-hash enforcement and GUI-side full
  candidate validation.
- Add `recipe_patch` to the recipe specialist's private tools, not the
  orchestrator surface.
- Add shared schema/rule validation for one recipe type, executed
  authoritatively in the GUI write path. AI uses the same package for prompt
  facts and deterministic fragment planning.
- Specialist can update using patch tools only.
- Specialist returns `done`, `need_info`, or `failed`.
- Specialist sessions exist only for `need_info`.
- Usage events identify orchestrator vs recipe specialist and include
  `recipeType`.
- Specialist request/response events expose safe debug summaries and trace-only
  full payloads.

Decision gate:

- Can the chosen provider handle the recipe specialist prompt, schema/rule
  summaries, and private tool schemas for the chosen type?
- If not, build an LLM-compatible summary/projection rather than weakening GUI
  validation.
- If `MOSAIC` blocks progress for non-representative reasons, use a smaller
  fallback such as `MASKING` or `CCDC_SLICE` to prove the specialist loop first,
  then return to `MOSAIC`.

Acceptance:

- Single-field recipe update applies atomically through `update_recipe`.
- Invalid patch rolls back and returns path-specific error to the specialist.
- Domain validation failure rolls back and returns a structured validation error
  to the specialist.
- Stale `baseModelHash` is rejected and reaches the specialist as a structured
  error.
- The orchestrator never receives raw recipe JSON or direct `recipe_patch`
  access.

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

1. End of Phase 0: provider adapter boundary is split, provider tool parsing and
   GUI request/response are stable, model-profile resolution works, usage events
   are emitted, boundary request/response inspection is available, and
   dispatcher tool schema bytes fit the budget. If not, shrink the direct
   surface before adding recipe work.
2. End of Phase 2: measure prompt tokens, cache behavior where available, and
   whether operation-level recipe tools keep raw recipe JSON out of the
   orchestrator. If this boundary is too expensive or too vague, revise before
   adding writes.
3. End of Phase 2.5: Bedrock Converse tool turns pass the shared provider
   conformance fixture, cache marker placement is profile-driven, and
   normalized usage events expose cache read/write fields where available.
4. Start of Phase 3: run provider-acceptance checks for the chosen recipe
   specialist prompt and private tool schemas. If the provider rejects the
   context size or schema shape, choose between summary/projection and a smaller
   first specialist.
5. End of Phase 3: measure patch payload size, stale-write rate, and tool
   failure rate. If specialist-private patching solves the user-visible
   cost/quality problem at current recipe count, defer broader roster expansion.
6. Mid roster expansion: if per-type gotchas authoring or schema projection cost
   dominates observed benefit, stop expansion and keep generic/direct fallback
   behavior for remaining types.

## 20. File layout target

```text
modules/ai/src/chat/
  llmText/
    prompts.js                # mainSystemPrompt(), titleSystemPrompt(), specialistPrompt(name)
    main.md                   # main user-facing agent
    title.md                  # title-generator utility
    specialists/              # mirrors src/chat/specialists/
      map.md                   # POC map specialist prompt (read-only)
  specialists/                # POC implementation (sibling of conversation/)
    runSpecialist.js          # Inner LLM loop with filtered tools
    specialistTools.js        # Specialist-as-LLM-tool registry (consult_map etc.)
    recipeSpecialists.js       # describe_recipe/update_recipe/create_recipe routing
  tools/
    registry.js               # LLM tool schema/invocation registry
    productTools.js           # Product tool composition
    contextTool.js             # get_context
    recipeTools.js             # recipe_list plus public recipe operation tools
    recipePrivateTools.js      # specialist-private recipe_load/recipe_patch
    projectTools.js            # project_list
    mapTools.js                # map_area_list, layer_list
    guiProductRequest.js       # Product-tool GUI request helper
    guiRequests.js            # GUI request/response bridge for tools
    recipeProjection.js
    jsonPointer.js
  llm/
    index.js
    common/
      events.js
      text.js
    providers/
      openaiChatCompletions.js
      lmStudioNativeChat.js
      bedrockConverse.js        # AWS Bedrock Converse adapter; emits cachePoint markers per §7
  conversation/
    conversation.js
    llmMessages.js
    conversationEvents.js
    userChat.js
    titleGenerator.js
    turnContext.js
    wsHandler.js
    wsChannel.js
    redisHistory.js
    redisConversationsStore.js
    redisKeys.js
    modelProfiles.js
    usageAccounting.js
    eventInspection.js
    specialistModelPolicies.js
    toolLoopSafety.js

lib/js/recipes/
  package.json
  src/
   mosaic/
    index.js                  # shared recipe knowledge exports
    schema.json
    rules.js
    defaults.js
    validate.js
    fragments.js

modules/gui/src/app/home/body/chat/
  chatPanel.jsx
  useConversation.js
  guiActionRegistry.js

modules/gui/src/app/home/body/process/chatActions/
  recipeActions.js
  mapActions.js
  visualizationActions.js
```

Future providers such as Claude should add sibling adapters under
`chat/llm/providers/` without changing `Conversation` or specialist loops.

## 21. Open questions

- What should the `lib/js/recipes` package boundary expose publicly vs keep as
  per-recipe internals?
- What should `get_context()` return beyond the compact turn context already
  injected into the first LLM call of a user turn?
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
