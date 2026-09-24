# GUI source runtime

Current browser source-resolution boundaries and their proposed extensions. The implemented one-shot
`resolveImageOutput$` operation and the separate live `SourceEvidenceSync` lifecycle reuse pure shared contracts.
The unified `watchSource$`, instance-level `querySources$`, versioned resource cache and coherent execution bundles
remain design proposals. Components should not own dependency traversal or cache policy.

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
- every terminal carries `dependencyValidity` beside its status: whether the closure this operation completed is
  structurally sound, `null` when the operation ended before its closure said anything;
- unsubscription is the only cancellation mechanism.

The status answers what the recipe's providers read to describe it; `dependencyValidity` answers for the whole
closure, including dependencies no provider read. Both concern the same operation and graph, and neither stands in
for the other. `dependencyValidity` is `VALID`, `UNAVAILABLE` or `INVALID` with the complete graph diagnostics
(`#sepal/recipe/source/dependencyValidity`). It is one condition execution requires - every reference resolves
and none closes a cycle - not a claim that the recipe can execute: it says nothing about assets, configuration
or Earth Engine. A closure that failed is never `VALID`, even when what it had read holds no diagnosis; a
definitive diagnosis found before the failure makes it `INVALID`, and anything less is `UNAVAILABLE`.

`LOADING` is optional. A description whose providers read a definitive diagnosis resolves synchronously without
starting an observation. Future authorized loading remains part of `LOADING`; it does not require a public zero-duration
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

## Recipe selector loading

`RecipeInput` provides project grouping, current-project/ALL filtering and self-reference validation without
requiring a recipe or Earth Engine request. Loading is requested by the callbacks that consume its results:

| Callback | Requested work |
|---|---|
| `onChange(id)` | Notify selection only; the consumer may own its own acquisition workflow. |
| `onRecipeLoaded({recipe, type})` | Resolve the recipe record, without requesting bands. |
| `onBandsLoaded({recipe, type, bandNames})` | Resolve the record and request its bands. |

With neither loading callback, selection performs no read. With both, the callbacks share the same record read.
`onLoading` and `onError` describe requested work; their presence alone does not trigger it. A record-only caller
does not depend on the availability of the bands endpoint. Changing selection or unmounting cancels outstanding
selector work and rejects superseded results.

Validation runs independently of acquisition, on mount for a saved value and on selection: skipping I/O does not
skip invalidating a saved self-reference. `allowOwnRecipe` remains for selections which do not create a
dependency. ALL widens project scope only; caller eligibility remains in force.

Callers request what they consume. Slice, Change Alerts, BAYTS, Mosaic AOI and the four classification fields
need selection only, because their own evidence, bounds or classifier workflow owns the required reads - so the
selector also leaves the shared record cache untouched for them, and those consumers read from a cold one. Map
Layers and the Classification and Regression training-recipe pickers consume records; image-input and sampling
callers consume bands.

The classification fields in PyEO, CCDC, Time Series and Phenology use this selector, and each panel owns its own
read.

A panel that derives settings from a selection holds ONE record of what it knows about that selection: which
classification it concerns, whether that selection may be committed, the settings it proposes for the rest of the
recipe, and what the field has to say. Changing the selection replaces the record as a whole and cancels what was
in flight, so readiness and the proposal cannot disagree; readiness, messages and the proposal are read from the
record rather than maintained beside it.

Committing requires the record in hand to be the one for the selected value, compared at the moment a submission
asks to commit. No submission path - Apply, a wizard step or a keyboard submit - commits any part of a proposal
read from a different classification, whether the user has replaced the selection or returned to an earlier one,
and this holds in the instant between the field taking a new value and the panel being told about it. An answer
arriving for a superseded selection is cancelled before it lands and authorizes nothing. The field carries the
reason it is not ready, and an unready panel refuses forward moves only: going back to an earlier wizard panel
stays available, and commits nothing.

The selection and the settings derived from it are one configuration, published in a single model-changing
action: nothing observing the recipe sees a new classification beside the settings it replaces. A panel
contributes those related updates to its own commit, over recipe-relative paths that preserve merge behavior and
unrelated fields; panels contributing none are unaffected. Acquisition state stays in the panel's session state
and never reaches the recipe model.

The outcomes differ:

- derived settings are proposed and committed with the selection on Apply, leaving user-edited datasets alone;
- a source stating nothing to copy is the manual-configuration path - applicable, with `dates.derived = false`,
  and a warning that the dates are to be set by hand;
- a failed read commits nothing, reports what happened, and leaves the committed configuration intact; choosing
  the same classification again retries it;
- the single-input and hand-picked-scene restrictions are settled answers that derive nothing, so they leave the
  selection unapplicable without changing what those policies admit.

Cancel discards the proposal and restores the committed selection's presentation. Opening a saved recipe acquires
presentation metadata only and never re-derives what was saved.

That ownership is not a free choice: what a panel derives from a classification - band options, or a proposal for
the rest of the recipe - is used by controls that are not always rendered beside the selector, and a selector that
is not rendered reads nothing. Acquisition therefore belongs to the panel lifecycle, which also decides what a
selection means; only PyEO distinguishes a user's selection, which proposes settings, from opening a saved recipe,
which must not. Eligibility is direct `CLASSIFICATION` only; reusable classifier capabilities are a separate
design decision.

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
authenticated recipe loader. The orchestrator submits only a terminal whose `dependencyValidity` is `VALID`, and a
migration fallback qualifies only under the same condition, so neither a description nor an undeclared-output
answer can stand in for sound dependencies; an unknown `dependencyValidity` blocks as surely as an invalid one.
The Retrieve panel presents a description over dependencies not known to be sound exactly as an unresolved
output: no choices, destination and Apply disabled. `MISSING_SOURCE` after that attempt must block the initial
Masking activation: the
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

The one-shot runtime adapts the loaded-recipe cache, the authenticated per-recipe read and
the image-band observation boundaries to the shared image-output observer. Recipe observations need
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

`completeRecipeClosure$` repeatedly builds the shared dependency graph. While the graph reports `MISSING_SOURCE`,
the dependency-path tails of those diagnostics identify one deduplicated frontier of known recipe IDs; the loader
fetches that frontier and rebuilds the graph. Loading continues past a definitive diagnostic such as a cycle or a
malformed direct-source declaration: that says nothing about whether another branch can be read, and a
description reading only that other branch needs it. The operation completes once nothing is missing.

A failure - a loader error, a malformed response or an exceeded limit - is the operation's outcome. It is
delivered on the error channel exactly as raised, never annotated, since a loader's error can be shared, and is
preceded by a `FAILED` notification carrying the graph as it stood when the operation stopped and the records it
was built from. That one operation-local context is what a caller needs to keep a cycle it had already found, or
to know which records a repair would change. Continuing to load means a graph that also has a definitive
diagnostic can end in a loader failure rather than completing with the diagnostic: the one-shot runtime then
reports `UNAVAILABLE` carrying the loader error, with `dependencyValidity` `INVALID` from the definitive
diagnostic; `SourceEvidenceSync` and PyEO's imagery read report the loader failure; Task fails the export naming
both. The current `loadRecipesById$` adapter fans a
frontier out over the existing authenticated `api.recipe.load$(id)` operation with bounded concurrency.
Consequently, the temporary implementation needs at most one logical request batch per discovered graph depth; it
does not pretend that the browser knows transitive IDs before reading their parents.

The shared graph builder remains the sole authority for edges, dependency paths and direct or indirect cycles.
The loader must not recursively walk newly returned models on its own. Diamond references are requested once, a
cycle terminates with the graph's existing cycle diagnostic, and each round makes monotonic progress in one
operation-local map. The operation must enforce explicit depth, node-count, serialized-byte, round and in-flight
request limits with controlled failures. The implemented defaults live in `DEFAULT_RECIPE_CLOSURE_LIMITS` in
`lib/js/shared/src/recipe/source/completeRecipeClosure.js`; changes should be informed by measured recipe graphs.

The exact unsaved root and records captured from the editing session take precedence over loaded persisted
records. A response must contain at most one record for each requested ID, must not contain unrequested records and
must identify every returned record by the requested ID. Missing, forbidden or malformed results fail closed.
Unsubscription, runtime closure and Earth Engine identity invalidation tear down outstanding recipe loads as well
as band observations. No loaded record is dispatched to Redux, so closure completion causes no React rerender and
cannot change another operation's snapshot.

This operation-local adapter supplies browser preflight, not execution authority. It uses no administrator recipe
access and cannot make the browser graph coherent with the persisted graph Task later reads. Its batch-shaped seam
allows a future authorized batch or server-closure call without changing `sourceRuntime.resolveImageOutput$`.
The shared traversal is also used by live observations and panel prefill; those callers supply their own reader
and retention lifetime. The no-Redux-write guarantee above belongs to this one-shot source-runtime adapter.

### Apply-mask stabilization

Preview, map and Retrieve can consume the same resolved output while keeping distinct operation lifecycles. Date
range and source visualizations can be added to a source description without adding Masking-specific context
methods or another source traversal. Inherited source visualizations are evidence; locally edited visualization
state, applicability and final export filtering remain owned by their consumers.

### Live source evidence

Current bands and visualizations are inherited while the consuming recipe is open, but not yet through this
runtime. `SourceEvidenceSync` uses the shared closure-completion boundary with the session's reference-counted
recipe loader. It observes the immediate source's bands and follows declared inheritance over the resolved
records for visualizations, including styles owned by the source and intermediate wrappers rather than their
copied presets. Its operation basis compares persisted dependency inputs by value, retaining runtime
`ui.sourceEvidence` and restored-template provenance (`ui.savedLayerSource`), as well as catalogue revisions,
asset listing `updateTime` and Earth Engine identity. The basis covers every record the closure read, whether the
closure completed or failed, and is taken against the session snapshot the operation started with; repairing a
record read before a failure therefore observes again, while an unchanged failure is not retried on rerender.
The lifecycle keeps its own whole-graph check: a closure with any structural diagnostic is reported unavailable
without observing, because the capability walkers its observations use rely on it. Panel drafts and dirty state do not renew observations
or invalidate pending answers. The full model remains part of the comparison: computation changes must
invalidate even when the resulting band description is identical. The same comparison controls re-observation
and whether a pending answer may publish.

`SourceEvidenceSync` takes a per-recipe observation describing the selected source and how to read evidence about
it. Masking, CCDC Slice, Change Alerts and BAYTS Alerts use this lifecycle. It completes the selected source's
closure rather than the consumer's, so an unrelated incomplete consumer input cannot block acquisition of a
replacement source. The selected source's own dependency failures still matter.

An observation can supply `applyAccepted` assignments, written in the same action as accepted evidence, and a
`reportUnavailable` callback for an accepted failure. Configuration policy compares source identity and payload
against the last successful observation, so unchanged recovery does not overwrite user edits. Change Alerts and
BAYTS own their default-setting policies; the lifecycle owns acceptance, cancellation and rejection of superseded
responses. Change Alerts derives segment descriptions and monitoring settings from one asset-metadata response.

Accepted observations have a generation as well as a payload: charts and previews may need to discard prior
results after re-observation even when the described bands are identical. Slice and Change Alerts reconcile
preset identities against the selected source and restored saved-layer styles. A different source cannot inherit
those identities merely because its first response arrives late.

PyEO's classification-imagery prefill is a separate one-shot workflow, not a live observer. It resolves the selected
imagery's closure, excluding the Classification's unrelated training-data edges, and acquires bands independently
of optional defaults. The panel owns immediate legend/band presentation, staged options/dates, Apply and Cancel.
An unavailable defaults capability does not mean the imagery cannot execute.

Evidence stays in runtime state for synchronous map, layer-form, Retrieve and export consumers. Open drafts are
not overwritten by persisted dependency reloads. Failed observations offer no bands or visualizations; saved
snapshots remain the fallback only where nothing has been observed. A shared live `watchSource$` would make this
evidence available without an open consuming recipe and allow that fallback to retire.

### Asset map-layer refresh

Asset map layers read metadata on activation, a changed catalogue `updateTime`, or explicit Refresh asset. A
successful observation renews the preview even if the metadata is identical, retains unchanged preset identities
and withholds missing-band or array styles without deleting saved selections. Failed reads are reported and
superseded responses cannot publish. This does not detect every external asset change: task-reported invalidation
and shared versioned metadata ownership remain future work in [source freshness](source-freshness.md#asset-freshness).

### Fill operations

Constant Fill requires no new source lookup. Direct asset Fill can reuse asset observation through the source
runtime. Recipe Fill still needs its acquisition and execution requirements defined over the existing authorized
reader. A browser preflight graph is not an execution bundle. No new context operation is required merely to use
another recipe as a source.

### Capabilities and candidate discovery

The implemented producer-step rule supports `CCDC_SEGMENTS`, `BAYTS_HISTORICAL_STATS` and
`OPTICAL_COLLECTION_DEFAULTS`. Change Alerts and BAYTS selectors query type-level candidacy, so they can offer a
Masking recipe whose particular input does not satisfy their requirement. Slice and the classification pickers
still have type filters. None of these is instance-level capability discovery.

The proposed discovery query accepts an operation-specific requirement containing only the structural, adapter or
capability constraints that operation needs, plus cardinality and saved selections. Validation distinguishes a
valid source plan from a `SUPPORTED`, `UNSUPPORTED` or `NEEDS_EVIDENCE` consumer answer. `querySources$` can return
those answers without enumerating recipe types or persisting an effective type.

The query may combine runtime and requirement results for presentation, but the shared validator keeps them
separate. A transport or authorization failure remains runtime `UNAVAILABLE`; it is never relabelled as
`NEEDS_EVIDENCE` or product incompatibility.

A future persisted recipe index may narrow candidate IDs efficiently. It is discovery evidence, not the final
compatibility answer: dynamic wrappers such as Masking and Stack still require current instance resolution. The
source-runtime API does not assume whether candidates came from Redux, a JSONB query or another index.

### Caller-authorized loading and freshness

The one-shot runtime currently uses authenticated per-recipe reads. A future authorization-scoped batch or closure
API can replace that transport without changing consumers. Cached descriptions additionally need keys containing
principal, linked Earth Engine identity and an actual versioned contract; a transport change alone supplies neither
freshness nor graph coherence.

In the proposed unified runtime, live consumers use `watchSource$`; one-shot commands keep captured resolution.
Cache entries publish description, fingerprint, freshness and availability without putting that state into React
context.

Shared reuse is a generic derived-resource concern. Image-output descriptions, visualization applicability and
Sampling Design stratum-area and per-stratum-probability resources should use the same source-version registry and
invalidation machinery rather than create per-feature caches. The logical resource key describes the question; its
source-version vector decides when to resolve evidence again, while the resulting operation-input fingerprint
decides whether an existing answer is reusable. Recipe components continue to pass source intent and consume results
without receiving Redux records, websocket events, revisions or cache controls.

The intended version evidence is:

- exact in-session recipe object identity, or an operation-local draft generation, for the editable root's unsaved
  edits;
- a server-owned monotonic `revision` for persisted recipe update ordering and invalidation;
- an Earth Engine asset ID plus `system:version`, normalized as an opaque string, when that property is available;
- principal, linked Earth Engine identity and contract version where they affect the answer.

The recipe timestamp is display metadata, never a revision and never freshness evidence.
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

### Reading a recipe's own output

Step 1 of the [output-declaration migration](data-sources.md#output-declaration-migration). Every consumer of a
recipe's own output bands reads them synchronously: map layers from `render` and from mount and update
reconciliation, preset filtering from a plain function, the visualization selector from its option builders.
Nothing awaits, and the one async precedent in the GUI is the non-recipe asset layer, which holds metadata in
component state and reconciles when it arrives.

A read that returned a promise would therefore rewrite every consumer before any type had migrated. The read is
instead synchronous and total: it answers with a status beside the description, and a consumer that cannot yet be
answered is told so rather than given a weaker answer that looks like an answer.

**Synchronous, observed and unavailable.** `resolveImageOutput` is pure and synchronous, and a provider that asks
for no observation is already answered without one. The read supplies the evidence the runtime happens to hold and
classifies the result:

- *resolved* - every provider the answer depended on was satisfied. Optical Mosaic reaches this always: it describes
  from its own model. Masking reaches it whenever what it preserves does.
- *needs observation* - a provider asked for a reading the runtime does not hold. CCDC reaches this always: it
  observes its available bands. The distinction is already drawn in the observer, which separates references
  reported unavailable because nothing was asked yet from faults no observation can repair.
- *unavailable* or *invalid* - the existing terminal states, unchanged.

While a read needs observation the consumer shows what it shows today for a recipe with no bands: no layer, no
options, and the saved selection untouched. Withholding what would be presented, rather than deleting what was
selected, is the rule Masking's evidence already follows.

**Who acquires.** The read never acquires, and needs observation is a truthful answer whether or not anything acts
on it. Acquisition belongs to a consumer's own lifecycle, and only where one exists:

- Masking's Retrieve owns its answer. It subscribes to the one-shot runtime operation and holds the result for as
  long as the panel needs it.
- The map layers, presets and selectors of Masking and CCDC Slice read what `SourceEvidenceSync` observed. That
  component is mounted by the recipe's own root component, so acquisition exists exactly while that recipe is the
  one being edited.
- CCDC's own consumers never reach needs observation. Its map layer shows the count product, a fixed vocabulary,
  and its Retrieve offers the measures of the collection it fits, submitted through its own task. Neither asks for
  the canonical Segments output.
- An Asset recipe's layer form and Retrieve read the band list copied into the model when the asset was selected.
  Under an observing provider both need observation, and neither has an acquirer: the panel that wrote the snapshot
  when the asset was chosen is the only one.
- A recipe's layer opened on another recipe's map has no acquirer at all. That is why an unobserved source is still
  answered from the copied snapshot rather than from nothing.

Masking's Retrieve is therefore the only consumer that can meet needs observation by itself. A consumer that wants
the observed answer must bring an acquirer whose lifetime covers its own: subscribing to the runtime operation and
holding the result, as Retrieve does, or observing from a lifetime that spans the consumer, as a recipe's root
component does for the recipe being edited. A layer rendered inside another recipe's map has no such owner today.
Its migration must establish one through the shared runtime, including refresh and cancellation, before replacing
its existing read. This does not require the future `watchSource$` API: choose an existing operation whose lifecycle
fits the consumer. Returning needs observation indefinitely is not an acceptable migration of a working consumer.

**Dependency-scoped descriptions.** A description depends only on what its providers read, so only what they
read can fail it. The graph builder holds each structural diagnosis where it belongs - on every edge whose target
is absent, not only the first the traversal reached; on the edge whose target closes a cycle; and under the recipe
whose own model produced it - while `graph.diagnostics` stays the complete, deduplicated account. Resolution
surfaces a diagnosis when a provider reaches it: reading an edge to an absent recipe reports that edge, a role
whose own field is malformed reports that field rather than a missing role, and a recipe whose own model cannot be
read fails before its provider is consulted, so an unsupported type is never taken for an undeclared output.

Cycles are detected on the path of provider reads. Which edge the graph marks as closing a cycle depends on the
order it walked in, so a description whose reads form no cycle is never failed by that mark; a read of a recipe
still being described is the cycle, is diagnosed on that edge and is not followed, which also bounds the
recursion. The graph's cycle diagnostics remain evidence for dependency validity and for the observation check
below.

Asking for a recipe's own observation answers for more than itself: observing its running image, or the catalogue
it says it can be asked for, may consult any part of what it depends on. As a conservative policy, covering both
`RUNNING_IMAGE` and `AVAILABLE_BANDS`, every structural diagnosis reachable from that recipe - found by which
recipe or edge owns it, not by the path the graph recorded - is reported and nothing is requested. The observer
applies the same rule through discovery, so a doomed request never reaches Earth Engine.

Being described is not being executable. A recipe whose closure carries a structural diagnosis can be described
when no provider reads it; whether its dependencies are sound is answered from the complete closure by
`dependencyValidity`, and what a known-bad state blocks stays owned by
[legacy policy](source-resolution.md#legacy-policy). Two execution boundaries require `dependencyValidity` to be
`VALID`: Masking's observed Retrieve, and Task's asset export of a recipe whose type declares its output. Task
resolves only for declared roots, so the export of a type that declares no output is not checked. Earth Engine does not resolve descriptions at all: Preview and its other endpoints build
images lazily and refuse what they execute - a cycle through `recipeRef`, a failed read through the operation's
recipe scope - so it inherits neither the scoping nor a new check. Map preview does not consult the graph; it
withholds a layer whose recipe reports no bands.

**One legacy seam.** A type with no provider is answered in one GUI module from its registered helpers. The seam
relocates that answer; it does not change it. What the helper returns passes through unchanged - band names and the
`dataType` hints beside them - marked as a legacy answer. Those hints are load-bearing: a map layer builds the data
types it hands Earth Engine with every preview from the same helper result, and renderable-visualization filtering
decides which styles may be drawn from them. Withholding them would change what every undeclared type draws for the
whole migration window, and no later deletion recovers that.

A legacy answer is never resolved evidence and never export authority. Retrieve's policy already keeps the two
apart: a panel owning an output resolution takes its choices, destination compatibility, band names, policies and
encoding from that resolution alone, while a panel with none keeps offering what its recipe type supplies. A type
earns the stricter treatment when it declares its output, not before.

The seam answers whole closures, not root types. Retrieve's existing undeclared-output fallback already behaves
that way: it applies when every diagnostic is an undeclared output anywhere in the closure, which is why the one
production caller passing a fallback policy is Masking - a declared type whose source may not be. Folding that
fallback into the seam is what stops consumers branching on whether a type is declared: the seam reports a legacy
answer, and Retrieve's existing policy applies to legacy answers alone. Acquisition failures, broken dependencies
and invalid descriptions never become legacy answers. Task continues to resolve shared declarations independently
through its authorized runtime adapters; the common GUI read is not a backend dependency or execution authority.

The seam cannot sit at the recipe-type registry. Map layers, preset filtering and the visualization selector reach
the helpers through the registry, but Retrieve panels import each type's `bands.js` directly. Only a module both
import paths are routed through can isolate the compatibility behavior. When the last type declares its output,
delete the legacy adapter and retain the common consumer API; consumers must not need another migration.

**One meaning per argument.** A registered helper answers about a recipe and the evidence held about the source it
inherits from:

```js
getAvailableBands(recipe, evidence)
getPreSetVisualizations(recipe, evidence)
```

`evidence` is a resolved description the caller already holds, so a caller that has just observed need not wait for
the same answer to reach runtime state; a caller without one is answered from the evidence the recipe carries. It
is never a map mode: which product a layer shows is named, not passed positionally to a question about bands - see
[map-product identity](output-products.md#map-product-identity). The mode and band-group second arguments that the
LandTrendr, BAYTS, Change Alerts and mosaic modules pass among themselves stay type-local and never reach the
registered seam; product identity replaces the mode meaning, and the band-group projection remains a type's own
presentation concern.

**Walk-through.** Optical Mosaic resolves synchronously from its model. CCDC always needs observation, and its
consumers see nothing drawn until something acquires it. Masking inherits its source's answer and so inherits its
status. Classification will resolve synchronously once it declares a provider: its training recipe is an edge the
description never reads.
Regression has no provider and is answered by the seam, with the names and hints its helper returns today, until it
declares one.

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
- a terminal reports `dependencyValidity` from the same closure as its description, never `VALID` for a closure
  that failed, and Retrieve blocks a description whose dependencies are not known to be sound;
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
- Whether measured graph sizes require revising the current depth, node-count, serialized-byte, round and
  request-concurrency limits for browser closure completion.
- Whether the Recipe service first exposes a batch-by-ID read or a root-oriented complete-closure operation; the
  source-runtime consumer API is unchanged either way.
