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

- Recipe operation specialists describe, create, or update one recipe type.
  They are the only actors that may see raw/effective recipe JSON or detailed
  recipe fragments.
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
- compact GUI context stored per subscription and injected as
  ephemeral turn context on the first LLM call of a user turn
- `Conversation` support for tool schemas, provider-normalized tool calls,
  tool results, max tool rounds, and `tool-start`/`tool-end`
- OpenAI-compatible tool-call adapter for structured tool traffic, including
  LM Studio-compatible chat completions; LM Studio native no-reasoning path is
  title-only
- product and specialist tools wired in `app.js`
- subscription-scoped GUI request/response with timeout, wrong-subscription
  rejection, and `subscriptionDown` cancellation
- GUI chat support for `context`, `tool-start`/`tool-end`, and `gui-action`
  responses
- shared recipe validation/projection in `lib/js/recipes`, consumed by both
  AI and GUI
- `describe_recipe` and `update_recipe` operation tools routed through
  recipe-type specialist prompts; `create_recipe` is still target design

The main architectural pressure is tool visibility: keep routing/metadata tools
at the orchestrator level, and move raw recipe inspection and mutation behind
recipe specialists.

Recipe update knowledge and closure design is tracked separately in
`DESIGN_recipe_update_knowledge.md`. That note covers the handle-based
picker/prepare/updater workflow, reusable operational recipe knowledge,
deterministic handle-keyed preparation, writable handle scope, pending-action
clarifications, and prompt-cache behavior.

## 3. Tool surface

Target always-visible orchestrator tools. Some are implemented, some remain
design targets:

```text
get_gui_context()
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

Raw/path-scoped `recipe_load` remains specialist-private for description and
inspection. Update specialists should not author raw JSON Patch. The live update
surface is handle-based: picker chooses handles, a deterministic prepare step
builds a handle-keyed packet, the updater calls `update_recipe_values`, and
deterministic code maps handles to internal patch operations. Other specialists
receive derived descriptions from recipe specialists, not raw recipe JSON.

Dispatcher-only bridge calls (not exposed to any LLM): `recipe-metadata`
returns identity-only `{id, type, name, projectId}` from `process.recipes`,
used by `describe_recipe` / `update_recipe` / `create_recipe` to resolve
`recipeId -> recipeType` for per-type prompt assembly without paying a
full `recipe_load` projection.

Budget:

- keep always-visible orchestrator tools in the low double digits
- target <= 15 KB provider-formatted tool schema/description bytes
- move tools with large recipe-domain prose, enums, or examples behind a
  specialist
- keep diagnostic/smoke tools out of the production surface
- track orchestrator system-prompt bytes/tokens separately from orchestrator
  tool-schema bytes/tokens; some production profiles cache system/messages but
  not tools
- do not use orchestrator tool descriptions as a place to store recipe-domain
  knowledge. Tool descriptions are dispatch contracts, not recipe manuals.

## 4. Specialist lifecycle

Inquiry operations, including `describe_recipe`, map explanation, and workflow
advice, are stateless. Follow-up continuity belongs to the orchestrator.

Action operations (`create_recipe`, `update_recipe`) may need one explicit
clarification before they can continue. The state is scoped to one conversation,
one user task, one selected recipe or new recipe draft, one recipe type, and one
operation. It exists so the system can resume a bounded operation after the
user answers a concrete question, without replaying the whole chat or adding
hidden context to the orchestrator prompt.

The specialist does not own the user conversation. It returns structured
outcomes:

```js
{status: 'updated', summary}
{status: 'created', recipeId, summary}
{status: 'clarification_needed', question, pendingAction}
{status: 'failed', reason, details}
```

The orchestrator and chat layer own the user-visible clarification. On
`clarification_needed`, the tool result carries direct user-facing text and a
pending-action record. The chat UI shows a question panel. If the user answers,
the system reruns the predetermined tool with the original instruction plus the
answer; if the user cancels, the pending action is cleared. The clarification
answer is not injected into the orchestrator conversation as hidden context.

Pending-action state is compact sidecar workflow state, not chat history:

```js
{
  id,
  purpose: 'update',
  toolName,
  toolInput,
  originalInstruction,
  question,
  recipeType,
  recipeId,
  createdAt
}
```

For v1, this state may be process-local if it is projected back to clients when
they select or reload the conversation in the same process. It closes on
success, failure, explicit user cancel, or conversation deletion. A time-based
expiry is not required for v1; durable sidecar storage should define retention
when pending actions need to survive restarts, worker failover, or non-sticky
load balancing.

Do not keep successful specialist history by default. It is likely stale after
recipe edits and makes routing harder to reason about. Prompt-prefix caching
still works because static specialist prompts and tool schemas remain
byte-identical across fresh invocations.

### Agent-loop north star

`runSpecialist$` and the orchestrator `conversationLoop` are both instances of
one domain idea: an agent loop advances a dialogue through LLM responses and
tool calls until a stop policy says the work is done. Do not force this into a
shared primitive until the vocabulary proves itself in active code. The first
refactor should make the specialist loop speak the clean vocabulary below; only
then check whether the orchestrator loop maps to the same shape without a pile
of policy conditionals.

Loop ports:

- LLM call: messages plus allowed tools -> model response
- tool invocation: execute one allowed tool call and return a neutral result
- event bus: diagnostics and span notifications
- sink/history: where visible text and durable dialogue state go

Loop domain:

- dialogue/timeline state
- round outcome classification
- stop policy
- round/stall/tool-call budget and guard
- structured result

Model each round with a closed outcome type:

```js
{type: 'answered', text, meta}
{type: 'tool-requested', text, calls, meta}
{type: 'silent', meta}
```

The stop policy reads the outcome plus the canonical tool timeline and returns
only:

```js
{type: 'continue', append?}
{type: 'stop', reason}
```

The loop owns dialogue well-formedness. A `continue` after `silent` uses the
append text as a transient prompt-only nudge because there is no assistant turn
to anchor a persisted user message. A `continue` after `answered` persists the
assistant text and then the corrective user nudge. Tool calls persist as an
assistant tool-call turn plus tool-result turns. The policy should not choose
transient vs persisted; that follows from the outcome.

Stop reasons are either loop-structural (`capped`, `guard-bailed`) or
policy-authored. For example, the update policy may return
`{type: 'stop', reason: 'silent-after-success'}` when a silent round follows a
successful `update_recipe_values` call. The generic loop must not know what
"success" means; it only carries the policy's reason in the result:

```js
{finalText, finishReason, timeline}
```

Caller-side wrappers still own tool contracts. `update_recipe` turns the loop
result into the orchestrator-facing envelope, publishes `update_recipe.outcome`,
and, for `silent-after-success`, may run a constrained tool-free summary call
from applied handle/value facts only. That facts-only narration belongs outside
the loop so the model cannot invent details from the broader specialist
dialogue. Likewise, tool-result shaping belongs in tool middleware, and update
outcome state should be a projection of the loop timeline rather than a second
tracker.

## 5. Recipe specialists

Recipe specialists are scoped by recipe type and purpose. This can share one
runner, but the prompt facts and private tools differ by operation:

```js
{purpose: 'describe' | 'update' | 'create', recipeType}
```

The orchestrator and workflow specialist choose the operation and recipe type
before entering a recipe specialist. An update specialist should not decide
whether MOSAIC is the right recipe type; it should update the already selected
MOSAIC recipe. A create specialist may ask for missing inputs needed to create
the chosen type, but recipe-type routing still belongs outside it.

Purpose-specific recipe facts:

- `selectionFacts`: for orchestrator/workflow recipe-type choice. Includes
  description, use cases, choose/dont-choose guidance, and outputs.
- `describeFacts`: for `describe_recipe`. Includes explanation/output facts
  needed to answer questions about a chosen recipe.
- `editFacts`: for `update_recipe`. Includes handle metadata, schema/rule/edit
  guidance, dependent fields, selector/applicability facts, and value guidance.
  It must not include routing prose.
- reusable operational facts: source data for generated manuals and future
  advice/troubleshooting prompts. These facts are topic-tagged and cover
  performance, rendering, quality/completeness, availability, and validation
  implications without being tied to one operation's prose. They should describe
  execution-shape cost drivers such as observation volume, spatial operations,
  collection reductions, extra passes, heavy per-item work, and availability
  risks instead of relying on shallow "more options is slower" heuristics.
- `createFacts`: future equivalent for `create_recipe`, covering required
  inputs, defaults, and creation-time dependencies.

Private tools by purpose:

- describe: `recipe_load` with optional JSON Pointer path, returning an
  effective projected model fragment plus `baseModelHash`.
- update target: `update_recipe_values` behind a handle-based picker/prepare
  workflow. Preparation returns current effective values, base hash, dependency
  facts, coupling/applicability facts, validation rules, and writable handle
  scope for selected handles. The updater sends handle-keyed values, not paths
  or JSON Patch operations.
- create target: load defaults/create closure plus a create primitive. Creation
  patches the recipe type's effective default model or submits an equivalent
  complete effective draft.

The specialist returns derived descriptions, edit/create summaries,
missing-information requests, or failure reasons. It should not pass raw recipe
JSON back unless a later design explicitly requires it.

## 6. Recipe create/update model

Recipe specialists should express update intent as handle-keyed values, not
JSON Patch operations or full recipe documents. Deterministic code maps handles
to internal paths, diffs against the current effective model, and applies the
generated patch through the GUI bridge. Creation may use the same handle flow
over defaults or submit an equivalent complete effective draft behind a
create-specific primitive.

Validation is layered:

- **AI tool boundary** validates the handle-value request: recipe id,
  workflow-managed write scope, known handles, and value envelope. It maps GUI
  failures into structured, handle-keyed tool errors.
- **GUI (recipe-patch handler)** is the authoritative validator on every call:
  applies the patch atomically to the effective model, runs full
  `spec.validate(toEffectiveModel(applied))` (schema **plus** cross-field
  rules), then persists. Server-side checks must never authorize the GUI to
  skip its own validation.

Internal patch contract:

- allowed ops: `add`, `remove`, `replace`, `move`, `copy`, optional `test`
- all-or-nothing apply
- GUI authoritative post-apply validation
- persistence through GUI as source of truth
- structured result with concise summary, invalidated handles, and new
  `modelHash` on success

Creation patches the recipe type's default model. Update patches the current
model snapshot. Specialist-authored complete recipe JSON is only a fallback for
small/immature recipe types.

Optimistic concurrency uses `baseModelHash`. The prepare step returns the
current GUI `modelHash` as `baseModelHash`; the workflow binds it into
`update_recipe_values` so the updater model does not supply it. Before
persistence, GUI compares `baseModelHash` to the current model hash. Mismatch
returns a structured `STALE_WRITE` error with `currentModelHash`; the updater
reports the conflict or the workflow reruns preparation in a later design.

`update_recipe_values` receives all intended handle values for one attempt and
applies them atomically. Dependent changes must land together. For example,
changing a MOSAIC target date may require changing `targetDate`, `seasonStart`,
and `seasonEnd` together so the post-apply model validates.

Preparation contract:

- Input: `{recipeId, handles}` where handles are selected by the picker from the
  static handle catalog.
- It does not receive the natural-language instruction and must not infer intent
  via keyword matching.
- Internally loads the current stored recipe, projects it through
  `toEffectiveModel`, expands deterministic dependency/coupling/applicability
  metadata for the supplied handles, and returns only what the updater needs.
- Output includes `baseModelHash`, `pickedHandles`, `dependentHandles`,
  `writableHandles`, `fields`, `dependencyFacts`, `couplingFacts`,
  `applicabilityFacts`, and `validationRules`.
- General raw/path `recipe_load` remains available to describe specialists and
  transitional inspection paths only.

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

Describe-time path loading should stay explicit: `recipe_load({recipeId,
path})`. Update-time relevance inference belongs in the picker using the
handle catalog, while deterministic dependency/coupling/applicability expansion
belongs in the programmatic prepare step. Path lookups are not pre-validated
against the schema. The
actual effective model is authoritative: paths may
legitimately exist in the model without being schema-declared (loosely typed
regions, optional fields, or legacy fields a newer schema does not formally
describe). A path lookup that hits nothing returns a clean absent signal.

## 7. Shared recipe validation

Validation authority belongs with the GUI write path. The GUI has the complete
current/default model, owns browser recipe state, and persists through the
correct gzip/envelope flow. Shared schema/rule code lives in
`lib/js/recipes/`, consumed via the `#recipes` import alias by AI Node services
and as the `recipes` package in the GUI Vite build — byte-identical across both
runtimes.

Split of responsibility:

- GUI imports validators and runs them against the post-apply effective
  model on every create/update — authoritative.
- AI tool boundary validates patch envelope shape: required
  fields, non-empty operation list, JSON Pointer strings, and
  operation-specific fields.
- Recipe specialists import purpose-specific facts, projections, defaults, and
  deterministic update/create closure metadata where practical.
- Specialists use that knowledge to ask questions and propose likely-valid
  patches; they are not final validation authority.

Archived schemas/rules are source material, not runtime dependencies. Bring
recipe packages back one at a time, through tests, and verify assumptions
against current recipe models and GUI save behavior before promoting them.

Package shape:

```text
lib/js/recipes/
  package.json       # ajv + ajv-formats only
  src/
    index.js         # registry + top-level conveniences
    validate.js      # createRecipeValidator
    <type>/
      index.js       # composes the spec
      schema.json
      defaults.js
      rules.js
      toEffectiveModel.js
      facts.js
      llmMetadata.js
      knowledge.js            # reusable operational facts
```

Per-spec exports (current MOSAIC shape):

```js
{
  id,
  name,
  description,
  schema,
  rules,
  defaultModel(),                  // returns effective shape
  toEffectiveModel(storedModel),   // pure, idempotent
  selectionFacts(),                // routing/workflow facts
  describeFacts(),                 // describe_recipe facts
  editFacts(),                     // update_recipe facts
  llmMetadata(),                   // generated/structured constraints
  knowledge(),                     // reusable operational facts
  handles(),                       // handle catalog for update_recipe
  updateManual(),                  // generated compact manual
  validate(model)                  // schema + rules; assumes effective input
  // createFacts()                 // future create_recipe facts
}
```

Registry-level conveniences in `lib/js/recipes/src/index.js`:
`listRecipeSpecs()`, `getRecipeSpec(id)`, `getRecipeSchema(id)`,
`getRecipeDefaults(id)`, `getRecipeSelectionFacts(id)`,
`getRecipeDescribeFacts(id)`, `getRecipeEditFacts(id)`,
`getRecipeLlmMetadata(id)`, `getRecipeUpdateManual(id)`, `getRecipeKnowledge(id)`,
`getRecipeHandles(id)`, `validateRecipe(id, model)`, `toEffectiveModel(id, model)`.

Bring recipe packages back one at a time. Each package needs focused tests for
defaults, schema acceptance, validation rules, effective projection, prompt
facts, closure metadata, and GUI rejection before persistence.

### LLM-facing model contract

The GUI persists a **stored** form of each recipe model that may carry
**dormant preferences** — sub-configuration fields the user previously set
but isn't currently using (tuning fields for cloud-masking methods not in
`includedCloudMasking`, `scenes` when `sceneSelectionOptions.type !== 'SELECT'`,
etc.).

LLM-facing code only ever sees the **effective shape**: dormant fields
projected out by `toEffectiveModel(model)`. Anything the LLM produces is
persisted as-is — no merge-back of dormant fields.

| Direction | Behavior |
|---|---|
| Recipe → LLM (load tools) | `toEffectiveModel(stored)` projects out dormant fields |
| LLM → Recipe (patch-apply) | LLM's effective output persisted directly; no re-merge |
| Normal GUI user flows | Untouched |
| Persisted recipes at rest | Untouched until an AI write touches them |

Invariants:

- `defaultModel()` returns an **effective** shape — the LLM's seed for
  `create_recipe`.
- `validate(model)` assumes the model is already in effective shape; stored
  models must be projected first.
- `toEffectiveModel` is **pure** (deep-clones) and **idempotent**
  (`proj(proj(m))` deep-equals `proj(m)`).

Trade-off: AI edits drop the user's previously-parked dormant preferences.
This is the deliberate choice over merging dormant fields back — the merge-
back path has scenarios where the LLM's explicit intent
(`includedCloudMasking: []`, "remove method X") gets silently undone, which
is worse than predictable cleanup.

## 8. Specialist prompts

Recipe specialist prompts are assembled mechanically from active recipe
knowledge, not hand-authored from scratch per type. Facts are split by
consumer purpose so routing prose does not leak into update prompts, and edit
guidance does not leak into describe prompts.

GUI translations and public docs are source material for authoring recipe facts,
not runtime prompt sources. The distilled structured metadata beside the recipe
spec is the prompt/tool source of truth.

Current fact shape:

```js
selectionFacts() -> {description, useCases, chooseWhen, dontChooseWhen, outputs}
describeFacts()  -> {description, outputs, ...explanationFacts}
editFacts()      -> {guidance, ...updateDependencies}
handles()        -> handle catalog with labels, descriptions, value guidance, couplings, applicability
updateManual()   -> legacy/generated compact update reference; not the live handle-update prompt surface
```

The describe specialist prompt is composed via
`assembleSpecialistPrompt(basePrompt, spec, {purpose: 'describe'})`: the static
base frame comes first for prompt-cache stability, then a delimited
type-specific section assembled from describe facts and value labels. Update is
different: it uses a generic updater prompt and receives recipe-specific
handles, field metadata, coupling facts, applicability facts, and validation
rules through the prepared handle packet. Selection facts are consumed by the
orchestrator/workflow layer before a recipe specialist is chosen. Full schema
dumps are a fallback/debug option, not the target update prompt shape.

Future additions should be purpose-specific:

- `createFacts()` for create specialists
- deterministic handle-preparation summaries
- reusable operational-fact renderings for troubleshooting/advice specialists
- schema/projection summaries only where a write-capable specialist needs them
- rule prose where JSON Schema alone does not communicate recipe semantics

JSON Schema alone cannot express all recipe semantics clearly enough for the
LLM. Rule prose is intentional.

Operational facts should use a shared vocabulary across recipe types where
possible. For example, `warning`, `memory`, `latency`, `observation-volume`,
`spatial-operation`, `collection-reduction`, `extra-pass`, `heavy-per-item`, and
`availability` are reusable concepts even when the concrete recipe fields differ.
This lets update, create, describe, and future troubleshooting specialists use
the same source facts without duplicating recipe-specific prose.

## 9. Workflow, map, and browse

Workflow specialist is planner/advisor only. It returns a structured plan with
assumptions, missing inputs, and steps. It receives user brief, compact GUI
context, selected project, open recipe summaries, relevant recipe inventory,
workflow capability summaries, examples, and recipe `selectionFacts` or
derived descriptions when workflow reasoning needs recipe-type awareness. It
never inspects raw recipe JSON and never calls recipe specialists itself.

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
3. Small ephemeral turn context: compact GUI state (section, open/selected
   recipe/app, map view),
   injected outside the system prompt and not persisted in Redis history.
4. On-demand tools: `get_gui_context()`, `recipe_list`, `describe_recipe`,
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
- subscription-local GUI context is keyed by `clientId:subscriptionId`
- outbound GUI requests target the subscription that initiated the turn
- `subscriptionDown` cancels pending requests for that subscription
- responses resolve only when both `requestId` and authenticated
  `clientId:subscriptionId` match
- late, unknown, or wrong-subscription responses are ignored
- subscription-independent work should be server/direct tools, not rebindable GUI
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
- OpenAI-compatible local servers, including LM Studio for structured chat
  completions, use the OpenAI adapter when they support the same contract.
- LM Studio native no-reasoning path remains title-only.

Add/reuse provider conformance fixtures so every adapter proves the same
internal tool-turn contract.

### Reasoning effort

`thinking` (`off|low|medium|high`) is **runtime-enforced, never prompt-instructed.**
An in-prompt limit ("use at most N thinking tokens") makes the model spend
reasoning on self-accounting — and it can't count its own tokens reliably — so
the mode stays qualitative and the model never sees a token number. Adapters
translate it to the target's native control:

| Target | Mechanism | Enforcement |
|---|---|---|
| Nova 2 (Bedrock) | `reasoningConfig {type, maxReasoningEffort: low/medium/high}` | graceful; unset `temperature`/`topP`/`maxTokens` at `high` |
| Claude (Bedrock) | `thinking {type: enabled, budget_tokens}` | graceful |
| OpenAI | `reasoning_effort: low/medium/high` | graceful, qualitative |
| LM Studio / Qwen | `enable_thinking` on/off only (native `/api/v1/chat`: `reasoning:'off'`; OpenAI path `chat_template_kwargs.enable_thinking`, flaky for Qwen3.5) | **no graceful budget — on/off + `max_tokens` floor** |

When the resolved model has no effort knob, the adapter logs info/warn once and
runs thinking-on with the `max_tokens` cap — no elaborate fallback. Qwen is
dev-only; a graceful reasoning budget is a production (Nova/Claude) capability.

**Over-think recovery.** `max_tokens` is a generous backstop, rarely hit. When a
call length-caps with no actionable output (reasoning consumed the budget before
a tool call or answer), the adapter makes **one reasoning-off completion pass
seeded with the captured reasoning**, asking the model to finish — reusing the
thinking instead of re-running it (the current length-cap retry re-reasons from
scratch), and, where reasoning-off takes effect, unable to re-cap. The reasoning
stays adapter-internal: only the final tool call/answer reaches the runtime.
Degrade to the stall/cap behaviour if the completion pass also fails (e.g. a
local model that ignores reasoning-off). Log every occurrence so the cap/effort
can be tuned empirically.

## 12. Prompt caching

Static prefixes matter independently from in-process sessions.

Cache-aware provider support:

- Bedrock is the production cache-aware path; exact model IDs live in profiles.
- Nova-family profiles, including Nova 2 Lite where configured, cache
  `system` and `messages`, not `tools`; 5-min sliding TTL; 1K min checkpoint;
  max 4 checkpoints; max 20K cached tokens for Nova prompt caching; explicit
  markers are needed for cost discount.
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
- inline purpose-specific recipe schemas/rules/guidance in recipe specialist
  system prompts
- keep system prompts byte-identical across users
- use `llm.usage.cachedInputTokens` and `cacheWriteTokens` to validate cache
  placement

Budget implications:

- specialist prompts are short-lived and narrow; the compact static
  specialist package should target Nova cache fit, roughly <= 18K tokens
  including base prompt and handle catalog/prepared-packet metadata
- the orchestrator is longer-lived and sees every always-visible tool schema on
  every round; keep its static system prompt cacheable and its tool surface
  independently small
- do not move recipe semantics from specialist prompts into orchestrator tool
  descriptions to chase cache fit
- Qwen/local development is acceptable while it pushes toward clearer compact
  artifacts; switch focus to Nova when Qwen pressure would require brittle
  routing, keyword matching, extra round trips, or recipe-specific hacks that
  would not be wanted in production

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

Model selection has separate dimensions:

- `role`: `orchestrator`, `specialist`, or `title`
- `specialist`: `recipe.describe`, `recipe.update`, `map`, future
  `recipe.create`, etc. when `role=specialist`
- `modelProfile`: logical tier such as `fast` or `smart`
- `thinking`: orthogonal reasoning mode such as `off`, `low`, `medium`, `high`
- resolved `provider` + `model`: the concrete Bedrock/OpenAI/local target

Profiles map to concrete provider/model config. Thinking remains separate so
we can compare "same profile, different thinking" and "same specialist, different
profile" without multiplying profile names.

`llm.usage` is the normalized per-call fact event. It should include:

```js
{
  type: 'llm.usage',
  conversationId,
  turnId,
  callId,
  role,
  specialist,        // optional
  recipeType,        // optional
  modelProfile,
  thinking,
  provider,
  model,
  contextWindowTokens,
  inputTokens,
  outputTokens,
  totalTokens,
  reasoningTokens,
  cachedInputTokens,
  cacheWriteTokens,
  usageExact,        // false when token counts are byte/count estimates
  cacheUsageExact,   // false when provider gives no cache usage
  inputBytes,
  messageBytes,
  toolSchemaBytes,
  contextUtilization,
  durationMs,
  success,
  errorCode
}
```

Providers that do not expose token usage still emit `llm.usage` with byte/count
fallback estimates and `usageExact=false`. Providers that do not expose prompt
cache usage set `cachedInputTokens=0`, `cacheWriteTokens=0`, and
`cacheUsageExact=false`; do not infer cache hits from repeated prompts unless a
future event marks the values as estimates.

Rollup events should aggregate all `llm.usage` calls caused by a user message
and by the full conversation:

```text
turn.usage
conversation.usage
```

Rollups should keep input/output/total tokens separate, include cache read/write
totals and ratios, exact-vs-estimated call counts, total duration, LLM-call
duration, call count, round count, tool-call count, stall/retry counts, max prompt
bytes/tokens, max context utilization, and breakdowns by role, specialist,
recipe type, model profile, thinking mode, provider/model, and cache behavior.

This validates whether specialists reduce orchestrator prompt cost, whether
specialist calls add too much overhead, which recipe types are worth expanding,
and what Bedrock model/profile/thinking choices cost in practice.

## 14. Tool-loop safety

Foundation requirements:

- max tool-call rounds
- structured error envelope for unknown, invalid, failing, and repeated failing
  tool calls
- GUI request timeout/cancellation
- cancellation propagation through active tool work
- boundary request/response events
- `tool.invoke` tracing

Writable tool safety requirements:

- repeated failure bail-out
- validation-error retry limits
- no-repeat handling for identical failing tool calls

Rollout/tuning requirements:

- normalized token/cache usage logging
- byte/count fallbacks for providers without usage metadata
- optional stall handling for empty assistant responses

Add safety behavior by test and keep the same event/error contracts as the
active tool loop.

## 15. Active design work

This document now tracks architecture and contracts, not a completed
implementation checklist. Current unresolved design work:

- Expand reusable operational recipe knowledge so handle catalogs, prepared
  packets, and future advice/troubleshooting specialists can reason about
  performance, rendering risk, quality tradeoffs, and validation implications
  from the same source facts.
- Continue hardening the handle-based update workflow: picker handle selection,
  deterministic preparation, `update_recipe_values` scope enforcement, GUI
  authoritative persistence/validation, and handle-keyed errors/summaries.
- Harden pending-action support for create/update clarifications: process-local
  v1 state is acceptable, but select/reload discovery and later durable
  conversation sidecar storage are required before production scale.
- Add `create_recipe` with a separate create specialist prompt/tool surface and
  purpose-specific create facts.
- Keep broad workflow planning separate from recipe update/create execution;
  workflow uses selection facts and derived summaries, not raw recipe JSON.
- Expand recipe types only when the shared schema/rules/effective projection
  and prompt facts are tested for that type.

Measure prompt tokens, specialist tokens, orchestrator vs specialist cost,
reasoning/cache tokens, context utilization, provider/profile usage, round
trips, tool failure rate, clarification-needed rate, changed-handle/internal
patch size vs full save, and user-visible retries.

## 16. Target file layout

Keep vertical ownership clear:

```text
modules/ai/src/chat/
  conversation/              # orchestration loop, messages, events, ws/user chat
  llm/                       # provider-neutral LLM port, profiles, adapters
  llmText/                   # static prompts and specialist prompt files
  specialists/               # specialist runners, scope, recipe operation routing
  tools/                     # product tools, private recipe tools, GUI bridge

lib/js/recipes/              # shared recipe knowledge/validation library
                             # (imported via #recipes from both AI + GUI)

modules/gui/src/app/home/body/chat/
  ...                        # chat panel/hooks/reducer-facing UI

modules/gui/src/app/home/body/process/chatActions/
  ...                        # GUI authority for recipe/map/visualization actions
```

Provider adapters are siblings under `chat/llm/providers/`; adding Bedrock or
Claude must not change `Conversation` or specialist loops.

## 17. Open questions

- Which operational-fact shape should each recipe spec expose to support handle
  catalogs, prepared packets, and advice/troubleshooting prompts without
  duplicating prose?
- Which update dependencies can be derived mechanically from schema/rules, and
  which need hand-authored recipe knowledge?
- What `createFacts()` shape is needed before `create_recipe` lands?
- What should `get_gui_context()` return beyond compact turn context?
- Which provider schemas need LLM-compatible projection?
- Which model profile/policy settings are global, environment-specific,
  specialist-specific, recipe-type-specific, or operation-specific?
- Which usage fields require byte/count fallbacks by provider?
- Which event categories map to log4js categories for selective trace?
- How long should full trace payloads be retained outside normal logs?
- Should specialist text ever stream to the user?
- How much recent conversation history should the orchestrator pass to a
  specialist?

## 18. Non-goals

- Specialists calling other specialists.
- Durable specialist sessions that outlive one user task.
- Arbitrary Redux `get_state(slice)` access.
- Full MCP-over-WS protocol.
- Rewriting every recipe schema at once.
- Solving multi-AI-instance cross-tab sync.
- Replacing GUI as persistence authority.
- LLM-selected provider/model routing.
- Exact cross-provider cost accounting when providers expose different fields.
- Always-on full prompt/tool/recipe payload logging in normal deployments.

## 19. References

- `modules/ai/PRACTICES.md`
- `modules/ai/PUNCH_LIST.md`
- `modules/ai/archive/pre-rewrite-chat/src/recipes/`
- `modules/ai/archive/pre-rewrite-chat/src/mcp/tools/`
- RFC 6901: JSON Pointer
- RFC 6902: JSON Patch
