# GUI source runtime

Current browser source-resolution boundaries and their proposed extensions. The implemented one-shot
`resolveImageOutput$` operation and the live evidence registry (`evidenceRegistry.js`) reuse pure shared contracts.
The unified `watchSource$`, configured-source `querySources$`, versioned resource cache and coherent execution bundles
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
- Each Retrieve export has one authority for its requirements: its resolved description. Nothing is exported
  without one.
- Browser descriptions are interactive evidence. They authorize task policy only for an explicitly reviewed
  declaration whose policy is stable across dependency-version drift.
- Graph work and Earth Engine requests occur only for subscribed operations, never merely because Redux changed.
- A one-shot operation retains no result after completion. Shared reuse belongs to the runtime's output watches, not
  to Retrieve panels or individual recipe implementations.
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
sourceRuntime.resolveImageOutput$({recipe})           // cold, one-shot: describe the canonical output
sourceRuntime.completeDependencies$({recipe})         // cold, one-shot: the same operation stopped after its closure
sourceRuntime.watchOutput$({recipeId, product})       // interest in one output question, reference-counted
sourceRuntime.heldFor(key)                            // pure lookup: the current answer to a loading key, or null
sourceRuntime.retryOutput({recipeId, product})        // explicit retry of a question's held failure, and of a failed listing
sourceRuntime.refreshRecipeListing()                  // renew revision evidence older than a minute
```

`completeDependencies$` shares the operation's environment capture, closure completion, limits, failure handling and
identity invalidation; its terminal is `{status: COMPLETE | UNAVAILABLE, error, dependencyValidity, basis}`, and it
neither consults a declaration nor observes. The next three are the shared output watches
([reading a recipe's own output](#reading-a-recipes-own-output)); none exposes credential values.
`refreshRecipeListing` is for a consumer that opens without watching, such as a Retrieve over a question already
watched ([revision evidence](source-freshness.md#packet-2-recipe-revisions-and-shared-observations)).

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
catalogue states. One-shot command consumers normally subscribe once. Output watches are the separate, explicitly
shared contract for live consumers; they leave these semantics unchanged.

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

An Earth Engine credential-container change is different: unresolved one-shot operations using the old identity
become `UNAVAILABLE`, output watches withdraw what they held and load it again, and neither can trigger submission.
Already accepted tasks are unaffected.

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

Output watches share one-shot work between consumers asking the same question and retain a settled answer briefly
after the last one leaves, so a Retrieve panel reopened within that grace period loads nothing. Beyond it, closure
completion and band observation are repeated. Do not hide that latency with a panel-local or Masking-specific cache:
neither a recipe ID nor an asset ID proves that the source still has the same content. Longer reuse belongs to the
versioned-resource layer described in [Source freshness, caching and invalidation](source-freshness.md).

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
or output watch, a Redux action performs no source-runtime work. For an active one-shot operation, catalogue
changes are ignored after its initial snapshot; only session invalidation is observed. The adapter must compare
selected fields rather than wrapper-object identity.

Provider teardown closes the private environment. Outstanding operations then receive the controlled runtime-
unavailable terminal envelope before the adapter releases its Redux subscription. This remains necessary even
though logout currently forces a full page reset: operation lifetime must be explicit rather than rely on browser
navigation winning a race.

The context value stays referentially stable and catalogue updates do not rerender its consumers. Updates reach
consumers through operation Observables and output watch notifications. No React bridge, mutable
environment sink or environment-publication effect is required.

### Performance invariants

- With no active operation or output watch, Redux actions perform no source-runtime work. While any output
  question is watched, the runtime keeps a store subscription and compares by reference, on each Redux action, the
  catalogue, credential container, recipe listing and its state, open recipes and save states; only a change among
  them recomputes the watched questions' reads and checks their works' ledgers. A retained answer subscribes to
  nothing. While anything is watched the recipe listing is refreshed about every four and a half minutes.
- An active operation performs only constant-time environment selection and session comparison on a Redux change;
  dependency requests are driven by that operation, not by Redux updates.
- No catalogue object is cloned merely to update the runtime.
- Earth Engine observation happens only when an operation is subscribed. Watched questions and consumers read over
  graphs cached by identity (`mapDependencyGraph.js`); that read is not runtime work.
- The shared resolver retains its per-operation dependency and observation deduplication.
- Direct subscriptions to the one-shot operations do not share work. Output watches share it by loading key, and
  every operation shares band observations by what Earth Engine evaluates (`observationRegistry.js`).
- Map layers read revision staleness from the listing and open recipes alone, so an edit or a save elsewhere does not
  rerender them.
- There is one provider per retained Process instance, not one per recipe, panel or map layer.

## Retrieve integration

Retrieve is a consumer of the common read, not a method on the source runtime.

A Retrieve panel whose request is about its recipe's image output reads `IMAGE_OUTPUT` through the common read
([reading a recipe's own output](#reading-a-recipes-own-output)), over the session graph a map layer builds, and
watches that question for as long as it is open (`withRetrieveOutput.jsx`). A map layer showing the same output asks
the same question, so the two share one load, and closing either leaves the other's answer in place.
What it offers, which destinations it enables, whether Apply is enabled and what a submission sends are decided by
one rule (`retrieveOutput.js`) from one read:

- A read still being loaded is pending. Choices are withheld, the destination selector is disabled as one control
  without changing its value, and Apply is disabled. The saved selection is untouched.
- An answer that is not `READY`, or whose `dependencyValidity` is not `VALID`, blocks. Acquisition failures, invalid
  descriptions, a recipe with no image output and broken dependencies never become a fallback.
- A selection is translated into the physical names it exports, its request, in the output's order. Once the answer
  is known, the form drops a saved choice it no longer offers (`reconciledChoices`), keeping the rest and choosing
  nothing in its place; a pending or failed read changes nothing. A requested name the answer still does not hold -
  one no saved choice accounts for - is named to the user and blocks. An option a structured selection cannot
  translate blocks as well, rather than being read as another.
- The description's physical facts decide destinations and policies, by the one evaluation submission validates with
  (`exportRequirements`): each band's declared Earth Engine policy, or the type's fallback for a verified scalar band
  that declares none; Drive and SEPAL take verified scalars, and Earth Engine needs a policy for every band.

Encoding is never sent: Task establishes it from the description it resolves itself.

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
`includeTimeRange` and a `fallbackPyramidingPolicy`), or a `submitTask` of its own. A type states no policy of its own:
policies come from physical facts alone. The generic submitter takes explicit Retrieve options and the one export
authority, `imageOutputDescription`, and submits nothing without it. There is no image-customization callback: a request states its final selection before policies are derived. The styles attached
are those the recipe offers over the answer's bands, restricted to the exported names.

Optical Mosaic, Asset and CCDC Slice declare no policy for scalar bands, and fall back to `mean`, Earth Engine's own
default and what their exports have always used. It stays subordinate to declared policies and applies to verified
scalars alone; it does not establish that averaging suits every scalar band. Masking falls back to
`changeBased('change')`.

**Evidence currency.** Evidence describes the source as it was read, from particular records, assets and credentials:
its basis. The evidence registry decides by one rule (`outdatedBasis`, `sourceEvidenceBasis.js`) whether its basis
still holds - whether to read again, and whether an answer may still be published. The credential container is judged
by an opaque generation numbered by its identity; nothing compares, retains or publishes what it contains. The rule
compares a selection by identity, so that reapplying a source panel is a change. Retrieve reads no evidence: what it
authorizes is the description the source runtime holds for its watched question, current only for the records its
loading key names, the evidence of the assets its closure read and the credentials the session holds, so a source
edited under the same id, an asset changed, missing or unchecked, or credentials replaced, authorize nothing described
before. A blocked Retrieve names the asset and offers Refresh.

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

### Shared output watches

Map layers and Retrieve watch their output questions through the runtime, which shares their description loading
([shared loading](#reading-a-recipes-own-output)). Recipe revisions are followed and band observations shared across
questions ([packet 2](source-freshness.md#packet-2-recipe-revisions-and-shared-observations)); asset evidence, redraw
signaling independent of descriptions, explicit Refresh and the retirement of source evidence as a change signal
follow ([packet 3](source-freshness.md#packet-3-asset-freshness-and-redraw-signaling)). Description sharing does not
establish execution readiness, and Task remains independent.

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
diagnostic; the evidence registry and PyEO's imagery read report the loader failure; Task fails the export naming
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

The runtime keeps a recipe's evidence about its source current while anything watches it (`evidenceRegistry.js`); a
preserving consumer's bands are its own description, which the runtime loads for its output watches. The registry
uses the shared closure-completion boundary, claiming every record it reads in the session's reference-counted recipe
cache (`recipeCacheClaims.js`), as components do - those the session already held as well as those it loads - so a
record stays while any watch or component uses it. A draft, open or closed with its saves unsettled, outlives its last
claimant. For Masking it follows declared inheritance over the resolved records for visualizations, including styles
owned by the source and intermediate wrappers rather than their copied presets, and asks Earth Engine nothing about
bands. Its operation basis compares persisted dependency inputs by value, retaining runtime
`ui.sourceEvidence` and restored-template provenance (`ui.savedLayerSource`), as well as catalogue revisions,
each asset's token and explicit refreshes as the source runtime knows them
([packet 3](source-freshness.md#packet-3-asset-freshness-and-redraw-signaling)), and Earth Engine identity. A token
first learned after a read is no change. The assets it reads are claimed from the runtime while the recipe is
watched. The basis covers every record the closure read, whether the
closure completed or failed, and is taken against the session snapshot the operation started with; repairing a
record read before a failure therefore observes again, while an unchanged failure is not retried on rerender.

#### Evidence watches

One observation per recipe is shared by everything watching it, wherever the recipe is shown:

| Watcher | Acquires | How |
|---|---|---|
| A map layer or Retrieve panel | what the type's `sourceRequirements` hold its product to | inside `watchOutput$`, with no wiring of its own |
| A segment chart | what `PIXEL_SEGMENTS` needs | `watchEvidence$({recipeId, operation})` while open |
| The recipe's editor | the observation it names, for what its panels present | `SourceEvidenceSync`, `watchEvidence$({recipeId, observation})` |

An operation in a declaration's `operations` acquires the whole observation, read by the observation the type registers
(`sourceObservation`) unless an editor names its own. One only in `providerOperations` acquires the records of the
selected source's closure and nothing else: the provider chain is judged from them, no capability evidence is read, and
no asset is claimed. A type without requirements is observed only by its editor, so Masking's presets stay
editor-only; Masking layers elsewhere keep the saved-snapshot fallback. CCDC Slice, Change Alerts and BAYTS Alerts
declare requirements, so their layers, Retrieve and charts observe them wherever they are shown.

The registry makes the live basis readable synchronously (`evidenceOwnerOf`) - `{observationId, basis, observes,
records}` - without copying it into Redux, where it would lose the identities its rule compares. Each observation is
identified uniquely across runtimes, since published evidence can outlive the runtime that numbered it; the evidence it
publishes carries that identity, so a reader counts evidence only for the observation the live basis belongs to.
`ui.sourceEvidenceObservation` notifies readers that an observation started and, for a records acquisition, that it
settled. Checking is always an active acquisition: once the last watcher leaves, the work is cancelled, its asset and
record claims are released, and readers see no owner. Source requirements read it
([Change Alerts REF](source-resolution.md#change-alerts-ref)).

A selection being edited in a recipe form panel is observed the same way before it is applied
(`watchCandidate$`, driven by the panel's `SourceCandidate`, [Change Alerts REF](source-resolution.md#change-alerts-ref)):
over the recipe as it would be with the panel's values applied, by the observation the type registers, under the same
basis, claims and cancellation. Its evidence and owner are held by the registry and handed to the panel whenever
either changes - a first token adopted into the basis included, so a later token is a change however early it is read.
Nothing is published: no default is applied, nothing is announced and nothing is written, so the recipe's own evidence
and drawing stay as they are until Apply. It is started only where the recipe's own observation does not hold for the
candidate, and is let go when the edit changes, the panel closes or the recipe's observation comes to hold for it.
Letting it go can release the last claim on a record it read - the selection Apply has just committed - while the
recipe's observation of that selection is starting. A closure takes a record from the session only if the session
still holds it when the closure claims it; one released since is loaded through the watch's own claim, so the session
holds it again for the discovery reading the evidence.
Apply does not adopt it; the recipe's evidence is read again through its own lifecycle.

Updates are synchronous with the store change that causes them. Claiming records or assets, marking an observation
started, publishing and applying an editor's defaults can all dispatch again, so an observation's identity and its
cancellation are installed before anything can dispatch, and every write is made only for the entry, observation and
basis still current when it is made, and only to a recipe the session still holds; an evicted record is never written
back. A claim that returns after its observation ended or was replaced is released at once.

The lifecycle keeps its own whole-graph check: a closure with any structural diagnostic is reported unavailable
without observing. Removing it needs two things:

- every execution consumer checks dependency validity, as map layers and Retrieve do;
- a decision on whether Change Alerts and BAYTS may propose defaults from a source whose unread dependencies are
  broken. Their capability walkers already stop on a cycle or an unresolved record. Panel drafts and dirty state do not renew observations
or invalidate pending answers. The full model remains part of the comparison: computation changes must
invalidate even when the resulting band description is identical. The same comparison controls re-observation
and whether a pending answer may publish.

An observation describes the selected source and how to read evidence about it. Masking, CCDC Slice, Change Alerts and
BAYTS Alerts use this lifecycle. It completes the selected source's closure rather than the consumer's, so an
unrelated incomplete consumer input cannot block acquisition of a replacement source. The selected source's own
dependency failures still matter.

What only an open editor may do stays with the editor's watch. An observation can supply `applyAccepted` assignments,
written in the same action as accepted evidence while an editor watches and the recipe is open, and a
`reportUnavailable` callback for an accepted failure. Evidence obtained while only a map watched changes no
configuration. Configuration policy compares source identity and payload against the last evidence that policy
processed (`ui.sourceEvidenceApplied`, advanced in the same action whether or not it assigned anything), so unchanged
recovery does not overwrite user edits, and an editor opened over evidence a map already obtained processes it once,
as it would have on arrival. A failure no editor has seen is announced once when one attaches; the error stays in the
runtime, not Redux. Change Alerts and BAYTS own their default-setting policies; the registry owns acceptance,
cancellation and rejection of superseded responses. Change Alerts derives segment descriptions and monitoring
settings from one asset-metadata response, and BAYTS Alerts the historical statistics' typed bands and processing
options; neither announces a failure, which their reference sections say instead.

An observation may declare `savedLayerSource`, as CCDC Slice's does: the registry then records the source the recipe's
saved layers were styled for (`ui.savedLayerSource`) when the recipe is first observed in the session, by whoever
watches - editor, layer, Retrieve or chart - in the action marking that observation started. It is written once, never
replaced, only to a recipe the session holds, and never for a selection being edited. The observation and its basis
are taken from the recipe with it recorded, so an editor opened after a map observed the recipe records nothing and
reads nothing again. A recipe whose closure includes the Slice record - Masking over Slice - compares that record's
provenance, and reads again once if it observed the Slice before the Slice itself was first observed.

Accepted evidence is presentation only: it is in no content, work or preview key and carries no generation. Whether
charts and previews must discard what they drew is the pixel generation's to say
([packet 3](source-freshness.md#packet-3-asset-freshness-and-redraw-signaling)), and an observer over another recipe
reads again when that recipe's evidence content changes. Slice and Change Alerts reconcile
preset identities against the selected source and restored saved-layer styles. A different source cannot inherit
those identities merely because its first response arrives late.

PyEO's classification-imagery prefill is a separate one-shot workflow, not a live observer. It resolves the selected
imagery's closure, excluding the Classification's unrelated training-data edges, and acquires bands independently
of optional defaults. The panel owns immediate legend/band presentation, staged options/dates, Apply and Cancel.
An unavailable defaults capability does not mean the imagery cannot execute.

Evidence stays in runtime state. It is the presets and templates its consumers offer, capability evidence, and the
identity of the source as it was read, which a consumer's acquisitions and layers are keyed by through its record;
bands are read through the common read ([reading a recipe's own output](#reading-a-recipes-own-output)), never from
evidence. Open drafts are not overwritten by persisted dependency reloads. Failed observations offer no
visualizations, and are no answer rather than an empty one. Saved presets remain the fallback only where nothing has
been observed. Presentation evidence is observed outside an editor only where a declared requirement needs it; a
shared live `watchSource$` would make the rest available without an open consuming recipe and allow that fallback to
retire.

### Asset map-layer refresh

Asset map layers claim their asset from the source runtime and read its metadata on activation, when its token
changes, on explicit Refresh and when credentials change. A preview is drawn again only when the asset is seen to
change or is refreshed; unchanged metadata, a failed check or read and replaced credentials keep what is drawn. They
retain unchanged preset identities and withhold missing-band or array styles without deleting saved selections. An
asset found missing is withheld and named. Failed reads are reported and superseded responses cannot publish. A
change no token reports stays unseen until Refresh
([packet 3](source-freshness.md#packet-3-asset-freshness-and-redraw-signaling)).

### Fill operations

Constant Fill requires no new source lookup. Direct asset Fill can reuse asset observation through the source
runtime. Recipe Fill still needs its acquisition and execution requirements defined over the existing authorized
reader. A browser preflight graph is not an execution bundle. No new context operation is required merely to use
another recipe as a source.

### Capabilities and candidate discovery

The implemented producer-step rule supports `CCDC_SEGMENTS`, `BAYTS_HISTORICAL_STATS` and
`OPTICAL_COLLECTION_DEFAULTS`. Change Alerts, CCDC Slice and BAYTS selectors query type-level candidacy, so they can
offer a Masking recipe whose particular input does not satisfy their requirement. The classification pickers still
have type filters. None of these is configured-source capability discovery. Change Alerts, CCDC Slice and BAYTS Alerts
validate their selected source once chosen ([Change Alerts REF](source-resolution.md#change-alerts-ref),
[CCDC Slice SRC](source-resolution.md#ccdc-slice-src), [BAYTS Alerts REF](source-resolution.md#bayts-alerts-ref));
their pickers still offer type-level candidates.

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
cached by identity, and retained answers come from the source runtime (`heldFor`).

| Field | Meaning |
|---|---|
| `status` | `READY`, `NEEDS_EVIDENCE`, `UNAVAILABLE` or `INVALID` |
| `authority` | `DESCRIBED` for a `READY` answer, resolved through the type's declaration with physical band facts; otherwise `null` |
| `bands`, `presentation`, `availableBands` | physical bands; display decoration by band name; the two joined in the shape selectors and preset filters read |
| `dependencyValidity` | the closure's structural soundness, or `null` while unknown |
| `acquisition` | `{kind, key}` of the work that would settle the answer, or `null` |

The session graph answers first. A record it lacks is ordinary lazy loading, never a deletion: a read that reaches
one, or an observation nobody holds, is `NEEDS_EVIDENCE`. A definitive diagnosis on the read path is `INVALID`
whatever else is missing - a recipe with no image output (`NON_IMAGE_OUTPUT`) among them. A legitimately empty output
is `READY` with no bands, distinct from pending, from failure and from having no image output. Validity is computed from
the session graph when it holds every record its closure references, and is otherwise unknown. The classification is
the shared `readImageOutput`, and the observer settles from its status too, so the two cannot drift. The observer adds
only what its completed closure knows: a record still needed there is one that could not be had.

**Retained answers.** Where the session cannot settle an answer, the runtime loads it through one of two runtime
operations, for whoever watches the question. They share environment capture, closure completion, limits, failure
handling and identity invalidation:

- `resolveImageOutput$` describes the canonical output over a completed closure. It serves an `IMAGE_OUTPUT` answer
  that needs a record or an observation, or whose closure is incomplete.
- `completeDependencies$` completes the closure and reports its validity, describing nothing. It serves a map product
  whose bands are already known, which must not be failed by describing another product.

Every terminal carries `basis`, the content of each record its closure read. A retained terminal answers only while
the records the session holds are the ones it read, compared by the content projection the preview uses
(`recipeContent`), and only under the credential epoch it was started under. Records the operation loaded without
writing them to Redux cannot be compared. A change to one is seen only when the question's key changes for another
reason, or once the answer's retention has ended and the question is watched again.

One snapshot answers:

- A retained description answers description and validity together. Once it arrives it replaces the session's
  preliminary choices, and a failed closure withdraws them.
- A dependencies-only terminal answers validity beside a map-product answer. Such an answer reads nothing
  but the root recipe and its runtime evidence, so the terminal's basis proves it read that same root.
- An observation that failed over a sound closure leaves `dependencyValidity` `VALID` and the description
  `UNAVAILABLE`.

**Who watches.** Each consumer that can need evidence watches its question while it is open. The loading and the
answers belong to the runtime (`sourceRuntime/outputRegistry.js`):

| Consumer | Watch | Lifetime |
|---|---|---|
| A recipe's map layer, on its own or another recipe's map | the `RecipeImageLayer` instance, on the product its config names (`outputWatch.js`) | while mounted |
| Its layer form, visualization selector and visualization editor | none of their own: they are given the layer's read | - |
| Source evidence: Change Alerts', CCDC Slice's and BAYTS Alerts' requirements, and their and Masking's presentation | the output watches and charts needing it, and the editor (`evidenceRegistry.js`) | while any of them watches; its basis |
| A Retrieve panel over its recipe's image output | the panel instance (`withRetrieveOutput.jsx`), on `IMAGE_OUTPUT` | while open |
| Input workflows copying bands and presets at selection, and Sampling Design | their selection workflow | the selection; presets are filtered against the names that workflow observed |

Visualization settings belong to the preview's key, not the loading key, so restyling a layer rebuilds its preview
and loads nothing.

**Shared loading.** `watchOutput$({recipeId, product})` registers interest in a question: a recipe id and the product
its consumer reads, normalized as the read names it (`layerProduct`). While a question is watched, the runtime
recomputes its read whenever the session's catalogue changes and loads what the read's `acquisition` names. A question
the session answers alone is still watched and loads nothing. Work is keyed by the acquisition key, so questions
naming the same key share one operation - a map layer and Retrieve over one output, or two parameter sets of one
configuration-only product - while canonical output and products remain distinct questions.

- Every watched question is recomputed on each session change, including one arriving in a dispatch during which
  another question is first watched. A watch is told when the work answering its question changes: withdrawn for
  other work, settled, or released because the session now answers alone. An edit leaving its key as it was tells
  it nothing.

- Unfinished work is cancelled and discarded when the last question claiming it is released. A consumer watches a
  changed question before releasing the previous one, so switching a layer's product keeps loading the two share.
- A settled `READY`, `INVALID` or `COMPLETE` answer is retained for 60 seconds after its last release, and at most 32
  are retained unclaimed, the earliest released evicted first; both are configurable. A retained answer loads and
  watches nothing, and a reopened question is recomputed from the session before an answer is reused.
- An `UNAVAILABLE` answer is held while claimed, so consumers show failure rather than pending, and discarded at zero
  claims. It is loaded again on `retryOutput`, on a key or credential change, or when watched after being discarded;
  another subscriber, another question sharing it, or a render never retries it. A terminal whose basis differs from
  the records its key names is held as such a failure (`SOURCE_BASIS_CHANGED`).
- `heldFor` checks currency when it is called: the key, the credentials the session holds now and the retention
  deadline. A read made in the same dispatch as an edit or a credential replacement, Apply's included, finds nothing
  current.
- Replaced credentials discard every answer and restart only watched work, once, whichever of the session change and
  the operation's `SOURCE_IDENTITY_CHANGED` is heard first. Each operation claims its slot before subscribing, so a
  terminal delivered synchronously finds the state it was started under. The runtime's scope ending completes every
  watch and answers every key `SOURCE_RUNTIME_UNAVAILABLE`; nothing restarts.
- Work keeps a ledger of the records it read, and is withdrawn, settled or not, when evidence supersedes one: a newer
  revision in the listing or a save acknowledgement, or a listed recipe no longer listed. A cached record the listing
  has moved past is read again first (`REFRESH`), and a draft never is. Band observations are shared across questions
  by what Earth Engine evaluates, and kept for reuse only over complete evidence
  ([packet 2](source-freshness.md#packet-2-recipe-revisions-and-shared-observations)).

While an answer needs evidence the consumer shows what it shows for a recipe with no bands: no layer, no options, and
the saved selection untouched. A snapshot copied into the model is not offered for a declared product while its answer
is loaded. Once the recipe is set up and the answer could be drawn from, the layer keeps a selection matching a
candidate and otherwise selects the first candidate its picker offers
([selection behavior](visualizations.md#selection-behavior)). BAYTS Alerts, Change Alerts and LandTrendr apply the same
rule in their own forms, over the presets of the mode shown, once their mode, filter and year are settled.

**Products and presentation.** A layer names the product it shows from its type's vocabulary (`mapProducts.productOf`)
over its effective layer config: the type's defaults beneath what the layer saved. The description, the preview and
the editor all read the product from that one config, so none of them depends on the layer form having written its
defaults yet. A value the type does not know is no product at all, answered `INVALID` rather than as the canonical
output, and a type without map products shows `IMAGE_OUTPUT`. CCDC's layer shows `COUNT`, and LandTrendr's its change
map or its `ANNUAL_MOSAIC` of the layer's `year`. Change Alerts and BAYTS Alerts name their mosaic and radar modes,
and each keeps the configuration guard its layer had.

LandTrendr's layer form keeps its `year` within the recipe's fitted period, `startYear` to `endYear`, whichever mode
it shows: a year inside is kept, one past either end becomes that end, and none becomes `endYear`. Its picker offers
that period alone. It reconciles on mount and whenever the recipe's dates or the layer config change, in each map
area on its own, writing only the year and only when it changes, so the style is kept; a style is chosen once the
year agrees. The preview and the editor therefore concern the reconciled year, and an editor opened on the previous
one closes. A stored value that is not a year is left for the user to replace, and its product is `INVALID`. The
product itself accepts any integer year; this is the layer's choice.

A product its type declares (`mapProducts` in the shared type, [map-product
identity](output-products.md#map-product-identity)) is described through the shared read, from the root's
configuration alone, and acquires only `DEPENDENCIES`. Its description carries `output.product` with the parameters it
normalized, which the resolver attaches, and whatever it refuses - parameters it does not take or values it refuses,
bands its declaration gets wrong, a provider failure - is `INVALID`, as is a product its type does not declare
(`UNDECLARED_PRODUCT`). The acquisition key does not name the product, so another year of LandTrendr's annual mosaic
is described again from the recipe while the dependencies terminal already held still answers validity.

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
- Physical `dataType` in a description stays `{arrayDimensions}` alone.

The visualization editor asks nothing about bands itself. Its selector opens it only once the layer's answer holds
scalar bands, capturing the recipe, those bands and the product arguments together, and the editor requests histograms
and distinct values with that context alone.

- If its area stops showing that layer or that product while it is open, the editor closes without saving.
- A change to the recipe's content does not close it: every request it makes stays coherent with the snapshot it
  holds, and a style it saves is judged against the layer's current read like any other.

**Dependency-scoped descriptions.** A description depends only on what its providers read, so only what they
read can fail it. The graph builder holds each structural diagnosis where it belongs - on every edge whose target
is absent, not only the first the traversal reached; on the edge whose target closes a cycle; and under the recipe
whose own model produced it - while `graph.diagnostics` stays the complete, deduplicated account. Resolution
surfaces a diagnosis when a provider reaches it: reading an edge to an absent recipe reports that edge, a role
whose own field is malformed reports that field rather than a missing role, and a recipe whose own model cannot be
read fails before its provider is consulted. Every registered type states its output, so an unsupported type is the
only one without a provider, and it is diagnosed as that.

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

- Retrieve of a recipe's image output.
- Task's asset export of a recipe. Task resolves every root, and refuses one with no image output before exporting.
- Map preview. A layer draws only a `READY` answer with bands over dependencies known to be sound, and is withheld -
  pending, not failed - while they are unknown.

Earth Engine does not resolve descriptions at all: Preview and its other endpoints build images lazily and refuse what
they execute - a cycle through `recipeRef`, a failed read through the operation's recipe scope - so it inherits
neither the scoping nor a new check.

Nor does a sound closure make a recipe executable. A declaration says which bands a configuration provides, and a
recipe still being configured can be described before it states what it needs to run: Change Alerts without a
monitoring period or a reference is described with its nine change bands. Nothing validates such requirements yet.
The recipe's own layer and Retrieve wait for it to be initialized, its change styles are offered only once it states
a period, and execution refuses it with its own error. A wrapper over it - Masking over an unfinished Change Alerts -
has none of those gates: it is offered the bands, a style a user defines over them can request a preview, and an
export is accepted and fails in Earth Engine. That exposure is accepted until requirements are validated.

**Mandatory output contracts.** Every registered type states its output, as it states its sources: an image output
provider, or `NO_IMAGE_OUTPUT` for a type whose recipes produce no image - Sampling Design, whose samples its own tasks
export. Registration refuses a type that states neither, so no read, GUI or Task, meets an output nobody declared, and
consumers never branch on whether a type is declared. A recipe with no image output read as an image is `INVALID`
(`NON_IMAGE_OUTPUT`), located at that recipe, through any wrapper that reads it and whatever else the read is waiting
for; it is not an image with no bands. Retrieve panels import a type's `bands.js` only for presentation - labels and
groups - which decorates what the read answers. Task resolves shared declarations independently through its
authorized runtime adapters; the common GUI read is not a backend dependency or execution authority.

**One meaning per registration.** A recipe type registers, beside its declaration:

```js
mapProducts: {defaults, productOf(layerConfig)}   // which product a layer config names
bandPresentation(recipe, product)                 // display decoration of the bands a product's description holds
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
- **CCDC:** its layer shows `COUNT`, described from its declaration, and needs only its dependencies completed;
  counting reads neither the segments nor their catalogue. Where its canonical output is read, through Masking or
  Slice, it needs its available bands observed.
- **Masking** inherits its source's answer, and so its status:
  - over an Optical Mosaic the session holds, it is `READY` at once;
  - over an asset, it needs evidence;
  - over a Regression or Unsupervised Classification the session holds, it is `READY` at once, with the policy each
    declares;
  - over a Sampling Design, it is `INVALID`: the design produces no image.
- **Classification**, **Regression**, **Unsupervised Classification** and **Remapping** resolve synchronously from
  their declarations, reading none of their sources; only whether those dependencies are sound still needs the
  closure completed.

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
- with no active operation or output watch, Redux changes invoke no source-runtime selector, graph work or
  observation, and a retained answer subscribes to nothing;
- active environment selection is constant-time and does not build a graph;
- no reducer side effect or ambient singleton-store read is used by the command path.

The read, the output watches and the map layer prove, over graphs the real builder produces and the real declarations
(`recipeOutput.test.js`, `sourceRuntime/outputRegistry.test.js`, `sourceRuntime/sourceRuntimeContext.test.jsx`,
`recipeImageLayer.test.js`):

- a model-derived output, and a wrapper over one the session holds, is answered at once and loads nothing, while its
  question is still watched;
- a map layer and Retrieve asking the same question make one Earth Engine request, product parameter sets sharing a
  configuration-only product share their dependency load, and canonical output and products stay apart;
- closing either consumer leaves work the other needs, in both orders, and work is cancelled once every question
  sharing it has left, including across a layer's product switch while it is loading;
- a record the session lacks needs evidence rather than failing, and a definitive diagnosis on the read path outranks it;
- a map product needs only its dependencies completed, keeps its bands when one cannot be read, and never has its
  canonical output described;
- an unknown product is refused rather than answered as another;
- a recipe with no image output is refused as one, directly and through a wrapper, beside a record still to be
  loaded too; an observation that failed over a sound closure keeps that closure `VALID`;
- restyling a layer rebuilds its preview and loads nothing;
- an edit or a credential replacement withdraws the answer within the dispatch that makes it, a late answer for a
  replaced key installs nothing, and a terminal about other records than its key names is held as a failure;
- an edit tells the watches whose answer it withdraws or leaves to the session alone, and no others, and is heard for
  every watched question when another is first watched in the same dispatch, over the real store as well;
- a credential change discards what is held and loads each watched question exactly once, in either notification
  order, telling every consumer, while retained answers are discarded and not reloaded until watched again;
- a failure is held rather than pending, is not reloaded by another subscriber or question, and recovers on retry, a
  relevant edit, a credential change or a watch after it was discarded;
- a settled answer is reused within the grace period, withdrawn at its deadline before cleanup runs, recomputed from
  the session when reopened, and bounded by the unclaimed cap without evicting a watched answer;
- the runtime scope ending completes every watch, answers unavailable and restarts nothing;
- a newer revision of a privately loaded dependency withdraws its answer in the dispatch that lists it and loads it
  once, an unrelated revision loads nothing, and an answer retained while unwatched is not reused after one; a late
  answer installs nothing, and storage answering an old revision twice is held as a failure;
- a dependency the listing stops listing is withdrawn and read again, a failure to read it is held until it is listed
  again, and one never listed is left alone;
- a cached record the listing has moved past is read again and replaced before a local answer uses it, a failure to
  read it is held until retried, and an open draft is never read again;
- an open dependency of an observed recipe is observed again once its save is acknowledged, and the acknowledgement
  alone withdraws what was observed before it; a dependency whose tab closes while it is saving stays a draft;
- Retrieve waits for a dependency's save, blocks each save failure and a newer stored revision under its own code,
  blocks an expired or failed listing, and cannot submit in the dispatch that supersedes its answer; a retry refreshes a
  failed listing;
- one band observation serves a recipe's layer, its Retrieve, a Masking over it and Masking's evidence publications;
  what is sent, the credentials or the reference type make another; closing one consumer leaves it running; one over
  a disagreeing draft, a newer stored revision or an unknown revision is shared in flight and never reused, and reuse
  is refused at lookup once idle or superseded, whether or not cleanup has run;
- a preview is withheld until dependencies are known to be sound, with the saved selection kept;
- Optical Mosaic's cursor rounding survives its declared bands;
- the visualization editor opens only on known bands, carries the layer's product arguments in its histogram and
  distinct-value requests - which the Earth Engine handlers pass to the image factory, selecting the requested band
  last - and closes when its area shows another layer or product.

Retrieve tests own request translation, authority, failure handling and stale submission, through real
registrations and the real read where a mock could hide wiring. They prove that:

- a masked CCDC keeps `sample`, and a declared scalar with no policy takes the type's fallback only when verified;
- a description exports the names selected with the policies it declares, "all bands" names every band it holds,
  and a saved band it no longer holds exports nothing;
- unknown, unsound or uncompleted dependencies block;
- a description of a source that has since changed - edited under the same id, or read under credentials since
  replaced - authorizes nothing, including when Apply lands before anything has reacted, until it is described again,
  and an array it has become is refused by a destination that cannot hold one;
- a recipe with no image output is neither previewed nor retrieved, alone or through a wrapper;
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
