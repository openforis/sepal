# GUI source runtime

Design proposal for exposing source resolution to GUI consumers without making recipe components own Redux,
dependency catalogues, loading or cache policy. This is a browser integration boundary around the pure shared
contracts; it is not a second source resolver.

## Purpose

Recipe consumers need progressively richer answers about a selected source:

- Retrieve needs ordered bands and per-band export requirements;
- Preview and map layers need a current output description and invalidation signal;
- input panels need to validate saved selections against current bands;
- Change Alerts and similar consumers need named capabilities rather than recipe-type lists;
- candidate selectors need to distinguish `SUPPORTED`, `UNSUPPORTED` and `NEEDS_EVIDENCE` recipe instances;
- future live resolution must complete missing dependency closures under the caller's authorization.

These consumers must not receive `loadedRecipes`, inspect Redux, traverse dependency graphs or know how missing
recipes are loaded. Exposing those mechanisms would make the current session cache part of every consumer's API and
would require another migration when caller-authorized loading and the source catalogue arrive.

The GUI therefore exposes one stable source-runtime service through React context. Consumers ask it questions or
start operations. The service adapts the GUI environment to the shared resolver and observer.

## Decision summary

- Context exposes one stable `sourceRuntime` service, never catalogue data or operation state.
- `resolveImageOutput$({recipe})` is a cold, one-shot Observable with one completion and one cancellation mechanism.
- The runtime receives a lazy Redux environment adapter. It reads current state only while an operation or watcher
  is subscribed; Redux changes do no source-runtime work otherwise.
- Each subscription uses the exact passed root recipe, one captured dependency-catalogue seed, an operation-local
  completed closure and a private session-invalidation signal.
- Recipe actions remain pure; consumers pass command inputs explicitly rather than reading back state they just
  wrote.
- Retrieve has exactly one output authority: a resolved description or an explicitly permitted fallback policy.
- Browser descriptions are interactive evidence. They authorize task policy only for an explicitly reviewed
  declaration whose policy is stable across dependency-version drift.
- Graph work and Earth Engine requests occur only for subscribed operations, never merely because Redux changed.
- The current one-shot operation retains no result after completion. Future shared reuse belongs to a generic,
  versioned runtime resource, not to Retrieve panels or individual recipe implementations.
- Future loading, freshness, shared resources and capability discovery extend the runtime without changing recipe
  components.

## Boundaries

### Shared contracts

The shared recipe modules own canonical references, dependency edges, graph traversal, output transformations,
capability resolution and diagnostics. They do not import React, Redux, GUI APIs or authentication state.

### GUI source runtime

The source runtime owns browser-specific access to:

- the current in-session recipe catalogue;
- operation-scoped completion of missing recipe dependencies through an authenticated loader;
- Earth Engine observation APIs;
- future server-side closure and bundle loading;
- future source-description cache and refresh policy;
- the linked Earth Engine identity needed to scope observations.

It supplies these dependencies to the shared contracts. It does not own recipe-specific forms, task payloads,
notifications, fallback policy or presentation.

### Consumers

A consumer owns the requirement it is trying to satisfy and the user action that follows. Retrieve decides whether
to submit or block. A source selector declares the capability it requires. A map decides how to represent loading
or stale state. None of them knows where recipes came from.

### Execution boundary

Browser resolution is preflight and interactive evidence. A future Retrieve submission is accepted against a
server-built coherent execution bundle under the caller's authorization. A browser description must never become
a substitute for backend validation or task atomicity.

## Context shape

Use a dedicated `SourceRuntimeContext` owned by Process, wrapping it inside its retained `Section`. Do not add these
operations to the existing recipe context: that context locates one recipe in GUI state, while source resolution
spans a graph and has session-level cache and authorization concerns. `Section` keeps Process mounted once
activated, so a detached operation survives panel and route navigation without scoping the runtime over Terminal,
Browse, Tasks or other Home services that have no source-resolution concern.

The context exposes one stable service object. Initially it needs only the operation already supported by the
shared contracts:

```js
sourceRuntime.resolveImageOutput$({recipe}) // returns a cold Observable
```

`resolveImageOutput$` is deliberately distinct from the pure synchronous `resolveImageOutput` in the shared
library: the GUI operation observes runtime evidence asynchronously.

The returned Observable has this contract:

- `recipe` is the exact outer recipe being edited, including unsaved model changes;
- the passed root wins over any older catalogue record with the same ID;
- the execution reference remains that outer recipe;
- dependency records, dependency loading and asset observations are runtime-owned inputs, not call arguments;
- each subscription synchronously captures one atomic runtime-environment snapshot and starts independent work;
- it may emit `LOADING`, then emits exactly one terminal `READY`, `UNAVAILABLE` or `INVALID`;
- it completes immediately after the terminal envelope;
- it never uses the Observable error channel: observation and unexpected runtime failures emit `UNAVAILABLE` with
  the original error, while resolution diagnostics decide between `UNAVAILABLE` and `INVALID`;
- unsubscription is the only cancellation mechanism.

`LOADING` is optional. A graph with definitive diagnostics can resolve synchronously without starting an
observation. Future authorized loading remains part of `LOADING`; it does not require a public zero-duration
`PENDING` state. The committed shared observer may retain `PENDING` internally without exposing it from this
one-shot boundary.

Two subscriptions to the same returned Observable are two independent operations and may capture different
catalogue states. One-shot command consumers normally subscribe once. Live watching will use a separate explicitly
shared contract rather than changing these semantics later.

The service returns diagnostics unchanged. It does not translate, notify, log, retry or select a legacy fallback.
Those decisions belong to the consumer that understands the operation being attempted.

## Runtime environment

On subscription, one-shot resolution captures the environment that seeds its evidence,
conceptually:

```js
{
    catalogue,
    earthEngineGeneration
}
```

`earthEngineGeneration` is opaque and non-persisted. It must never expose credentials through context, logs,
diagnostics or cache keys. Do not use the Google project ID as proof of Earth Engine account identity, and do not
introduce a generic environment contract-version field. Future resource keys use only the specific adapter,
composer, measurement or schema versions that actually affect their answer.

There is deliberately no second lifetime token. A constant per-runtime value could not change during an operation,
and runtime-scope closure already reports that the owning scope ended. `earthEngineGeneration` is selected through
the Redux environment because the linked Google credentials can change while Process remains mounted.

A catalogue replacement affects subscriptions started afterward. An existing one-shot operation uses the
catalogue snapshot it captured as its seed and adds any records it loads to an operation-local map, so one
resolution never combines records from different GUI states. The exact root recipe remains the caller's argument
even when the catalogue contains an older record with the same ID. Loaded records never overwrite that root or a
record already captured from the editing session, and they are not written back to Redux.

An Earth Engine credential-container change is different: unresolved one-shot operations and live watchers using
the old identity become `UNAVAILABLE` and cannot trigger submission. Already accepted tasks are unaffected.

Identity invalidation is runtime unavailability, not evidence that a recipe is invalid. It therefore uses an error
rather than a source diagnostic:

```js
{
    status: 'UNAVAILABLE',
    description: null,
    diagnostics: [],
    error: sourceRuntimeError('SOURCE_IDENTITY_CHANGED')
}
```

The error code makes the reason explicit and keeps these outside a diagnostic-based migration fallback without
relying on the incidental behavior of `every([])`. Consumers may log the error and present a safe generic message;
they must not expose its raw text.

Snapshot and invalidation are deliberately asymmetric. The catalogue is captured once and never reread. The same
lazy environment subscription remains active only to detect a change to the captured Earth Engine generation; a
catalogue-only Redux change publishes nothing. An invalidation envelope still carries the catalogue as it is at
that moment, for a stable shape, and the runtime ignores it. A credential change before subscription is simply
part of the new snapshot; a change after subscription invalidates that operation.

The initial Earth Engine value is a private generation derived from replacement of the `googleTokens` credential
container. It is an invalidation epoch, not an account identity, and the runtime must never retain, compare, log or
publish credential values. This may conservatively invalidate an operation when refreshed credentials replace the
container without changing account. That failure is safe and retryable, but its frequency must be measured; the
authentication owner should eventually supply an explicit session epoch if routine refresh makes over-invalidation
material.

Ending the provider's owning Process scope is also an invalidation event. It emits `UNAVAILABLE` with error code
`SOURCE_RUNTIME_UNAVAILABLE` to unresolved operations and completes them. This is not a second public cancellation
mechanism: consumers still cancel only by unsubscribing, while provider teardown reports that the environment in
which detached work was running no longer exists.

## One-shot and live semantics

Do not later change `resolveImageOutput$()` from a one-shot operation into a live subscription. The two lifecycles
serve different consumers and should remain explicit:

```js
sourceRuntime.resolveImageOutput$({recipe})
sourceRuntime.watchSource$({source, expectation})
sourceRuntime.querySources$({expectation, scope})
```

The latter two are future shapes, not APIs to implement now:

- `resolveImageOutput$` captures evidence for one command such as Retrieve;
- `watchSource$` follows catalogue refresh and dependency changes for an active map or panel;
- `querySources$` supports capability-based candidate discovery over an authorized scope.

All can eventually share one catalogue internally. Keeping their semantics separate prevents a Retrieve decision
from changing underneath submission and prevents a live panel from taking repeated one-shot snapshots itself.

The current implementation deliberately repeats closure completion and band observation when a Retrieve panel is
closed and reopened. Do not hide that latency with a panel-local or Masking-specific cache: neither a recipe ID nor
an asset ID proves that the source still has the same content. The first reusable result must be owned by the source
runtime's future versioned-resource layer described in
[Source freshness, caching and invalidation](source-freshness.md).

## React and rerender contract

Process owns the provider: it wraps Process at its exported boundary, not a recipe, panel, tab or map layer, and
not Body, Home or App. One retained Process instance has one GUI source runtime. `Section` keeps Process mounted
once activated, and that retention is intentionally what lets a detached Retrieve preflight survive panel closure
and route navigation while still receiving credential invalidation. Process teardown closes the runtime. Browse,
Terminal, Tasks and other Home services stay outside it, having no source-resolution concern.

The context value must remain referentially stable for the provider's lifetime. In particular, it must not contain:

- `loadedRecipes`;
- a source description or observer state;
- a function recreated whenever Redux changes;
- a per-request subscription.

Create the public service once from the injected Redux store, a lazy environment adapter and the Earth Engine
observation boundary. Only the service belongs in context:

```js
const store = useStore()
const [runtime] = useState(() => {
    const environment = createReduxSourceEnvironment({store})
    return {
        sourceRuntime: createSourceRuntime({environment$: environment.environment$}),
        close: environment.close
    }
})

useEffect(() => () => runtime.close(), [runtime])

return (
    <SourceRuntimeContext.Provider value={runtime.sourceRuntime}>
        {children}
    </SourceRuntimeContext.Provider>
)
```

The shown names are illustrative; the ownership is the contract. `createReduxSourceEnvironment` is the only Redux
adapter. Its `environment$` is cold and uses the injected store from `useStore()`, not the singleton `select()` or
`subscribe()` helpers from `store.js`. On subscription it synchronously reads one atomic environment and then
subscribes only for session-generation changes. Redux invokes store subscribers synchronously during dispatch, so
an operation subscribed immediately after dispatch sees the updated catalogue without waiting for a React render
or effect.

The environment adapter does not remain subscribed merely because the provider exists. With no active operation
or future watcher, a Redux action performs no source-runtime work. For an active one-shot operation, catalogue
changes are ignored after its initial snapshot; only session invalidation is observed. The adapter must compare
selected fields rather than wrapper-object identity.

Provider teardown closes the private environment. Outstanding operations then receive the controlled runtime-
unavailable terminal envelope before the adapter releases its Redux subscription. This remains necessary even
though logout currently forces a full page reset: operation lifetime must be explicit rather than rely on browser
navigation winning a race.

The context value stays referentially stable and catalogue updates do not rerender its consumers. Per-source
updates are published through operation Observables or, later, keyed live selectors. No React bridge, mutable
environment sink or environment-publication effect is required.

### Performance invariants

- With no active operation or watcher, Redux actions perform no source-runtime work.
- An active operation performs only constant-time environment selection and session comparison on a Redux change;
  dependency requests are driven by that operation, not by Redux updates.
- No catalogue object is cloned merely to update the runtime.
- Graph construction and Earth Engine observation happen only when an operation is subscribed or a future live
  watcher is active.
- The shared resolver retains its per-operation dependency and observation deduplication.
- Independent subscriptions deliberately do not share one-shot work. Future live watching owns caching and
  multicasting explicitly.
- There is one provider per retained Process instance, not one per recipe, panel or map layer.

## Retrieve integration

Retrieve remains a consumer of source resolution rather than a method on the source runtime.

The Masking flow should be:

1. The panel has the current outer recipe and receives the stable source runtime from context.
2. The recipe action dispatches only its ordinary Redux update for the submitted Retrieve options.
3. The Retrieve orchestrator receives:

```js
submitObservedRetrieve({
    recipe,
    retrieveOptions,
    taskConfig,
    fallbackPyramidingPolicy,
    resolveImageOutput$
})
```

4. The orchestrator starts `resolveImageOutput$({recipe})`, then submits with the resolved description, takes an
   explicitly allowed migration fallback, or blocks with a safe notification.
5. It never reads the updated recipe back from Redux. `retrieveOptions` remains explicit even though the action
   just persisted the same value; removing that apparent duplication would reintroduce a timing dependency.

The source runtime does not know about Retrieve options, task destinations, legacy pyramiding policy, analytics or
notifications. Conversely, Masking does not receive the catalogue and does not inspect the primary recipe's type.

Masking's adapter is the first migration adapter, not the template for permanent per-recipe orchestration. Keep it
minimal, and use the next migrated recipe to decide whether the repeated command wiring warrants a shared factory.

### Browser evidence and task authority

The initial catalogue is `process.loadedRecipes`, which is a reference-counted editing cache, not an execution
catalogue. Records disappear when their last recipe consumer unmounts and may contain unsaved dependency edits.
Task receives the exact submitted outer recipe, but nested `RECIPE_REF` dependencies are loaded later from persisted
storage. Browser preflight and Task can therefore resolve different dependency versions even when the browser
closure is complete. Automatic saving narrows that interval but does not remove it: saving is asynchronous and
Retrieve does not await dependency persistence.

This limits what a browser description may authorize. A recipe declaration may join the observed Retrieve path
only when the export requirement for a given band name is invariant across every dependency version Task could
load. CCDC qualifies for the initial cohort because every observed CCDC band requires `sample`, independent of its
model and band name. Masking qualifies only when its source qualifies, because it preserves that declared
requirement. A transformation whose policy depends on dependency model values does not qualify and must wait for
coherent server resolution.

This is a bounded coexistence rule, not a claim that the browser graph is the execution graph. A changed persisted
dependency can still produce a different schema and make Task fail. Selected-band validation catches disagreement
between the current selection and the browser description; it cannot detect later dependency drift in Task. The
policy-stability gate prevents the more dangerous case where the same band name is submitted with a policy derived
from a different dependency version.

An incomplete closure is not resolved evidence. The runtime first attempts to complete the closure through its
authenticated recipe loader. `MISSING_SOURCE` after that attempt must block the initial Masking activation: the
missing source could be CCDC, and applying Masking's legacy `mean` fallback would reproduce the array-pyramiding
defect this path is intended to prevent. Fallback may remain only for a separately reviewed coexistence gap whose
legacy policy is independently known to be safe. Earth Engine does not report an asset's persisted policy, but
verified physical array dimensionality is enough to derive `sample` without recognizing CCDC:
every array-valued band receives `sample`, while a scalar band's physical schema resolves without inventing a
policy. A mixed asset therefore retains its complete observed schema. The selected operation decides whether the
remaining policy gap matters: Earth Engine asset export requires a policy for every selected band, while Drive and
SEPAL require selected bands to be scalar and do not consume pyramiding policy. Fallback must never be described as
resolved output. Caller-authorized loading and coherent bundles eventually remove the remaining catalogue gaps.

`taskConfig` contains ordinary configuration used on both paths. It must reject `pyramidingPolicy`,
`imageOutputDescription` and `customizeImage`. `submitObservedRetrieve` performs this validation; the generic
submitter must continue accepting these options from unmigrated callers during coexistence. The orchestrator alone
adds one output authority:

```js
{imageOutputDescription}
```

or, only for an explicitly permitted migration gap:

```js
{pyramidingPolicy: fallbackPyramidingPolicy}
```

`customizeImage` is also excluded because the generic submitter runs it after deriving the resolved policy. Existing
customizers can replace the selected bands, remove the policy or return a different image configuration, producing
a policy for one schema and submitting another. A migrated recipe must express its final selection through
`retrieveOptions` or another structured input that is applied before policy derivation and validated against the
description. Do not grant an unrestricted callback authority over an already-resolved image.

The resolved description also controls destination compatibility. When the explicit selection contains any
array-valued band, or an empty selection includes one by meaning all bands, only `GEE` is valid. The Retrieve panel
must remove or disable Drive and SEPAL before submission; if the user has no linked Google account, the form has no
valid destination and remains blocked. The orchestrator or generic submitter still rejects an incompatible explicit
destination so stale form state and non-panel callers cannot bypass the rule. It must not silently drop array bands
or flatten them merely to satisfy a destination.

Resolution may take several seconds, especially when a panel has just mounted and must observe asset band types.
While the output is unresolved, disable the destination selector as one control and disable Apply, but preserve its
current value. Do not disable individual options during this state: the form widget can clear a selected disabled
option before compatibility is known. After `READY`, enable the selector, disable only incompatible destinations
and reconcile an incompatible selected value once. `UNAVAILABLE` and `INVALID` leave the selector and Apply
disabled. Asset-destination ID validation is independent work; source resolution must neither wait for it nor use
its completion as a rerender trigger.

Extend the generic task submitter compatibly rather than changing all existing callers:

```js
export const submitRetrieveRecipeTask = (recipe, {
    retrieveOptions = recipe.ui.retrieveOptions,
    ...taskConfig
} = {}) => {
    // Existing task construction, using `retrieveOptions` throughout.
}
```

The selected local `retrieveOptions` must supply all four existing uses: destination, bands, properties spread into
the submitted image and `getTaskInfo({retrieveOptions})`. Mixing explicit and recipe-stored options could submit a
task whose destination, bands and output path disagree.

The orchestrator owns the one-shot subscription until it completes. Closing the action panel or navigating away
from Process does not cancel preflight, and a later global notification is acceptable. An Earth Engine credential
change instead terminates old-identity work as `UNAVAILABLE`. Completion and unsubscription release the
operation without a second manual teardown path.

Transport errors are sanitized through the shared user-error mechanism before notification; raw errors and
diagnostics remain available to logging. The source runtime owns neither mechanism nor presentation. Reconsider a
shared operation-notification helper only when another consumer demonstrates duplicated policy.

This flow uses neither an action-builder side effect nor an ambient singleton-store read. Recipe actions remain
pure Redux updates, and the only store access is the injected lazy environment adapter described above.

## Roadmap evolution

### Runtime image output

The first implementation adapts the existing loaded-recipe cache, the existing authenticated per-recipe read and
the image-band observation boundaries to the committed shared image-output observer. Recipe observations need
ordered names for their declarations; asset observations additionally retain verified array dimensionality so the
shared contract can derive `sample` without a recipe-type branch. It does not persist descriptions or loaded
closure records. The completed operation-local graph supplies interactive evidence only; it is not presented as a
coherent execution catalogue. Closure members that cannot be loaded remain controlled `UNAVAILABLE` results and
block the initial Masking activation.

### Temporary browser closure loading

The current server has no endpoint that returns a complete dependency closure. The browser therefore hides its
temporary transport behind a batch-shaped operation boundary:

```js
completeRecipeClosure$({rootRecipe, seedRecipesById, loadRecipesById$})
loadRecipesById$({ids})
```

`completeRecipeClosure$` repeatedly builds the shared dependency graph. If it has any definitive diagnostic, such
as a cycle or malformed direct-source declaration, the operation stops without loading unrelated records. If its
only diagnostics are `MISSING_SOURCE`, their dependency-path tails identify one deduplicated frontier of known
recipe IDs. The loader fetches that frontier and rebuilds the graph. The current `loadRecipesById$` adapter fans a
frontier out over the existing authenticated `api.recipe.load$(id)` operation with bounded concurrency.
Consequently, the temporary implementation needs at most one logical request batch per discovered graph depth; it
does not pretend that the browser knows transitive IDs before reading their parents.

The shared graph builder remains the sole authority for edges, dependency paths and direct or indirect cycles.
The loader must not recursively walk newly returned models on its own. Diamond references are requested once, a
cycle terminates with the graph's existing cycle diagnostic, and each round makes monotonic progress in one
operation-local map. The operation must enforce explicit depth, node-count, serialized-byte, round and in-flight
request limits with controlled failures. Their numeric values are selected from measured recipe graphs before the
loader turns green, not guessed in this document.

The exact unsaved root and records captured from the editing session take precedence over loaded persisted
records. A response must contain at most one record for each requested ID, must not contain unrequested records and
must identify every returned record by the requested ID. Missing, forbidden or malformed results fail closed.
Unsubscription, runtime closure and Earth Engine identity invalidation tear down outstanding recipe loads as well
as band observations. No loaded record is dispatched to Redux, so closure completion causes no React rerender and
cannot change another operation's snapshot.

This is a bounded browser-preflight adapter, not the permanent live-resolution or execution-authority boundary. It
adds no Groovy endpoint, uses no administrator recipe access and cannot make the browser graph coherent with the
persisted graph Task later reads. Its batch-shaped seam is deliberate: after the Node server replacement,
`loadRecipesById$` can become one authorized batch call, or `completeRecipeClosure$` can become one root-oriented
server closure call, without changing `sourceRuntime.resolveImageOutput$({recipe})` or any recipe consumer.

### Apply-mask stabilization

Preview, map and Retrieve can consume the same resolved output while keeping distinct operation lifecycles. Date
range and source visualizations can be added to a source description without adding Masking-specific context
methods or another source traversal. Inherited source visualizations are evidence; locally edited visualization
state, applicability and final export filtering remain owned by their consumers.

### Fill operations

Constant Fill requires no new source lookup. Direct asset Fill can reuse asset observation through the source
runtime. Recipe Fill remains blocked until the permanent caller-authorized source boundary exists; the temporary
preflight loader is not approval to activate another consumer. No context API change is required when that boundary
is introduced.

### Capabilities and candidate discovery

`CCDC_SEGMENTS` and later capabilities extend the shared resolved description. Consumers submit an
operation-specific requirement containing only the structural, adapter or capability constraints that operation
actually needs, plus cardinality and saved selections. Validation distinguishes a valid source plan from a
`SUPPORTED`, `UNSUPPORTED` or `NEEDS_EVIDENCE` consumer answer. `querySources$` can then return those answers without
enumerating recipe types or persisting an effective type.

The query may combine runtime and requirement results for presentation, but the shared validator keeps them
separate. A transport or authorization failure remains runtime `UNAVAILABLE`; it is never relabelled as
`NEEDS_EVIDENCE` or product incompatibility.

A future persisted recipe index may narrow candidate IDs efficiently. It is discovery evidence, not the final
compatibility answer: dynamic wrappers such as Masking and Stack still require current instance resolution. The
source-runtime API does not assume whether candidates came from Redux, a JSONB query or another index.

### Caller-authorized loading and freshness

The temporary browser loader uses the current authenticated per-recipe read only for operation-local preflight.
After the Node server replacement, the runtime can replace it with an authorization-scoped batch or complete-
closure loader and key cached descriptions by principal, linked Earth Engine identity and an actual versioned
contract. Existing consumers do not change because loading remains behind the service.

Live consumers use `watchSource$`; one-shot commands continue to use a captured resolution. Cache entries publish
description, fingerprint, freshness and availability without putting that state into React context.

Shared reuse is a generic derived-resource concern. Image-output descriptions, visualization applicability and
Sampling Design stratum-area and per-stratum-probability resources should use the same source-version registry and
invalidation machinery rather than create per-feature caches. The logical resource key describes the question; its
source-version vector decides when to resolve evidence again, while the resulting operation-input fingerprint
decides whether an existing answer is reusable. Recipe components continue to pass source intent and consume results
without receiving Redux records, websocket events, revisions or cache controls.

The intended version evidence is:

- exact in-session recipe object identity, or an operation-local draft generation, for the editable root's unsaved
  edits;
- a server-owned monotonic `contentRevision` for persisted recipe update ordering and invalidation;
- an Earth Engine asset ID plus `system:version`, normalized as an opaque string, when that property is available;
- principal, linked Earth Engine identity and contract version where they affect the answer.

The current second-resolution recipe timestamp is display metadata, never a revision and never freshness evidence.
A source without reliable persisted version evidence is observed afresh rather than cached as though it were stable.
The snapshot-provider boundary states whether it is handing over an editable root draft or an operation-local
persisted snapshot; a persisted derived calculation binds to the latter, and dependency snapshots are never written
into the shared loaded-recipe map. The detailed version, replay, retention and websocket rules are owned by
`source-freshness.md`.

### Coherent Preview and Retrieve

The browser runtime can preflight expectations and display current evidence. Preview and Retrieve later call the
server's explicit live or bundled resolution boundary. The accepted Retrieve task stores its coherent bundle;
browser cache state and browser-planned source commands are never treated as the frozen execution graph. The trusted
boundary discovers and binds commands from the authorized bundle, or validates a server-built frozen plan, under an
explicit supported contract version.

## Alternatives not selected

### Passing `loadedRecipes` through recipe components

This is explicit but gives every consumer ownership of an implementation detail. It spreads broad catalogue props,
encourages local traversal and makes caller-authorized loading a breaking API change.

### Reading the singleton store in a service

This hides the dependency rather than removing it, is difficult to isolate in tests and binds a reusable command to
one global store instance. Reading Redux after `dispatch()` returns is legal; the rejected part is ambient access
from the command. The lazy environment adapter uses the injected store openly at the integration boundary.

### Action-builder side effects

These run from reducer evaluation. Starting observation, reading state or submitting work there violates reducer
purity and makes ordering depend on implementation details of the action builder.

### A Retrieve command in context

This would solve one call but couple source resolution to task submission. Maps, capability selectors and
validation would need parallel context methods or another service. The context instead exposes the shared runtime
capability that Retrieve consumes.

### Redux middleware now

Effect middleware could dispatch a command and read state after the reducer, but it introduces a global command
protocol for one migration slice and still makes resolution state access implicit. It can be reconsidered if SEPAL
adopts a general effect architecture; the source-runtime service remains usable from such middleware.

### Putting catalogue entries in context

Any context value containing the catalogue or resolved descriptions changes identity frequently and rerenders all
consumers. Context provides stable operations; keyed observables or selectors provide changing data.

### Updating the runtime through React props

A component selected from Redux could publish the catalogue from `useLayoutEffect`, but a command invoked
synchronously after dispatch would still see the previous committed render. A direct subscription in the private
environment adapter preserves Redux ordering without rerendering the provider or consumers, and exists only while
an operation or watcher needs it.

### Returning `{state$, cancel}`

Two teardown mechanisms can drift, and replaying a synchronous terminal state makes manual self-unsubscription easy
to implement incorrectly. A cold Observable gives one lifecycle: subscribe to start, unsubscribe to cancel, and
terminal completion releases the work.

## Verification

Pure shared tests continue to own traversal, transformations, resolution and diagnostics. Focused GUI tests should
prove only runtime-owned behavior:

- the exact current root recipe reaches resolution;
- an older catalogue record with the root ID cannot replace the passed root;
- dependencies come from the runtime-owned seed and closure loader and are not consumer arguments;
- missing recipe IDs are loaded in deduplicated frontiers, with one request per ID even across diamonds;
- loaded records remain operation-local, cannot overwrite the exact root or captured session records, and never
  dispatch to Redux;
- direct and indirect cycles terminate through the shared graph diagnostic rather than recursive loading;
- extra, duplicate, mismatched, missing and forbidden loader results fail closed;
- closure depth, node-count, serialized-byte, round and request-concurrency limits produce controlled terminal
  results;
- cancellation, runtime closure and Earth Engine identity invalidation tear down outstanding recipe loads;
- recipe and asset observations route through the correct GUI API shape;
- array-valued asset bands derive `sample` from observed dimensionality without consulting asset provenance, recipe
  type or band names, while scalar asset bands remain unresolved;
- selected array-valued bands permit only Earth Engine asset export; Drive and SEPAL are unavailable in the panel
  and an incompatible explicit destination is rejected before task submission or analytics;
- while output resolution is pending, the destination selector is disabled as a whole without clearing its value;
  after `READY`, only incompatible destinations are disabled and reconciliation occurs once;
- synchronous invalid resolution emits no `LOADING`, emits one terminal state and completes;
- a synchronous exception during graph construction or observer setup becomes terminal `UNAVAILABLE`, retains the
  error and completes without using the Observable error channel;
- the one-shot public API never emits `PENDING`;
- each subscription captures one catalogue snapshot when it starts;
- replacing the catalogue after creating an Observable but before subscribing affects that subscription;
- replacing the catalogue after subscription affects the next subscription but not one already in flight;
- an update dispatched immediately before subscription is visible, proven with a real Redux store and the real
  lazy adapter rather than a more-permissive mock;
- two subscriptions to one returned Observable operate independently and may capture different catalogue states;
- cancelling one overlapping operation does not affect another;
- completion and unsubscription each tear down their own observations;
- replacing the Earth Engine credential container emits `UNAVAILABLE` with code `SOURCE_IDENTITY_CHANGED`, completes
  and prevents an unresolved old-identity operation from submitting or taking a migration fallback;
- closing the owning runtime scope emits `UNAVAILABLE` with error code `SOURCE_RUNTIME_UNAVAILABLE` to detached
  unresolved operations, prevents submission and releases the environment subscription;
- the context value and consumer render count remain stable across unrelated catalogue changes;
- with no active operation or watcher, Redux changes invoke no source-runtime selector, graph work or observation;
- active environment selection is constant-time and does not build a graph;
- no reducer side effect or ambient singleton-store read is used by the command path.

Retrieve tests separately own fallback classification, safe errors, selected-band conversion and task submission.
They must prove that one explicit `retrieveOptions` value controls destination, bands, submitted image options and
task info even when `recipe.ui.retrieveOptions` is stale, and that `taskConfig` rejects `pyramidingPolicy`,
`imageOutputDescription` and `customizeImage`. The initial activation also proves that direct and transitively
masked CCDC retain `sample`, including a Masking recipe whose primary input is an observed CCDC Segments asset and
whose mask is a recipe. The consumer contains no CCDC or Masking type branch, scalar asset policy remains
unresolved, array-band selection permits only GEE, and `MISSING_SOURCE` blocks rather than taking the legacy policy.
Use a focused panel-boundary witness for destination availability; do not mount complete recipe panels to test
behavior that can be asserted below that boundary.

## Open decisions

- Whether conservative invalidation on `googleTokens` container replacement is frequent enough during normal token
  refresh to require an explicit authentication-owned Earth Engine session epoch.
- Which first live consumer justifies `watchSource$` and therefore decides the initial catalogue implementation.
- Whether Earth Engine reliably changes an ImageCollection's `system:version` when membership relevant to a
  consumer changes; until verified, collection-derived resources require their declared bounded refresh policy.
- Which first capability selector justifies `querySources$` and its authorized search scope.
- Whether a second command consumer demonstrates enough repeated safe-notification behavior to justify a shared
  operation-error presenter.
- Measured initial depth, node-count, serialized-byte, round and request-concurrency limits for temporary browser
  closure completion.
- Whether the Node replacement first exposes a batch-by-ID read or a root-oriented complete-closure operation; the
  source-runtime consumer API is unchanged either way.
