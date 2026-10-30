# GUI source runtime

Current browser acquisition, pure-read and interaction contracts. The runtime is owned by one retained Process
instance. Components request source questions without owning catalogues, traversal, loading or caches.
[Freshness](source-freshness.md) owns retention/currency policy;
[source resolution](source-resolution.md) owns shared requirements and authorization;
[behavior contracts](behavior-contracts.md) owns the user interaction.

## Public boundary

`SourceRuntimeContext` exposes one stable service object, not records or observer state. The Redux adapter uses the
injected store and reads current state synchronously when an operation subscribes; React effects do not determine
submission authority. Process teardown closes its runtime. Other application sections need no runtime instance.

```js
sourceRuntime.resolveImageOutput$({recipe})
sourceRuntime.completeDependencies$({recipe})
sourceRuntime.watchOutput$({recipeId, product, explain})
sourceRuntime.heldFor(key)
sourceRuntime.retryOutput({recipeId, product})
sourceRuntime.refreshRecipeListing()
```

`resolveImageOutput$` is cold and one-shot. Each subscription captures the exact submitted outer root, one session
seed and a private closure. The root wins over a cached record with its ID. Privately loaded dependencies do not
overwrite editable drafts. It may emit `LOADING`, then one terminal `READY`, `INVALID` or `UNAVAILABLE`, and completes.
Operational failures travel in the terminal envelope rather than its Observable error channel. Unsubscribe is the
consumer's cancellation mechanism.

Each terminal carries `dependencyValidity` for the whole acquired closure, the `basis` of records read, and the
original structured diagnoses/error. A provider can describe its output without reading a broken dependency;
that does not establish that the closure is valid or the operation ready. A failed closure is never `VALID`.
`completeDependencies$` uses the same lifecycle but describes no canonical image, answering `COMPLETE` or
`UNAVAILABLE` with structural evidence.

A credential-container replacement invalidates old operations as `SOURCE_IDENTITY_CHANGED`; runtime teardown
answers `SOURCE_RUNTIME_UNAVAILABLE`. The epoch is opaque: never expose, retain or compare credential values as
public identity. A captured one-shot ignores later catalogue replacements but responds to identity invalidation.
Live watches recompute their question against changed records. No synchronous getter starts acquisition.

## Reading a recipe's own output

`readRecipeOutput({recipe, product, graph, heldFor})` is synchronous and total. The map's session graph is cached
by identity; consumers do not assemble their own dependency catalogues.

| Field | Contract |
| --- | --- |
| `status` | `READY`, `NEEDS_EVIDENCE`, `UNAVAILABLE` or `INVALID`. |
| `authority` | `DESCRIBED` for an established answer; otherwise none. |
| `bands` | Physical bands in output order. |
| `presentation`, `availableBands` | Decoration by name, and the joined GUI view. |
| `dependencyValidity`, readiness | Structural soundness and operation executability remain distinct. |
| `acquisition` | The runtime work key/kind needed to settle the question, or none. |

A legitimately empty output differs from no-image output, pending and failure. A confirmed diagnosis on the read
path survives missing/unavailable unrelated evidence. Missing session records request loading, not a deletion mark.
A copied source snapshot is not authority for a declared output.

Named products are described from their own configuration/delegation contract and acquire dependencies without
requiring a canonical-image description. If their type declares readiness/prerequisites, the product gate judges
those separately. Product name and normalized parameters come from effective layer config and accompany preview,
histogram and distinct-value requests. Visualization changes redraw but do not change the loading question.

## Shared output watches

A mounted layer watches its product; an open Retrieve watches `IMAGE_OUTPUT`. Layer forms, selectors and the
visualization panel receive that layer's read rather than starting independent band discovery. Equal acquisition
keys share work. Questions differing in product or `explain` remain distinct even when they share a read.

A configuration-only answer is still watched so its dependencies stay current, but starts no unnecessary network
work. Closing one consumer does not cancel another's read. Unfinished work ends with the last claimant; settled
answers have the bounded retention and synchronous currency rules in [freshness](source-freshness.md#output-watches).
A held failure does not retry on render or another subscriber; retry needs an explicit action, relevant basis change
or a fresh claim after disposal.

`EXPLAIN` belongs to editor questions. A confirmed refusal answers immediately; a single bounded pass may acquire
missing records/observations to add other established diagnoses. It cannot replace the original refusal with a
loading answer. Each failed observation remains a failure; no retry loop is created to obtain a prettier message.

`heldFor` verifies keys, records/revision evidence, credentials and retention immediately, including a read made in
the same dispatch as an edit. Timers only schedule work/cleanup; they do not confer authority.

## Evidence watches and candidates

The evidence registry shares one accepted observation among all consumers needing it:

| Consumer | Interest |
| --- | --- |
| Layer or Retrieve | Requirements its type declares for the displayed/requested product. |
| Chart | `watchEvidence$({recipeId, operation})` while open. |
| Recipe panel | Its registered presentation/source observation. |
| Edited source | `watchCandidate$` over the current candidate while that panel needs it. |

An `operations` requirement acquires its observation; a `providerOperations` requirement can acquire the provider
chain records alone. Types with no such requirement keep editor-only presentation observation. This leaves a
saved-preset fallback for some Masking displays outside their own editor; retiring that fallback requires evidence
with a matching owner/lifetime rather than another snapshot.

The registry exposes the live owner/basis synchronously. Only evidence from that observation, accepted under the
current selection, record and credential/asset basis, counts. Claims and cancellation are installed before any
reentrant dispatch. A late claim is released if its observation ended, and evicted records are never resurrected
by an evidence write. Releasing the last watcher cancels work and releases record/asset claims.

A candidate represents the recipe with the panel's values applied. If the applied observation's basis holds for
it, reuse that evidence; otherwise observe privately. The candidate neither publishes evidence nor changes the
applied recipe/drawing. Source replacement, Cancel and panel closure release superseded work. Refresh targets the
candidate's assets/selection. After Apply the applied observation follows its ordinary lifecycle.

`SourceCandidate.facts()` returns current authorized facts for the draft. Creation seeding uses that accessor
inside the same guarded form action as Reference Apply; it never uses an arbitrary old cached answer. Change
Alerts and BAYTS observations do not write configuration. Their shared field-state/preservation helpers do not
merge incoming settings over saved consumer values or open drafts.

Optional `savedLayerSource` identifies what restored styles were made for, once per held recipe, never on a private
candidate. Preset reconciliation retains this source identity. Presentation evidence such as `ui.sourceEvidence`
is excluded from content/work/preview keys; pixel generation determines whether an image redraw is needed.

## Dependency-derived map sources

GUI types opt declared `directSources`/`displaySources` roles into `dependencyLayerRoles`. The shared
`dependencyLayerSources` derives one source per referenced asset/recipe ID; input panels do not maintain another
list. Names come from the recipe listing, saved display fallback or ID. These display sources do not add execution
edges. Layout-added sources have their own identity and remain independently editable.

Assigning a derived source to an area pins it with the layout write. If the input is later removed, an area already
showing that source keeps its pinned legacy entry; unused dependency-shaped saved entries are omitted and dropped
on a later layout write. Opening/Cancel writes nothing. Local styles and area assignments survive this ownership
boundary. Full recipe loaders still mount for saved sources no area shows; lazy acquisition remains future work.

A failed source load is logged and displayed with the shared safe error formatter. A missing/inaccessible record
is marked at its saved source entry rather than repeatedly notifying or deleting it. It is not proof of deletion.

## Recipe selector loading

`RecipeInput` owns project grouping, filtering and self-reference validation. Its callbacks request only the work
the caller consumes:

| Callback | Work |
| --- | --- |
| `onChange(id)` | Selection only. |
| `onRecipeLoaded` | Authorized record read, no bands. |
| `onBandsLoaded` | Record and band read. |

No loading callback means no acquisition; two callbacks share their record read. Selection changes/unmount cancel
superseded work. Required/self-reference validation is independent of loading. ALL expands project scope, never
eligibility. Candidate acquisition that supplies other panel fields belongs to the panel lifecycle, not whichever
selector happens to be visible.

A panel deriving related settings keeps one selection/proposal/readiness record, compares it with the current
field value at submit time and publishes selection plus extra updates atomically. A failed, pending or superseded
proposal commits nothing. Apply, Enter and wizard forward steps share the guard; Back/Cancel commit no proposal.
Opening an existing recipe acquires presentation, not a new defaults proposal.

Source-kind controls use shared `SourceKind`/`SourceTypeButtons` in the label row. The form owns values, clearing
policy, candidate validation and what the current picker loads; opening establishes initial kind without an edit.

## Retrieve integration

`withRetrieveOutput` reads and watches the canonical output for every Retrieve panel. Image-band choices,
selection translation, destination compatibility and policies use `retrieveOutput` over that one read. A
non-image-band request such as Time Series indicators takes `outputDecision` without band selection, still
sharing readiness, validity, listing, asset and save authority. Indicator offers/holds remain request-specific.

Pending/failure provides no authoritative choices. Once an answer succeeds, reconciliation removes unavailable
saved choices without replacing them arbitrarily; an explicitly empty selection never means all bands. Labels
and groups decorate choices but cannot add or suppress available bands. CCDC measures and Slice combinations
translate through their producer's rule to explicit physical names before validation.

Array bands permit Earth Engine asset export only. Drive/workspace need verified scalars. Earth Engine requires
per-band pyramiding policy; explicitly reviewed fallbacks apply to verified scalars only, never to unresolved
shape or failed acquisition. The same selected band records decide policies, destination and submission names.
Encoding is not GUI authority: the server establishes it independently.

Acceptance runs before form persistence or closure and reads the current recipe/output/evidence from the store.
Submission decides again before sending. Destination preparation, task creation and remembered settings do not run
for a refusal. Confirmed source/configuration closure behavior follows
[source resolution](source-resolution.md#consumers); incomplete selections/destinations stay repairable inside Retrieve.

The listing must be current and dependency drafts must agree with acknowledged storage. Source observations made
under replaced credentials or superseded recipe/asset evidence authorize nothing. The browser graph is still
preflight: server execution reads its own records and may see later versions. Coherent task acceptance remains
[target work](source-resolution.md#coherent-execution-bundles).

## Recipe-scoped panels and navigation

Recipe supplies modal scope once through context. Ordinary panels and nested dialogs inherit it automatically;
account login and landing/project management declare application-wide exceptions. Outside a recipe, application
scope is the default. Existing Portal/Panel/activation mechanisms supply placement; no per-recipe modal registry
or migration list is needed.

Each tab has a dialog portal beside its ordinary content portal. Open recipe dialogs make covered content and
lower dialogs `inert`. Hidden tabs are inert, and modal interaction context also governs document shortcuts and
globally portalled popups. Visibility follows the owning tab/section transition, avoiding a map flash during
section navigation. Only the active owner's top dialog responds.

Tab/section navigation preserves unapplied fields, open dropdowns and nested dialogs without Apply/Cancel/reset.
Clicks on tabs, menu or footer are navigation rather than backdrop dismissal. An application override applies to
its whole subtree. Desktop return restores focus; mobile intentionally drops focus under the existing keyboard
policy. Keyboard traversal cannot enter covered controls, while navigation remains reachable.

Closing a recipe tab with an open modal panel reveals that tab and asks the user to Apply or Cancel first. The
same guard covers ×, middle-click and the close shortcut, including untouched panels. With no dialog open, normal
recipe save/close handling applies. Browser-window close warnings for unapplied drafts remain outside this contract.

The shared selector's Open action and validation recipe links use `openRecipeById$`:

- An existing tab is focused without rereading or overwriting its draft.
- A closed dirty/unsettled draft is retained. Otherwise an authoritative load initializes content and revision
  together before opening a new tab; existing-tab checks repeat when the answer arrives.
- Failure changes no field, tab or originating draft. Button display and selection alone add no navigation reads.
- Recipe names retain IDs until the shared feedback renderer. Plain text is never parsed to guess a target.
  Known links work by mouse, keyboard and touch; Enter does not submit the originating form.
- Shared field/list error indicators open interactive tooltips; plain warnings keep ordinary focus explanations.
  Tooltip uses the common modal-interaction owner so hidden/covered panels leave no live popup or blur exclusion.

These interactions change no applied recipe, validation or save semantics. An untouched processing subdialog uses
`setInitialValue` to establish its baseline, so Close is offered until a real edit makes Apply/Cancel appropriate.

## Performance and target extensions

Context remains stable across catalogue updates; no large model is serialized or cloned on render/store changes.
With no active operation/watch, Redux actions do no runtime work. Active watches compare relevant references and
recompute only affected questions; one-shots retain their captured seed. Network work starts from subscribed
operations, not property getters or React effects.

Future `watchSource$` and `querySources$` may generalize source/capability discovery if a real consumer needs them.
Do not change the cold one-shot into a live stream or add a panel-local cache. Authorized summaries, richer
product fingerprints, executed-edge acquisition and batch/closure transport extend existing boundaries rather
than exposing Redux/catalogue internals to callers.

Open decisions are whether routine token-container replacement warrants an authentication-owned identity epoch,
which consumer justifies a generalized discovery API, and whether measured graph sizes require revised limits.
Verification belongs to owner-boundary tests plus browser checks for actual portal, focus, native keyboard and
transition behavior. A DOM test alone cannot establish layout or inert behavior across browser engines.
