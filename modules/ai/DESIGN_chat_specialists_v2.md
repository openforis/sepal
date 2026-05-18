# AI chat specialist architecture

## 1. Core architecture

The user talks to one user-facing orchestrator:

```text
user -> orchestrator -> specialist/tool -> orchestrator -> user
```

Specialists are hidden tools behind the orchestrator. They reason with narrower
prompts and narrower tool surfaces, but they do not own the user conversation
and do not call other specialists.

The orchestrator owns intent, routing, missing-info questions, plan
confirmation, tool/specialist ordering, retries, cancellation caps, and final
responses. Tool implementations own GUI hard-confirmation boundaries. The LLM
may choose a destructive/high-impact tool, but it does not write confirmation
copy or bypass GUI confirmation.

Specialist roles:

- Recipe specialists describe/create/update one recipe type and are the only
  actors that may see raw recipe JSON or detailed recipe fragments.
- Workflow specialist recommends a structured workflow plan. It does not make
  side effects.
- Map layout/visualization specialist handles layout/source/visualization
  reasoning through scoped map tools.
- Browse/project work stays direct and deterministic unless intent
  disambiguation later justifies a specialist.

The point of specialists is context isolation. Recipe schemas, recipe rules,
visualization guidance, workflow examples, and raw recipe JSON should not sit in
the always-visible orchestrator prompt.

## 2. Current implementation baseline

Current AI/chat code already has:

- static system prompt with no runtime placeholders
- compact GUI selection context stored per tab/subscription and injected as
  ephemeral turn context on the first LLM call of a user turn
- `Conversation` support for tool schemas, provider-normalized tool calls,
  tool results, max tool rounds, and `tool-start`/`tool-end`
- OpenAI-compatible tool-call adapter; LM Studio native path is title-only
- product and specialist tools wired in `app.js`
- subscription-scoped GUI request/response with timeout, wrong-subscription
  rejection, and `subscriptionDown` cancellation
- GUI chat support for `context`, `tool-start`/`tool-end`, and `gui-action`
  responses

The main architectural pressure is tool visibility: keep routing/metadata tools
at the orchestrator level, and move raw recipe inspection and mutation behind
recipe specialists.

## 3. Tool surface

Target always-visible orchestrator tools:

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

This surface intentionally mixes specialist-backed tools for high-context work
and direct deterministic tools for low-context actions. Do not force every
action through an agent.

Recipe operation tools are public by operation, not by recipe type:

- `describe_recipe`
- `update_recipe`
- `create_recipe`

They route internally to the right recipe-type specialist. This keeps the
orchestrator surface proportional to operations instead of the number of recipe
types. Existing recipes resolve `recipeType` from `recipeId`; creation requires
`recipeType` because no recipe exists yet.

`describe_recipe` is stateless. Its tool description must tell the orchestrator
to call again for follow-ups with the new question plus relevant prior derived
context. The recipe specialist does not own a conversation for descriptions.

Raw `recipe_load`, recipe fragment load, `recipe_patch`, and create/update
primitives are specialist-private. Other specialists receive derived
descriptions from recipe specialists, not raw recipe JSON.

Budget:

- keep always-visible orchestrator tools in the low double digits
- target <= 15 KB provider-formatted tool schema/description bytes
- move tools with large recipe-domain prose, enums, or examples behind a
  specialist
- keep diagnostic/smoke tools out of the production surface

## 4. Specialist lifecycle

Default policy: specialist operations are stateless. Each call answers or acts
from supplied arguments and context only.

Inquiry operations, including `describe_recipe`, map explanation, and workflow
advice, must stay stateless. Follow-up continuity belongs to the orchestrator.

Action operations such as `create_recipe` and `update_recipe` can also be
stateless. If more information is needed, return `need_info` with questions and
a compact continuation summary. The orchestrator asks the user, then calls the
same operation again with the original instruction, additional information, and
continuation summary.

Stateful action sessions are a later optimization, useful only if repeated
fragment loading, prompt setup, or partial planning becomes expensive. A
stateful specialist would return `need_info` with `sessionId`, then live only
until resume, timeout, cancellation, `done`, or `failed`. Store such sessions in
memory with clock-driven TTL.

Do not keep successful specialist history by default. It is likely stale after
recipe edits and makes routing harder to reason about. Prompt-prefix caching
still works because static specialist prompts and tool schemas remain
byte-identical across fresh invocations.

## 5. Recipe specialists

One logical recipe specialist exists per recipe type. Inputs:

- operation: `describe`, `create`, or `update`
- resolved `recipeType`
- user instruction or question
- optional `recipeId`
- optional workflow context
- optional recent user/orchestrator context selected by the orchestrator

Knowledge:

- recipe description, use cases, choose/dont-choose guidance
- defaults
- JSON Schema/rule summaries or LLM-compatible schema projection
- cross-field rule prose
- gotchas, cost notes, output bands, and visualization hints

Private tools:

- recipe fragment load
- create recipe from patches against the default model
- update recipe from patches against the current GUI model
- schema/rule helpers for planning, not authoritative validation

The specialist returns derived descriptions, edit summaries,
missing-information requests, or failure reasons. It should not pass raw recipe
JSON back unless a later design explicitly requires it.

## 6. Recipe create/update model

Recipe specialists should express create/update as JSON Patch operations, not
full recipe documents. The GUI applies patches to the authoritative complete
model, validates the full candidate locally, updates GUI state, and persists
through the existing recipe save path.

Patch contract:

- allowed ops: `add`, `remove`, `replace`, `move`, `copy`, optional `test`
- all-or-nothing apply
- post-apply validation in GUI using schema plus cross-field rules
- persistence through GUI as source of truth
- structured result with concise summary, invalidated paths, and new
  `modelHash` on success

Creation patches the recipe type's default model. Update patches the current
model snapshot. Specialist-authored complete recipe JSON is only a fallback for
small/immature recipe types.

Optimistic concurrency uses `baseModelHash`. Specialist-private load returns
the current `modelHash` from `getHash(recipe.model)` and stamps the model first
if needed. `recipe_patch` requires `{recipeId, baseModelHash, operations}`.
Before persistence, GUI compares `baseModelHash` to the current
`getHash(recipe.model)`. Mismatch returns a structured stale-write error; the
specialist reloads/retries or reports the conflict. JSON Patch `test` ops are
semantic guards, not the primary concurrency mechanism.

SEPAL recipe implementation rules:

- no direct DB access from AI tools
- recipe persistence goes through existing SEPAL APIs or GUI actions
- server recipe save stores a gzip-compressed UTF-8 contents envelope, not just
  `model`
- specialist-private loads expose projected model views, not the full browser
  UI/map envelope by default
- recipe list returns metadata only
- destructive operations require GUI hard confirmation
- AI should not ship complete recipes in normal create/update flows, especially
  for heavy `CLASSIFICATION` training data

Projected/heavy fields:

- loads may omit heavy fields with markers such as
  `{ "_omitted": 5234, "_kind": "referencePoints" }`
- the LLM may replace a whole omitted region
- append to omitted arrays with `/-` only when the handler can do so without
  stale indices
- no replace/remove of a specific omitted index without deep-reading that path

Fragment loading should stay explicit: `recipe_fragments_load({recipeId,
paths})`. Relevance inference belongs in shared recipe knowledge, for example
`fragmentsForEdit({recipeType, intent, targetPaths})`; avoid a public
`recipe_relevant_fragment_load` until that deterministic rule layer exists.

## 7. Shared recipe validation

Validation authority belongs with the GUI write path. The GUI has the complete
current/default model, owns browser recipe state, and persists through the
correct gzip/envelope flow. Shared schema/rule code should live in
`lib/js/recipes`, not in a deployable `modules/*` package.

Split of responsibility:

- GUI imports validators and runs them against full candidate models before
  create/update persistence.
- Recipe specialists import prompt facts, projections, defaults, and
  deterministic fragment metadata where practical.
- Specialists use that knowledge to choose fragments, ask questions, and
  propose likely-valid patches; they are not final validation authority.
- AI tool boundary validates patch envelope shape: required fields, non-empty
  operation list, JSON Pointer strings, and operation-specific fields.

Start by resurrecting one recipe type into active shared code through tests.
Archived schemas/rules are source material, not runtime dependencies. Verify
assumptions against current recipe models and GUI save behavior before
promoting them.

Expected package shape:

```text
lib/js/recipes/src/<type>/
  index.js
  schema.json
  defaults.js
  rules.js
  promptFacts.js
  validate.js
  fragments.js
```

Expected exports:

```js
{
  id,
  name,
  schema,
  defaults,
  defaultModel(),
  validate(model),
  promptFacts(),
  fragmentsForEdit({intent, targetPaths})
}
```

Bring recipe packages back one at a time. Each package needs focused tests for
defaults, schema acceptance, validation rules, fragment expansion, prompt facts,
and GUI rejection before persistence.

## 8. Specialist prompts

Recipe specialist prompts should be assembled mechanically from active recipe
knowledge, not hand-authored from scratch per type.

Prompt inputs:

- recipe description, use cases, choose/dont-choose guidance
- defaults and schema/projection summary
- cross-field `rule.description` prose
- output bands and visualization notes
- short hand-written gotchas/cost section

JSON Schema alone cannot express all recipe semantics clearly enough for the
LLM. Rule prose is intentional.

## 9. Workflow, map, and browse

Workflow specialist is planner/advisor only. It returns a structured plan with
assumptions, missing inputs, and steps. It receives user brief, compact GUI
context, selected project, open recipe summaries, relevant recipe inventory,
workflow capability summaries, examples, and recipe-specialist descriptions
when workflow reasoning needs recipe internals. It never inspects raw recipe
JSON and never calls recipe specialists itself.

Map bounds remain direct deterministic tools: get view, set camera, fit bounds,
geocode place, pan/zoom, and sync. Map layout/visualization may use a specialist
because it involves judgment: comparison layouts, source placement,
visualization mode/bands, source registration, and destructive layout tradeoffs.

Browse/project actions stay direct: list/open/close/select/move/delete, with
hard confirmation inside destructive tool implementations.

## 10. Context and GUI bridge

Context tiers:

1. Static system prompt: cacheable, byte-identical across users, no username,
   live GUI state, selected recipe, map view, or recipe inventory.
2. Runtime metadata: username, client/subscription IDs, conversation/turn IDs,
   permissions, routing data. Used by infrastructure, not shown by default.
3. Small ephemeral turn context: compact selection/open recipe/map/app state,
   injected outside the system prompt and not persisted in Redis history.
4. On-demand tools: `get_context()`, `recipe_list`, `describe_recipe`,
   `map_get_view`, recipe capability lookup, and specialist-private recipe
   loads.

Do not introduce `{{username}}`, `{{currentContext}}`, or `{{recipeTypes}}`
placeholders into runtime prompt content. Runtime context belongs in ephemeral
turn context or explicit tool results.

GUI bridge:

```text
AI -> GUI: {type: "gui-action", requestId, action, params}
GUI -> AI: {type: "gui-response", requestId, success, data?, error?}
```

Routing rules:

- inbound websocket messages include authenticated `username`, `clientId`, and
  `subscriptionId`
- tab-local chat context is keyed by `clientId:subscriptionId`
- outbound GUI requests target the subscription that initiated the turn
- `subscriptionDown` cancels pending requests for that subscription
- responses resolve only when both `requestId` and authenticated
  `clientId:subscriptionId` match
- late, unknown, or wrong-subscription responses are ignored
- tab-independent work should be server/direct tools, not rebindable GUI
  actions

`tool-start`/`tool-end` wrap logical tool invocation and use canonical
`toolName` and `ok` fields. A tool may make zero, one, or many GUI requests.

Hard confirmations are part of tool execution. Initial set: delete recipe,
delete project, move recipes to another project, layout changes that remove
visible areas, and project switches that close/hide open work. Chat plan
confirmation still applies before non-trivial constructive work.

## 11. Provider and model contract

Every LLM call resolves a `modelProfile`. Profiles describe concrete runtime
choices; specialist policy describes when a specialist may use them.

Profiles include provider, adapter, model, capabilities, options, and
fallbacks. Specialist policy includes default profile, allowed profiles,
operation overrides, required capabilities, and fallbacks. Environment config
may override policy, but runtime requirements are hard filters.

The orchestrator may pass intent hints such as `interactive`, `cheap`,
`careful`, `high_risk`, `small_patch`, or `large_context`, but it does not pick
provider/model IDs. Runtime resolution combines hints, specialist policy,
provider capabilities, environment config, and fallbacks; specialist policy wins
on conflict. Fallback selection is runtime code and must be logged.

Default roles:

- orchestrator: balanced interactive
- workflow specialist: deep
- recipe specialist: per type and operation
- map layout/visualization specialist: medium
- map bounds tools: direct, no LLM
- title/palette helpers: fast or deterministic where possible

Provider-neutral internal shapes:

```js
{role: 'system', content}
{role: 'user', content}
{role: 'assistant', content, toolCalls}
{role: 'tool', toolResults}

{id, name, input} // tool call
{toolCallId, toolName, result: {ok, data?, error?}} // tool result
```

Structured errors use the same envelope:

```js
{ok: false, error: {code, message}}
```

Adapters own all wire conversion: tool schemas, messages, streaming deltas,
tool calls/results, provider usage/cache metadata, and provider-specific tests.
Provider wire shapes must not leak into `Conversation` or specialist tests.

Provider notes:

- OpenAI chat completions: function tools, assistant `tool_calls`, one
  `role: 'tool'` message per result.
- Anthropic/Claude messages: `tool_use` and `tool_result` content blocks.
- AWS Bedrock Converse: `toolConfig.tools`, assistant `toolUse`, user
  `toolResult`, optional `cachePoint` blocks.
- OpenAI-compatible local servers use the OpenAI adapter when they support the
  same contract.
- LM Studio native no-reasoning path remains title-only.

Add/reuse provider conformance fixtures so every adapter proves the same
internal tool-turn contract.

## 12. Prompt caching

Static prefixes matter independently from in-process sessions.

Cache-aware provider support:

- Bedrock is the production cache-aware path; exact model IDs live in profiles.
- Nova Lite-family profiles, including Nova 2 Lite where configured, cache
  `system` and `messages`, not `tools`; 5-min sliding TTL; 1K min tokens; max 4
  checkpoints; explicit markers are needed for cost discount.
- Claude 4.5 family on Bedrock caches `system`, `messages`, and `tools`; 5-min
  or 1-hour TTL; 4K min tokens; max 4 checkpoints; explicit markers.
- OpenAI direct auto-caches stable prefixes without markers.
- LM Studio/local OpenAI-compatible servers have no caching.

Placement rules:

1. after static system content
2. at the stable-history/new-turn boundary for the orchestrator
3. after tools only when profile has `cache_in_tools`

Never place markers after ephemeral turn context or live GUI state. The Bedrock
adapter owns marker emission. Model profiles declare behavior capabilities:
`prompt_cache`, optional `cache_in_tools`, optional `cache_ttl_1h`. Conversation
and specialist code do not know about `cachePoint`.

Prompt-structure implications:

- put routing/task prose in cacheable system prompts, not long tool
  descriptions
- inline recipe schemas/rules/guidance in recipe specialist system prompts
- keep system prompts byte-identical across users
- use `llm.usage.cachedInputTokens` and `cacheWriteTokens` to validate cache
  placement

## 13. Observability and usage

The event bus is the observability backbone. Orchestrator, specialist, tool,
GUI, and LLM code emit structured events; logging, tracing, usage accounting,
metrics, and future inspection UIs subscribe.

Event convention:

- eager safe metadata in `summary`, `conversationId`, `turnId`, `spanId`,
  `provider`, `model`, `modelProfile`
- expensive log text as `message: () => string`
- full request/response body as `payload: () => object`
- `info` for lifecycle summaries
- `debug` for safe byte/token/count/status summaries
- `trace` for full prompts, payloads, tool args/results, GUI payloads, chunks,
  and raw provider responses

Boundary events:

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

`llm.usage` should include provider, model, model profile, role, specialist
kind, recipe type where relevant, context window, input/output tokens,
reasoning tokens where available, cached input/write tokens where available,
input/output/tool-schema bytes, duration, and success/failure attribution.

Aggregate usage per LLM call, specialist invocation, user turn, conversation,
role, specialist kind, recipe type, provider/model/profile, cache behavior, and
time window. This validates whether specialists reduce orchestrator prompt
cost, whether specialist calls add too much overhead, and which recipe types are
worth expanding.

## 14. Tool-loop safety

Foundation requirements:

- max tool-call rounds
- structured error envelope for unknown, invalid, failing, and repeated failing
  tool calls
- GUI request timeout/cancellation
- cancellation propagation through active tool work
- boundary request/response events
- `tool.invoke` tracing

Before writable tools/specialists:

- repeated failure bail-out
- validation-error retry limits
- no-repeat handling for identical failing tool calls

Before rollout/tuning:

- normalized token/cache usage logging
- byte/count fallbacks for providers without usage metadata
- optional stall handling for empty assistant responses

Add safety behavior by test and keep the same event/error contracts as the
active tool loop.

## 15. Phases

Phase 0: tool transport foundation.
Keep provider-neutral tool transport stable, product tools real, diagnostic
tools out of the production surface, GUI request/response scoped, structured
errors emitted, and provider-specific wire handling in adapter tests. Remaining
work includes adapter/common split, model-profile resolution, basic usage
events, boundary events, schema byte logging, and a real GUI request E2E when a
real action exists.

Phase 1: context and direct reads.
Add/finish `get_context()`, `recipe_list`, placeholder-free prompt handling,
and specialist-private projection for heavy `CLASSIFICATION` fields.

Phase 2: recipe specialist boundary.
Expose operation-level `describe_recipe`, `update_recipe`, `create_recipe`;
route internally by recipe type; move raw/projected recipe load behind private
recipe-specialist tools; prove `describe_recipe` without raw JSON reaching the
orchestrator.

Phase 3: specialist-private recipe patch.
Add per-type/operation model policy, private `recipe_load` with `modelHash`,
private `recipe_patch` with `baseModelHash`, GUI atomic apply, GUI-side full
candidate validation, shared `lib/js/recipes` validation for one recipe type,
usage attribution, and safe debug/trace events. Start with `MOSAIC` unless it
blocks for non-representative reasons; fallback candidates include `MASKING` or
`CCDC_SLICE`.

Phase 4: workflow specialist.
Return structured plans from broad user goals using workflow capability
summaries, examples, GUI context, selected project, open recipe summaries,
inventory, and recipe-specialist descriptions. Orchestrator executes the plan by
calling recipe specialists and direct tools.

Phase 4.5: Bedrock Converse and prompt caching.
After recipe mutation and workflow orchestration prove the architecture, add
Bedrock Converse adapter support, model-profile provider selection, tool
turn/result support, cache marker placement, cache capability flags, normalized
cache usage, and provider conformance tests. Do not pull this forward unless
provider support becomes a hard blocker.

Phase 5: map layout/visualization specialist.
Keep map bounds direct; add scoped layout/visualization reasoning, medium model
policy, and GUI hard confirmation for destructive layout changes.

Phase 6: roster expansion and tuning.
Expand recipe specialists only while measurements justify it. Track prompt
tokens, specialist tokens, orchestrator vs specialist cost, reasoning/cache
tokens, context utilization, provider/profile usage, round trips, tool failure
rate, `need_info` rate, patch size vs full save, and user-visible retries.

## 16. Decision gates

1. End Phase 0: provider boundary, tool parsing, GUI request/response, model
   profiles, usage events, boundary inspection, and tool-schema byte budget are
   stable.
2. End Phase 2: operation-level recipe tools keep raw recipe JSON out of the
   orchestrator at acceptable prompt cost.
3. Start Phase 3: chosen provider accepts the first recipe specialist prompt and
   private tool schemas; otherwise build projection/summary or choose a smaller
   first recipe type.
4. End Phase 3: atomic patching works, stale writes are rejected, validation
   failures are structured, and patch payload/tool failure rates justify
   continuing.
5. End Phase 4: workflow orchestration composes recipe operation tools, direct
   tools, and derived recipe descriptions without raw JSON leakage.
6. End Phase 4.5: Bedrock Converse passes shared provider conformance; cache
   placement is profile-driven; normalized usage exposes cache fields when
   available.
7. Roster expansion: stop when per-type gotchas/schema/projection cost exceeds
   observed user value.

## 17. Target file layout

Keep vertical ownership clear:

```text
modules/ai/src/chat/
  conversation/              # orchestration loop, messages, events, ws/user chat
  llm/                       # provider-neutral LLM port, profiles, adapters
  llmText/                   # static prompts and specialist prompt files
  specialists/               # specialist runners, scope, recipe operation routing
  tools/                     # product tools, private recipe tools, GUI bridge

lib/js/recipes/              # shared recipe knowledge/validation library

modules/gui/src/app/home/body/chat/
  ...                        # chat panel/hooks/reducer-facing UI

modules/gui/src/app/home/body/process/chatActions/
  ...                        # GUI authority for recipe/map/visualization actions
```

Provider adapters are siblings under `chat/llm/providers/`; adding Bedrock or
Claude must not change `Conversation` or specialist loops.

## 18. Open questions

- What is the stable public API of `lib/js/recipes`?
- What should `get_context()` return beyond compact turn context?
- Which provider schemas need LLM-compatible projection?
- Which model profile/policy settings are global, environment-specific,
  specialist-specific, recipe-type-specific, or operation-specific?
- Which usage fields require byte/count fallbacks by provider?
- Which event categories map to log4js categories for selective trace?
- How long should full trace payloads be retained outside normal logs?
- Should specialist text ever stream to the user?
- How much recent conversation history should the orchestrator pass to a
  specialist?

## 19. Non-goals

- Specialists calling other specialists.
- Persistent specialist sessions by default.
- Arbitrary Redux `get_state(slice)` access.
- Full MCP-over-WS protocol.
- Rewriting every recipe schema at once.
- Solving multi-AI-instance cross-tab sync.
- Replacing GUI as persistence authority.
- LLM-selected provider/model routing.
- Exact cross-provider cost accounting when providers expose different fields.
- Always-on full prompt/tool/recipe payload logging in normal deployments.

## 20. References

- `modules/ai/PRACTICES.md`
- `modules/ai/PUNCH_LIST.md`
- `modules/ai/archive/pre-rewrite-chat/src/recipes/`
- `modules/ai/archive/pre-rewrite-chat/src/mcp/tools/`
- RFC 6901: JSON Pointer
- RFC 6902: JSON Patch
