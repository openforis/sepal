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
- Each Retrieve export has exactly one authority for its requirements: a resolved description, the evidence a
  declared wrapper's lifecycle currently vouches for, or an undeclared type's own legacy policy.
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

The context exposes one stable service object:

```js
sourceRuntime.resolveImageOutput$({recipe})   // cold, one-shot: describe the canonical output
sourceRuntime.completeDependencies$({recipe}) // cold, one-shot: the same operation stopped after its closure
sourceRuntime.identity$()                     // credential epochs for a caller whose answer outlives an operation
```

`completeDependencies$` shares the operation's environment capture, closure completion, limits, failure handling and
identity invalidation; its terminal is `{status: COMPLETE | UNAVAILABLE, error, dependencyValidity, basis}`, and it
neither consults a declaration nor observes. `identity$` emits an opaque token on subscription and a fresh one on each
credential-container change, and completes when the owning scope ends; it never exposes credential values.

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
- every terminal carries `basis`: the content of each record that closure read, empty when it read none, so a caller
  retaining the answer can tell whether it is still about the records it now holds;
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
once activated, and that retention is intentionally what keeps the operations an open panel or mounted layer owns
receiving credential invalidation across route navigation. Process teardown closes the runtime. Browse,
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

- With no active operation, watcher or retained answer, Redux actions perform no source-runtime work. A lifetime
  owner holding an answer keeps one credential subscription, compared by reference on each Redux action.
- An active operation performs only constant-time environment selection and session comparison on a Redux change;
  dependency requests are driven by that operation, not by Redux updates.
- No catalogue object is cloned merely to update the runtime.
- Graph construction and Earth Engine observation happen only when an operation is subscribed or a future live
  watcher is active. The synchronous read runs over the graph a map layer's connected props already build, cached
  by identity; it is not runtime work.
- The shared resolver retains its per-operation dependency and observation deduplication.
- Independent subscriptions deliberately do not share one-shot work. Future live watching owns caching and
  multicasting explicitly.
- There is one provider per retained Process instance, not one per recipe, panel or map layer.

## Retrieve integration

Retrieve is a consumer of the common read, not a method on the source runtime.

A Retrieve panel whose request is about its recipe's image output reads `IMAGE_OUTPUT` through the common read
([reading a recipe's own output](#reading-a-recipes-own-output)), over the session graph a map layer builds, and owns
one `OutputAcquisition` for as long as it is open (`withRetrieveOutput.jsx`); it never borrows a map layer's owner.
What it offers, which destinations it enables, whether Apply is enabled and what a submission sends are decided by
one rule (`retrieveOutput.js`) from one read:

- A read still being acquired is pending. Choices are withheld, the destination selector is disabled as one control
  without changing its value, and Apply is disabled. The saved selection is untouched.
- An answer that is not `READY`, or whose `dependencyValidity` is not `VALID`, blocks; a legacy answer is no
  exception. Acquisition failures, invalid descriptions and broken dependencies never become a fallback.
- A selection is translated into the physical names it exports, its request. A name the answer does not hold is named
  to the user and blocks until the selection is edited; it is never dropped. An option a structured selection cannot
  translate blocks as well, rather than being read as another.
- Physical facts decide destinations and policies, by the one evaluation submission validates with
  (`exportRequirements`):

| Answer | Physical facts | Earth Engine policy | Destinations |
| --- | --- | --- | --- |
| `DESCRIBED` | the description | per band as declared; the type's fallback for a verified scalar band that declares none | Drive and SEPAL take verified scalars; Earth Engine needs a policy for every band |
| `LEGACY`, from a type answering for itself | none | the type's own legacy policy, over the resolved names | not restricted |
| `LEGACY`, from a declared wrapper over an undeclared source | what its evidence lifecycle currently vouches for | the wrapper's fallback, for verified scalars only | as for a description |

A legacy answer gains no physical authority from its shape. The dimensionality a helper's answer carries serves
rendering; a wrapper's facts are read from the evidence lifecycle itself (`currentSourceFacts`) and only while that
evidence is current. Encoding is never sent: Task establishes it for declared roots and leaves it unknown otherwise.

**Requests.** A panel selecting physical names exports them; "all bands" names every band the answer holds.

- CCDC selects measures. It offers the measures its described catalogue holds (`measuresFor`), and checks a choice by
  the bands CCDC's own rule exports for it: the measures with the configured breakpoint bands, each with every band
  it produces (`fittedMeasures`, `ccdcOutputBands`). A configured breakpoint band the collection no longer carries
  is named and blocks. CCDC's own export receives the measures, and every template CCDC offers is attached for it to
  keep by the bands it derives - `red`, `red_intercept`, `red_phase_1` - which no filter over stored names could
  decide.
- CCDC Slice selects base bands and measures, with segment bands beside them. Its controls are read from the names
  the answer holds by the slice's own naming rule - a name is a measure of base band `b` when it is `b` with that
  measure's suffix, and a name that is also such a measure is a base band too when it has measures of its own - so
  whatever the output holds can be chosen, and an older description of the source can neither add nor withhold one. Every combination asked for is checked, and an unknown measure is refused. The export sends
  only the names; Earth Engine derives the base bands the slice operation needs from them.
- Time Series is not an image-output request. Its indicator is a collection measure, its options are the whole
  truth, and it reads and acquires nothing.

Labels, tooltips and groups are presentation. They decorate the choices the answer allows and never withhold one: a
choice the presentation does not know is offered after the groups it does.

**Submission.** At Apply the panel reads again from the store it is rendered under - the recipe, the answer, and the
evidence facts - and submits only if the same rule allows the submitted selection; a render the session has since
moved past decides nothing. A retained terminal answers only for the content of the records it was acquired for,
under the credential epoch it was acquired under. Nothing is published before the decision. The form persists its
values under `ui` before Apply runs, and no request is built from `ui`.

A recipe type supplies its generic image export as a task configuration (`retrieveTask`: `dataSetType`,
`includeTimeRange`, and either its own `pyramidingPolicy` or a `fallbackPyramidingPolicy`), or a `submitTask` of its
own. The generic submitter takes explicit Retrieve options and exactly one export authority -
`imageOutputDescription`, `observedBands` or a legacy `pyramidingPolicy` - and refuses more than one. There is no
image-customization callback: a request states its final selection before policies are derived. The styles attached
are those the recipe offers over the answer's bands, restricted to the exported names.

Optical Mosaic, Asset and CCDC Slice declare no policy for scalar bands, and fall back to `mean`, Earth Engine's own
default and what their exports have always used. It stays subordinate to declared policies and applies to verified
scalars alone; it does not establish that averaging suits every scalar band. Masking falls back to
`changeBased('change')`.

**Evidence currency.** Evidence describes the source as it was read, from particular records, assets and credentials:
its basis. `SourceEvidenceSync` decides by one rule (`outdatedBasis`, `sourceEvidenceBasis.js`) whether its basis still
holds - whether to read again, and whether an answer may still be published. Retrieve asks the same rule of the
session as it stands when it decides, including at Apply, so a source edited or credentials replaced before the
lifecycle has even reacted authorize nothing from evidence read before. The credential container is judged by an
opaque generation numbered by its identity; nothing compares, retains or publishes what it contains.

The basis of what a lifecycle publishes is retained with the source runtime it runs under
(`sourceRuntime.publishedEvidence`), before the evidence is dispatched, and found by the observation it published.
Each lifecycle retains and releases its own, so one stopping takes nothing from another publishing for the same
recipe; the runtime's scope bounds them all. The basis stays out of the store, which copies what it is given: the rule
compares a selection by identity, so that reapplying a source panel is a change.

A submission's freshness is the session's. Dependency records the runtime loaded without writing them to the
session cannot be compared, and a persisted dependency changed after Apply is Task's to detect.

### Browser evidence and task authority

The initial catalogue is `process.loadedRecipes`, which is a reference-counted editing cache, not an execution
catalogue. Records disappear when their last recipe consumer unmounts and may contain unsaved dependency edits.
Task receives the exact submitted outer recipe, but nested `RECIPE_REF` dependencies are loaded later from persisted
storage. Browser preflight and Task can therefore resolve different dependency versions even when the browser
closure is complete. Automatic saving narrows that interval but does not remove it: saving is asynchronous and
Retrieve does not await dependency persistence.

This limits what a browser description may authorize. A recipe declaration may authorize Retrieve's policies only
when the export requirement for a given band name is invariant across every dependency version Task could load.
CCDC qualifies because every observed CCDC band requires `sample`, independent of its model and band name. Masking
qualifies only when its source qualifies, because it preserves that declared requirement. Optical Mosaic reads no
recipe, an Asset recipe's requirement follows its observed asset, and a slice's bands are scalar whatever it slices.
A transformation whose policy depends on dependency model values does not qualify and must wait for coherent server
resolution.

This is a bounded coexistence rule, not a claim that the browser graph is the execution graph. A changed persisted
dependency can still produce a different schema and make Task fail. Selected-band validation catches disagreement
between the current selection and the browser description; it cannot detect later dependency drift in Task. The
policy-stability gate prevents the more dangerous case where the same band name is submitted with a policy derived
from a different dependency version.

An incomplete closure is not resolved evidence. The panel's acquisition completes it through the runtime's
authenticated recipe loader, and Retrieve submits only over a `dependencyValidity` of `VALID`. `MISSING_SOURCE` after
that attempt blocks: the missing source could be CCDC, and a fallback of `mean` would reproduce the array-pyramiding
defect the physical facts exist to prevent. Earth Engine does not report an asset's persisted policy, but verified
physical array dimensionality is enough to derive `sample` without recognizing CCDC: every array-valued band receives
`sample`, while a scalar band's physical schema resolves without inventing a policy. The selected destination decides
whether the remaining gap matters: Earth Engine asset export requires a policy for every selected band, while Drive
and SEPAL require selected bands to be scalar and do not consume pyramiding policy. A fallback is never described as
resolved output. Caller-authorized loading and coherent bundles eventually remove the remaining catalogue gaps.

When the selection contains any array-valued band, or "all bands" includes one, only `GEE` is valid. The panel
disables Drive and SEPAL; if the user has no linked Google account, the form has no valid destination and remains
blocked. The decision and the generic submitter both reject an incompatible destination, so stale form state and
other callers cannot bypass the rule. Array bands are never dropped or flattened to satisfy a destination. After an
answer, only incompatible destinations are disabled and an incompatible selected value is reconciled once. An
explicitly empty selection still shows which destinations the output allows. Asset-destination ID validation is
independent: resolution neither waits for it nor uses its completion as a rerender trigger.

A panel opens on a loading view only when its first read is still being acquired. The view is held for a minimum so a
near-instant answer cannot make it flicker past; the minimum overlaps the acquisition, and a failure is shown at once.
A panel already open withholds its choices while a later read is acquired but is never hidden behind that view again.

Refusals are reported through the shared safe message; raw errors and diagnostics go to logging. The source runtime
owns neither mechanism nor presentation.

## Roadmap evolution

### Runtime image output

The one-shot runtime adapts the loaded-recipe cache, the authenticated per-recipe read and
the image-band observation boundaries to the shared image-output observer. Recipe observations need
ordered names for their declarations; asset observations additionally retain verified array dimensionality so the
shared contract can derive `sample` without a recipe-type branch. It does not persist descriptions or loaded
closure records. The completed operation-local graph supplies interactive evidence only; it is not presented as a
coherent execution catalogue. Closure members that cannot be loaded remain controlled `UNAVAILABLE` results and
block Retrieve.

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
without observing. Over the source's closure that check is the conservative observation rule for Masking's
undeclared-source fallback, which observes the source's running image. Removing it needs three things:

- that fallback applies the rule itself;
- every execution consumer checks dependency validity, as map layers and Retrieve do;
- a decision on whether Change Alerts and BAYTS may propose defaults from a source whose unread dependencies are
  broken. Their capability walkers already stop on a cycle or an unresolved record. Panel drafts and dirty state do not renew observations
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

Evidence stays in runtime state. It is Masking's legacy answer where its source declares no output, and while
current the physical facts Masking's Retrieve fallback is authorized from; the presets and templates its consumers
offer; and capability evidence;
map layers read their bands through the common read instead ([reading a recipe's own output](#reading-a-recipes-own-output)).
Open drafts are not overwritten by persisted dependency reloads. Failed observations offer no bands or
visualizations, and are no answer rather than an empty one. Saved snapshots remain the fallback only where nothing has
been observed. A shared live `watchSource$` would make this evidence available without an open consuming recipe and
allow that fallback to retire.

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

**The read.** `readRecipeOutput({recipe, product, graph, heldFor})` (`recipe/recipeOutput.js`) answers which bands a
configured recipe provides for one named product. It never starts work, and consumers do not assemble its context: a
map layer's connected props already derive the session graph over `process.loadedRecipes` (`mapDependencyGraph.js`),
cached by identity, and retained answers come from the layer's own acquisition owner.

| Field | Meaning |
|---|---|
| `status` | `READY`, `NEEDS_EVIDENCE`, `UNAVAILABLE` or `INVALID` |
| `authority` | `DESCRIBED` through the type's declaration, with physical band facts; `LEGACY` from a registered helper, band names only |
| `bands`, `presentation`, `availableBands` | physical bands; display decoration by band name; the two joined in the shape selectors and preset filters read |
| `dependencyValidity` | the closure's structural soundness, or `null` while unknown |
| `acquisition` | `{kind, key}` of the work that would settle the answer, or `null` |

The session graph answers first. A record it lacks is ordinary lazy loading, never a deletion: a read that reaches
one, or an observation nobody holds, is `NEEDS_EVIDENCE`. A definitive diagnosis on the read path is `INVALID`
whatever else is missing, and an output nothing declares, with nothing else wrong, is answered by the legacy seam. A
legitimately empty output is `READY` with no bands, distinct from pending and from failure. Validity is computed from
the session graph when it holds every record its closure references, and is otherwise unknown. The classification is
the shared `readImageOutput`, and the observer settles from its status too, so the two cannot drift. The observer adds
only what its completed closure knows: a record still needed there is one that could not be had. An output nothing
declares settles nothing while another read still waits on an observation, which is requested first.

**Retained answers.** Where the session cannot settle an answer, the owner acquires one of two runtime operations. They
share environment capture, closure completion, limits, failure handling and identity invalidation:

- `resolveImageOutput$` describes the canonical output over a completed closure. It serves an `IMAGE_OUTPUT` answer
  that needs a record or an observation, or whose closure is incomplete.
- `completeDependencies$` completes the closure and reports its validity, describing nothing. It serves a map product
  or legacy answer whose bands are already known, which must not be failed by describing another product.

Every terminal carries `basis`, the content of each record its closure read. A retained terminal answers only while
the records the session holds are the ones it read, compared by the content projection the preview uses
(`recipeContent`), and only under the credential epoch it was started under. Records the operation loaded without
writing them to Redux cannot be compared. A change to one is seen when the layer's content changes for another
reason or the layer remounts, as for preview.

One snapshot answers:

- A retained description answers description and validity together. Once it arrives it replaces the session's
  preliminary choices, and a failed closure withdraws them.
- A dependencies-only terminal answers validity beside a legacy or map-product answer. Such an answer reads nothing
  but the root recipe and its runtime evidence, so the terminal's basis proves it read that same root.
- An observation that failed over a sound closure leaves `dependencyValidity` `VALID` and the description
  `UNAVAILABLE`.

**Who acquires.** Each consumer that can need evidence has an owner whose lifetime covers it:

| Consumer | Owner | Lifetime and invalidation |
|---|---|---|
| A recipe's map layer, on its own or another recipe's map | the `RecipeImageLayer` instance (`outputAcquisition.js`) | while mounted; keyed by the content of every record the session graph holds and the kind of work |
| Its layer form, visualization selector and visualization editor | none of their own: they are given the layer's read | - |
| Masking, CCDC Slice, Change Alerts and BAYTS source evidence | `SourceEvidenceSync` | while the recipe is open; its basis |
| A Retrieve panel over its recipe's image output | the panel instance (`withRetrieveOutput.jsx`), with its own `OutputAcquisition` | while open; as for a map layer |
| Input workflows copying bands and presets at selection, and Sampling Design | their selection workflow | the selection; presets are filtered against the names that workflow observed |

Visualization settings belong to the preview's key, not the acquisition key, so restyling a layer rebuilds its preview
and acquires nothing.

A credential change drops what the layer holds and acquires exactly once again. The owner claims each slot before
subscribing, so a terminal delivered synchronously, or a change handler re-entering the owner, finds the state it was
started under. A credential change produces two notifications; the operation's `SOURCE_IDENTITY_CHANGED` terminal is
never retained and starts nothing, and the epoch change starts the one replacement, whichever arrives first.
`identity$` gives a lifetime owner those epochs without reading credentials, and is subscribed only while something is
held or in flight. The runtime scope ending drops what is held and stops the owner for good.

While an answer needs evidence the consumer shows what it shows for a recipe with no bands: no layer, no options, and
the saved selection untouched. A snapshot copied into the model is not offered for a declared product while its answer
is acquired.

**Products and presentation.** A layer names the product it shows from its type's vocabulary (`mapProducts.productOf`)
over its effective layer config: the type's defaults beneath what the layer saved. The description, the preview and
the editor all read the product from that one config, so none of them depends on the layer form having written its
defaults yet. A value the type does not know is no product at all, answered `INVALID` rather than as the canonical
output, and a type without map products shows `IMAGE_OUTPUT`. CCDC's layer shows `COUNT`. LandTrendr, Change
Alerts and BAYTS Alerts name their mosaic and radar modes, and each keeps the configuration guard its layer had. Map
products are answered by the legacy seam until they are declared.

On the wire, the preview, the band choices, the histogram and the distinct values all carry the same product
arguments: the effective layer config without its visualization (`productArgs`). Every
request about a layer's image therefore concerns the product the layer shows. The Earth Engine handlers pass those
arguments to the image factory and select the requested band last.

Presentation decorates the bands an answer holds and never decides which exist: labels, tooltips, and `display`
precision and range, which the cursor rounds by.

- A declared type registers its presentation beside its declaration. Optical Mosaic decorates from its table of every
  band a mosaic can hold, and an Asset recipe from the band list saved when its asset was selected, matched by name.
- Presets are candidate styles, never pre-filtered by a type's configuration: a style removed upstream cannot be
  restored by the resolved bands that decide where it applies. CCDC's templates follow the measures CCDC fits, which
  its declaration derives from the same optical collection. Slice's templates are bound to what its operation
  produces - template binding over its segment evidence, by the derivation its declaration uses.
- A legacy answer's helper table is its presentation, and its `dataType` is display precision there, except the
  dimensionality an evidence-backed helper states.
- Physical `dataType` in a description stays `{arrayDimensions}` alone.

The visualization editor asks nothing about bands itself. Its selector opens it only once the layer's answer holds
bands, capturing the recipe, those bands and the product arguments together, and the editor requests histograms and
distinct values with that context alone.

- If its area stops showing that layer or that product while it is open, the editor closes without saving.
- A change to the recipe's content does not close it: every request it makes stays coherent with the snapshot it
  holds, and a style it saves is judged against the layer's current read like any other.

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
[legacy policy](source-resolution.md#legacy-policy). Three execution boundaries require `dependencyValidity` to be
`VALID`:

- Retrieve of a recipe's image output, whether its answer is described or legacy.
- Task's asset export of a recipe whose type declares its output. Task resolves only for declared roots, so the export
  of a type that declares no output is not checked.
- Map preview. A layer draws only a `READY` answer with bands over dependencies known to be sound, and is withheld -
  pending, not failed - while they are unknown.

Earth Engine does not resolve descriptions at all: Preview and its other endpoints build images lazily and refuse what
they execute - a cycle through `recipeRef`, a failed read through the operation's recipe scope - so it inherits
neither the scoping nor a new check.

**One legacy seam.** A type with no provider is answered in one GUI module (`recipe/legacyOutput.js`) from its
registered helpers. The seam relocates that answer; it does not change it. What the helper returns passes through
unchanged - band names and the `dataType` hints beside them - marked as a legacy answer. Those hints are
load-bearing. The cursor rounds by their precision, and renderable-visualization filtering reads the dimensionality an
evidence-backed helper states. Withholding them would change what every undeclared type shows for the whole migration
window, and no later deletion recovers that.

A legacy answer is never resolved evidence and never export authority. Retrieve keeps the two apart: a described
answer supplies its choices, destination compatibility, band names and policies; a legacy answer supplies choices
alone, beside the type's own legacy policy ([Retrieve integration](#retrieve-integration)). A type earns the stricter
treatment when it declares its output, not before.

The seam answers whole closures, not root types: an answer is legacy when every diagnostic is an undeclared output
anywhere in the closure, so a declared wrapper over an undeclared source - Masking over Classification - is
answered by the wrapper's own helper. Consumers therefore never branch on whether a type is declared. Acquisition
failures, broken dependencies and invalid descriptions never become legacy answers. Task continues to resolve shared declarations independently
through its authorized runtime adapters; the common GUI read is not a backend dependency or execution authority.

The seam is the only reader of registered band helpers for availability. Retrieve panels import a type's
`bands.js` only for presentation - labels and groups - which decorates what the read answers. When the last type
declares its output, delete the legacy adapter and retain the common consumer API; consumers must not need another
migration.

**One meaning per registration.** A recipe type registers, beside its declaration:

```js
getAvailableBands(recipe)                    // legacy answer: an undeclared type, or a declared wrapper over one
mapProducts: {productOf(layerConfig), bands(recipe, product)}
bandPresentation(recipe, product)            // display decoration of a declared type's bands
getPreSetVisualizations(recipe, evidence)
```

`evidence` is a resolved description the caller already holds, so a caller that has just observed need not wait for
the same answer to reach runtime state; a caller without one is answered from the evidence the recipe carries. It
is never a map mode: which product a layer shows is named, not passed positionally to a question about bands - see
[map-product identity](output-products.md#map-product-identity). The mode and band-group second arguments that the
LandTrendr, BAYTS, Change Alerts and mosaic modules pass among themselves stay type-local and never reach the
registered seam; product identity replaces the mode meaning, and the band-group projection remains a type's own
presentation concern.

**Walk-through.**

- **Optical Mosaic** resolves synchronously from its model, and its presentation keeps the cursor's rounding.
- **Asset recipe:** its declaration needs its own image and its asset observed, so its layer acquires them and draws
  once they arrive.
- **CCDC:** its layer shows `COUNT`, answered by the seam, and needs only its dependencies completed. Where its
  canonical output is read, through Masking or Slice, it needs its available bands observed.
- **Masking** inherits its source's answer, and so its status:
  - over an Optical Mosaic the session holds, it is `READY` at once;
  - over an asset, it needs evidence;
  - over a Regression or Unsupervised Classification the session holds, it is `READY` at once, with the policy each
    declares;
  - over a type that declares no output, such as Remapping, it is answered by Masking's own legacy helper, and never
    from evidence that failed.
- **Classification** will resolve synchronously once it declares a provider: its training recipe is an edge the
  description never reads.
- **Regression** and **Unsupervised Classification** resolve synchronously from their declarations, reading none of
  their sources; only whether those dependencies are sound still needs the closure completed.
- **Remapping** has no provider and is answered by the seam, with the names and hints its helper returns today,
  until it declares one.

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
  and prevents an unresolved old-identity operation from answering anything a submission could use;
- closing the owning runtime scope emits `UNAVAILABLE` with error code `SOURCE_RUNTIME_UNAVAILABLE` to detached
  unresolved operations, answers nothing a submission could use and releases the environment subscription;
- the context value and consumer render count remain stable across unrelated catalogue changes;
- with no active operation, watcher or retained answer, Redux changes invoke no source-runtime selector, graph work or
  observation;
- active environment selection is constant-time and does not build a graph;
- no reducer side effect or ambient singleton-store read is used by the command path.

The read and its lifetime owner prove, over graphs the real builder produces and the real declarations:

- a model-derived output, and a wrapper over one the session holds, is answered at once with no acquisition;
- a record the session lacks needs evidence rather than failing, and a definitive diagnosis on the read path outranks it;
- a map product needs only its dependencies completed, keeps its bands when one cannot be read, and never has its
  canonical output described;
- an unknown product is refused rather than answered as another;
- evidence that could not be had is never a legacy answer, and an observation that failed over a sound closure keeps
  that closure `VALID`;
- restyling a layer rebuilds its preview and acquires nothing;
- a retained terminal about records the session has since replaced is refused;
- a credential change drops what is held and acquires exactly once, in either notification order and after
  settlement; the runtime scope ending stops the owner for good;
- a preview is withheld until dependencies are known to be sound, with the saved selection kept;
- Optical Mosaic's cursor rounding survives its declared bands;
- the visualization editor opens only on known bands, carries the layer's product arguments in its histogram and
  distinct-value requests - which the Earth Engine handlers pass to the image factory, selecting the requested band
  last - and closes when its area shows another layer or product.

Retrieve tests own request translation, authority, failure handling and stale submission, through real
registrations and the real read where a mock could hide wiring. They prove that:

- a masked CCDC keeps `sample`, and a declared scalar with no policy takes the type's fallback only when verified;
- an undeclared type's own policy applies to the resolved names with no destination restriction, and "all bands"
  names what the type supplies;
- unknown, unsound or uncompleted dependencies block, whichever the answer's authority;
- evidence whose basis the session has moved past - a source edit or a credential replacement - authorizes nothing,
  including when Apply lands before the lifecycle has reacted, until it is published again;
- CCDC checks a choice by the bands its rule exports, breakpoint bands included, submits measures and attaches every
  template; Slice offers what its output holds, keeps every requested combination and refuses an unknown measure;
- Apply decides from the session as it stands, not from the render it was clicked in.

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
