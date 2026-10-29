# Source freshness, caching and invalidation

The current live runtime shares descriptions and observations, tracks recipe revision/save agreement and asset
metadata evidence, and invalidates authority synchronously. Persisted derived-result freshness is target work
specified separately below. [Source resolution](source-resolution.md) owns authorization, graph structure and
execution guards; no cache provides task atomicity.

## Current design

A source version is change evidence, not a frozen image. Keep recipe `revision`, local draft identity, asset
`updateTime` and contract version separate. Recipe timestamps are display/audit metadata. Content/evidence changes
invalidate relevant descriptions; presentation changes do not imply new pixels.

## Output watches

The Process-scoped source runtime owns watches for every active recipe output question. A question is a recipe ID
and its normalized product identity; canonical output and named products remain distinct. Watching is separate from
loading: a configuration-only description can be answered locally and still registers interest in its dependencies.
Map layers and Retrieve watch through the runtime (`sourceRuntime/outputRegistry.js`); neither owns loading.

The API is `watchOutput$({recipeId, product})`, a reference-counted notification stream;
`heldFor(key)`, a pure synchronous lookup; and `retryOutput({recipeId, product})`, an explicit retry of a failed
current answer. Watches with equal existing work keys share one operation. Reads, renders and additional subscribers
do not themselves retry failures. The one-shot runtime operations and common read remain available.

- A locally answered watch starts no network work. A loading watch has no terminal; a settled watch holds READY,
  INVALID or UNAVAILABLE. Rejection of a terminal's basis must leave a settled failure with a defined recovery path,
  never LOADING with no operation running. Preserve protection against repeatedly loading a refused basis.
- Relevant content changes withdraw old authority immediately. Results must match the current work key, credential
  epoch and compatible basis. `heldFor` checks currency synchronously, including expiry and credentials, before a
  timer or component update has reacted. Apply uses the same current read.
- Closing one consumer cannot cancel shared work another still needs. Cancel and discard unfinished work when its
  last claimant leaves, counting claims across all questions sharing it.
- Retain settled READY and INVALID entries for a configurable **60 seconds** after their last release. Retain at
  most **32 unclaimed entries**, configurable, evicting the least recently released first. Active entries are not
  evicted. Pure lookups do not extend retention. Unclaimed entries perform no loading or monitoring; reopening
  recomputes the current question and validates reuse rather than restarting an old snapshot.
- Hold UNAVAILABLE while claimed, so failure is visible rather than indefinitely pending; discard it at zero claims.
  Retry on explicit request, relevant key/credential change, or reopening after the failed entry became unclaimed.
  INVALID clears on a relevant key change or eviction. No stale successful answer authorizes preview or export.
- Credential changes clear retained entries and restart only claimed work, once. Runtime teardown reports
  `SOURCE_RUNTIME_UNAVAILABLE`, stops all watches and work, and cannot start a retry loop.

## Recipe revision currency and shared observations

Revision evidence is the best this session has, not what Earth Engine read: `/bands` reports no dependency
manifest, and storage can move between the listing, the browser's load and Earth Engine's own load. Answers are
withdrawn when evidence arrives that supersedes what they were read from; a change no evidence reports remains a
deferred execution race.

- **Evidence.** Each work keeps a ledger of the records it read (`sourceRuntime/recordCurrency.js`): the session's,
  from when it was created, and every record its closure seeds or loads privately, as it arrives. A record is a draft
  while it is open, and while its saves are unsettled even after its tab closes: closing a tab does not make storage
  hold it. The newest revision known is the newest the listing, an acknowledged save or a cached copy that is not a
  draft says, so an acknowledgement supersedes what was observed before it, in its own dispatch. A draft is
  recorded at the newest revision known, with whether it agrees with storage; a record that could not be read, at
  the revision known when it failed. An entry is superseded by a newer known revision, or when a recipe listed when
  it was read is listed no longer. Unlisted is not deleted: the work is loaded again, which establishes availability,
  and a recipe that was never listed says nothing by staying unlisted.
- **Withdrawal.** A session change that supersedes an entry discards the work whether it has settled or not; its late
  terminal installs nothing and its questions load again, and only those. `heldFor` checks the ledger when it is
  asked, so Apply in the dispatch that brings the evidence finds nothing current, and an answer retained while
  unwatched is not reused. A record arriving older than a revision already known is loaded again once; storage
  answering the same revision again is held as `SOURCE_REVISION_BEHIND` rather than loaded again.
- **Cached records.** A closed record the session caches is read again before anything is answered from it when the
  listing knows a newer revision or has withdrawn its recipe (`REFRESH`, shared, held and retried like any work). The
  runtime retains no cache entry: a response replaces only a copy that is present, not a draft and older when it
  arrives, and otherwise stays private (`recipeCache.js`, the rule `recipeAccess` uses too). A draft - open, or closed
  with its saves unsettled - is never replaced by any read of storage, and source evidence does not ask for one.
- **Save evidence.** The save coordinator publishes what each recipe's saves have made persistent
  (`process.saveStates`): SAVED, SAVING, FAILED, CONFLICT or UNRESOLVED, with the model persisted at the acknowledged
  revision. That model is always the draft's own model object: the one a coherent load writes into the session (on
  its own path, so the store gives it a change identifier), the one a save sent, whether acknowledged or recovered by
  a load showing what was sent, or the equal model autosave found replacing it. The store copies what it publishes
  but keeps the change identifier (`~/hash`), so the copy agrees with the draft it was taken from without comparing
  content. An acknowledgement with an edit queued behind it publishes SAVING, never SAVED, and an
  acknowledged revision is written onto a draft only while the draft is the content acknowledged. After 60 seconds a
  wait is reported unconfirmed, measured from the oldest content not yet acknowledged; nothing is cancelled, retried
  or given up because of it, and a later acknowledgement ends it. A draft agrees with storage only when its model is
  the persisted one, nothing is queued and no newer revision is listed (`draftAgreement.js`).
- **Listing refresh.** The recipe listing is the revision evidence (`recipeListing.js`, `listingRefresh.js`). One
  request at a time. An output watch opening, or a Retrieve mounting, refreshes a listing older than 60 seconds at
  once, as does the browser becoming visible or reconnecting; opening a recipe counts through the watches its layers
  open, and nothing else in Process triggers a refresh. While anything is watched, a refresh starts 30 seconds before
  Retrieve's 5-minute authority lapses - headroom, not a guarantee that a slow refresh never blocks - and the lapse is
  published if it comes. Evidence dates from when its request started. A failure is kept until a success; an explicit
  retry refreshes a failed listing, and the same bounded interval schedules another attempt after a failure, before
  the first success too. Reads and Apply start nothing. Every listing response is merged, the session's first and those
  answering a move or project removal included: revisions only advance and an entry's fields stay with its newest
  revision; an id changed here after the request started, with a save outstanding, or whose saves moved on while the
  request was in flight keeps what this session did with it; locally set fields are kept; and ids the listing stopped
  listing are recorded as withdrawn. Refreshes, moves and project removals can overlap and answer in any order: a
  response whose request started before evidence already merged changes no membership and no withdrawal, only
  bringing entries up to newer revisions, and local-change markers are kept for every response still to come. The full listing is used; its size is logged at debug level.
- **Retrieve.** Authorized only while the listing is under 5 minutes old and every dependency draft agrees with
  storage. A save in flight is waited for; an expired or failed listing, and a save unconfirmed, refused, conflicting,
  unresolved, never made, or behind a newer stored revision, each block under its own code
  (`REVISIONS_EXPIRED`, `REVISIONS_UNAVAILABLE`, `SAVE_UNCONFIRMED`, `SAVE_FAILED`, `SAVE_CONFLICT`,
  `SAVE_UNRESOLVED`, `UNSAVED`, `REMOTE_NEWER`). Being open is no reason to block.
- **Shared observations.** `observeBands$` goes through one registry (`sourceRuntime/observationRegistry.js`). An
  observation is identified by what is asked of which reference, the recipe exactly as sent less what Earth Engine
  never reads, the evidence about every record Earth Engine reads for it itself, the assets it reads, and the
  credentials. Equal requests share one request while in flight. An answer is kept only over complete evidence -
  every dependency at a known revision, none a draft that disagrees with storage, whose references may differ from
  the persisted ones - and only if nothing superseded that evidence while it was asked for. Kept answers are reused
  for at most 5 minutes after they were observed and 60 seconds after last use, at most 64 of them, and only while
  nothing known supersedes their evidence - all decided when reuse is asked for, with timers only cleaning up. These
  bound reuse, not the freshness of a description already held. Failures are never kept.

The browser describes dependency drafts while Earth Engine executes persisted dependencies. Sharing does not hide or
resolve that: an incomplete observation is never reused, and Retrieve waits for or refuses a draft that storage does
not hold. Masking's evidence reads presets only; its bands are its description's.

## Asset freshness and drawing currency

What this session knows of the Earth Engine assets its consumers read decides whether a description is still about
them, whether Retrieve may be authorized by it, and whether a preview must be drawn again. Description recomputation,
structural dependency checks and pixel redraw keep separate triggers: an asset change never re-runs the dependency
closure check, which reads recipes, not assets.

- **Evidence.** The source runtime holds, for the credentials it was read under, what is known of each asset an active
  consumer reads (`process.assetEvidence`; `sourceRuntime/assetEvidence.js`). An asset's token is its metadata
  `updateTime` exactly as the Cloud API reports it, read without any evaluation (`POST /api/gee/assetVersions`, at
  most 50 ids, four at a time). Tokens are opaque and compared for equality only; a matching token is evidence, not
  proof. A Cloud GeoTIFF (`gs://`) or an asset whose metadata carries no token is unversioned: it is answered
  without a request and never fails merely for lacking a token. A missing asset and one these credentials may not
  read are definitive failures, anything else transient; neither says anything beyond these credentials.
- **Interest.** A watched output claims every asset its session graph reaches - an output described from configuration
  alone included, since its pixels are still read from them - and every asset its work's closure read, records
  loaded only for that work included (`assetInterest.js`). Evidence observers and direct asset layers claim their
  own. `ASSET_BOUNDS` names no asset of its own; the owner's sources are tracked. Releasing the last claim stops
  polling at once; the evidence is kept 60 seconds for a consumer reopening, then forgotten.
- **Polling.** Claiming an asset, or the page becoming visible or reconnecting, reads evidence older than 60 seconds.
  While claimed and the page is visible, evidence is read again 30 seconds before its 5-minute authority lapses - every
  4.5 minutes - and the lapse itself is published. Nothing is polled while the page is hidden. Reads are batched across
  consumers, and a failure is retried on the same interval, from a trigger or on an explicit refresh
  (`assetRefresh.js`). Only the latest request issued for an asset is accepted, whatever order answers arrive in, and
  nothing read under replaced credentials is: replacing them cancels every read in flight, keeps evidence per
  credentials and reads every claimed asset once. Closing the runtime settles every read awaited and publishes nothing
  after. A new
  catalogue `updateTime`, or an asset gone from the asset catalogue, reads that asset at once.
- **Known mutations.** An asset this session created, deleted or renamed, with the folder or collection holding it
  (`assets.mutation`, written by the asset browser; `widget/assetMutations.js`), is stale at once: it authorizes
  nothing until a read answers differently. It is read at once and again 3, 10 and 30 seconds later while nothing
  different has been answered, since Earth Engine takes seconds to report a change, and then what was read stands. No
  token is ever made up. Releasing the last claim on an asset ends its follow-up reads; claiming it again while its
  evidence is still stale resumes them from the read due by then.
- **Failures.** A description, preview or metadata read that failed naming an asset it read, or asking for bands an
  image does not hold, reads that asset - or, for missing bands, every asset it read - again, at most once per 5 minutes
  unless its token changes meanwhile (`assetFailure.js`). An expression error, an invalid configuration or any other
  failure reads nothing. A changed token withdraws the failed answer with the rest, so it recovers by itself; an
  unchanged one leaves the failure held, recoverable by an explicit refresh. The read is only a check: what it answers
  decides whether the asset is missing, not the failure's wording.
- **Description currency.** A describing work records the assets its closure read, with the token known then, beside
  its recipe ledger (`sourceCurrency.js`). A different token, a token change seen after it was read, a definitive
  failure or an explicit refresh of the asset or of the output withdraws it in the dispatch that reports it, and
  observation keys carry the same tokens and refreshes, so nothing kept is reused. An explicit refresh of an output is
  identified by its recipe as well as its count, so one recipe's refresh never reuses what another's observed; outputs
  never refreshed still share observations. Nothing is observed again for
  age alone. An asset found missing makes every answer reading it UNAVAILABLE (`ASSET_UNAVAILABLE`), including one
  described from configuration alone.
- **Retrieve.** Authorized, in addition, only while the evidence of every asset the held description's closure read
  is under 5 minutes old and neither failing nor stale. A source without a token reports no change, so a description
  read from one authorizes nothing once it was read 30 minutes ago, until it is refreshed. A read in flight is waited
  for (`ASSETS_PENDING`); expired or failed evidence blocks (`ASSETS_EXPIRED`, `ASSETS_UNAVAILABLE`), naming the asset,
  and Apply decides from the same read. Assets supplying only pixels establish nothing an export is authorized by. Task resolves its own inputs;
  nothing here claims its pixels match, or validates browser-supplied policies.
- **Drawings.** A drawing stays until there is a reason to change its content: a change to a record it computes, to
  how it is visualized, or to an asset it reads - a token differing from one read before, not the first token
  learned (`recipe/pixelGeneration.js`) - or an explicit refresh. Nothing redraws for elapsed time, for a check or
  observation that found nothing changed, for replaced credentials - which change how later requests authenticate,
  not the pixels shown - or for a check, metadata read or description that failed for now: the drawing is kept while
  its answer is read again or cannot be had, as long as nothing it was drawn from changed. A drawing kept authorizes
  nothing; band choices, editors and Retrieve follow the read. An asset found missing withholds it. A change no source
  reports - a public collection the recipe types read implicitly being reprocessed, a fixed implementation asset, a
  rewritten Cloud GeoTIFF - stays unseen until an explicit refresh. Pixel charts over segments follow the same rule.
- **Explicit refresh.** Recipe and direct asset layers offer Refresh in the visualization selector, and Retrieve offers
  it when blocked. It reads the metadata of every asset the question reads, then observes again, reads presentation
  evidence again and draws again, unchanged tokens notwithstanding (`process.sourceRefreshes`). A refresh in progress
  for the same question or asset is joined. `retryOutput` still only retries a failed answer.
- **Presentation.** The selector says "Checking asset…" while a failed or stale asset is read again, names an asset
  found missing - whose previews are withheld - and warns of one that could not be checked: its drawing is kept, the
  visualization editor with its histograms and value legends is withheld, and cursor values, which read the drawn
  tiles, continue. Retrieve names the asset and offers Refresh. A read reporting the same token again restores
  authority without drawing again.
- **Credentials.** Replaced credentials clear the asset evidence and the runtime's work as before, so nothing read
  under the old ones authorizes anything; the session cannot tell a renewed token from another account, since both
  replace the credential container. Logout and account-switch cleanup are the application's and unchanged.
- **Evidence observers.** Presets, templates and prefill are read again when an asset's token changes, on an explicit
  refresh, on a credential change, and 30 minutes after a read from an unversioned source, none of which redraws
  anything (`evidenceRegistry.js`);
  a token first learned after a read is no change. `ui.sourceEvidence` is presentation evidence only: it is in no
  content, work, basis or preview key and carries no counter, and an observer over another recipe reads again when that
  recipe's evidence content changes.

Collection metadata tokens can lag writes. Session-mutation follow-ups and polling handle propagation;
the token is not proof that every external operation advances it. Export overwrite, API copy/move/rename, ACL
changes, public catalogue ingestion and rewritten GeoTIFFs need their own verification. An unreported pixel change
remains unseen until explicit refresh.


## Recipe storage contract

The authorized Recipe service returns committed revision alongside list entries and loaded content. A load reads
content/revision from one row; revision is response/column metadata, never a field the client controls inside stored
content. Saves carry `expectedRevision`; acknowledgements return the committed revision. The same revision must
represent the same execution-relevant content. `typeVersion` remains schema versioning, and project movement is
row/display metadata rather than execution content.

The GUI serializes each recipe's saves, coalescing queued changes rather than cancelling an in-flight write that
may already have committed. A lost acknowledgement is recovered by loading and comparing the sent content with
committed content. Adopt its revision only when they agree; otherwise preserve the draft for conflict handling.
Never blindly retry against a newer remote revision. A dependency draft agrees with storage only when its current
model was acknowledged, nothing is queued and no newer revision is known.

The session cache releases an unclaimed closed record after its save settles. A dirty, unresolved or conflicting
draft remains retained; completion must not discard the only copy of user work.

Semantic no-op detection is not implemented at storage. The target is normalized equality before conflict checking:
already-committed identical content succeeds with its existing revision; changed content still needs the expected
revision. Define normalization first—exclude transient UI state, preserve meaningful array order/types, ignore
object-key order and version migration/default semantics. Raw JSON/gzip equality is not authority. No-op behavior
improves convergence/event noise but persisted-result correctness cannot depend on it.

Listing absence triggers an authorized availability read; it does not establish deletion or permit overwriting a
local draft. Keep dependency snapshots private to an operation rather than writing them into the editing cache.

## Target: persisted-result freshness

The following result-evidence and product-fingerprint machinery is not yet implemented for Sampling Design.
Current edit-driven result invalidation remains until replaced by this contract. Do not add a temporary browser
content-hash bridge or use `update_time` as an intermediate freshness tier.

### Snapshot authority

The exact submitted root may be an unsaved draft. Referenced inputs for persisted calculations are fresh,
operation-local persisted records keyed by revision, not arbitrary open dependency drafts. If draft dependencies
are ever supported, execution must consume that same frozen closure explicitly.

Never overwrite `process.loadedRecipes` with private calculation snapshots. Local root identity is an O(1)
immutable-model generation, not full serialization/hashing during renders or ordinary store updates. Refresh
revision evidence on open/resume and before submission. An unchanged authoritative vector avoids content loads,
not the evidence-refresh request itself. A save acknowledgement, not an uncommitted dependency edit, advances a
persisted calculation's dependency evidence.

### Product-scoped fingerprints

Revision changes trigger product re-resolution; the resolved operation-input fingerprint decides whether an
expensive result is stale. Putting revision directly in that fingerprint would force recalculation for a rename.

Compare the normalized question, relevant contract versions, recipe revision evidence, current asset evidence and
inline inputs. Product owners project what matters; consumers never maintain lists of foreign model fields. An
unmigrated product may conservatively fingerprint whole normalized persisted-source content once after a relevant
change. It may over-invalidate but cannot silently miss a dependency. No per-render whole-model hashing is allowed.

Explicit AOI products should follow actual geometry behavior—including transitive inputs—rather than assuming a
referenced recipe's `model.aoi` is its geometry. Until shared provider/executor projection exists, whole-source
fallback is conservative. A content digest is optional integrity/provenance work, not a substitute for revisions.

### State axes

Keep source observation currency, derived-result comparison and runtime usability distinct:

- Observation: pending, current, refresh-required, refreshing, transient or definitive failure.
- Persisted result: `CURRENT`, `STALE` or `UNKNOWN`.
- Runtime description/readiness: the existing shared statuses, not a new saved validity flag.

A failed refresh does not prove calculation inputs changed. Keep last successful values as context while refusing
unsupported authority. Epochs reject superseded answers even when a transport cannot actually cancel them.

### Declarative dependency evaluation

Extend the existing shared requirements with recipe-owned pure input projections, conditional dependencies and
derived outputs. Local and external inputs differ in acquisition/versioning, not in whether the evaluator can
judge them. Band Math consumes expression-referenced bands; Sampling Design manual proportions consume identities,
not colors or row order. Reuse their domain analysis instead of inventing a rule language.

Derive diagnostics from current inputs and map them to the owning section. Cheap output may recompute; expensive
stored results use operation-produced evidence. User-authored choices are neither calculation caches nor disposable
normalization targets. Distinguish compatibility, freshness and a user decision needing review. Migrate concrete
workflows incrementally and replace superseded caches/flags rather than running parallel mechanisms.

## Persisted derived-result evidence

A result that must remain valid after its panel and recipe close stores the evidence from which it was calculated.
The envelope is generic even though each operation defines its own inputs:

```js
{
    result,
    calculatedFrom: {
        resource: {id: 'SAMPLING_STRATUM_AREAS', contractVersion: 1},
        question: {/* normalized operation parameters */},
        inputFingerprint: 'resolved-operation-input-fingerprint',
        sourceEvidence: {/* named source roles and observed versions */}
    }
}
```

`sourceEvidence` records calculation provenance; `inputFingerprint` decides whether the result still answers the
same question. A recipe or asset version change first invalidates current catalogue evidence and causes
re-resolution. If the new operation-input fingerprint is unchanged, retain the result without rerunning the
expensive calculation. Do not rewrite `calculatedFrom` to imply that calculation happened against the newer source
revision; current observations belong in the catalogue, separately from persisted calculation provenance.

Persisted evidence is bounded metadata, not embedded recipe content. It contains normalized references, opaque
version tokens, contract identities and fingerprints under named roles. Large reference-data arrays, selected-scene
lists and complete source models remain behind their authorized source boundaries.

Comparison uses the `CURRENT | STALE | UNKNOWN` axis defined in [State axes](#state-axes), independently of
catalogue observation and runtime validity. A transport failure does not prove that the inputs changed, and a stale
result does not make its source command invalid. A legacy result without `calculatedFrom` is `UNKNOWN` and requires
one recalculation before it can establish durable freshness. Likewise, an asset without reliable replacement
evidence cannot establish cross-session `CURRENT` merely because its ID and schema still match; the consumer must
recalculate or acquire stronger evidence under its declared policy.

Consumers decide presentation and policy. Sampling Design keeps stale and unknown values visible for context while
blocking submission and asking for recalculation. Preview may refresh automatically. Retrieve requires current
evidence before enabling submission. The shared resource layer reports evidence and state; it does not choose those
actions.

`UNKNOWN` blocks submission exactly as `STALE` does. A result without usable evidence cannot truthfully be declared
current, and the conservative reading is the only honest one. This has a stated migration consequence: every
Sampling Design result that predates `calculatedFrom` is `UNKNOWN` on first open, so each such recipe needs one
recalculation — potentially a batch calculation — before its next submission. The existing values stay visible as
context throughout.

### Exact calculation evidence

`calculatedFrom` is produced by the calculating operation, not from an independent browser read taken before or
after it. Otherwise a source that changes between the two reads yields evidence describing inputs the result was
never computed from — a result that reads `CURRENT` for a question it did not answer.

Recipes and Earth Engine assets support different strengths of claim, and the design must not blur them.

**Recipe snapshots are exact.** The execution boundary keeps a **request-scoped recipe snapshot cache**:

- one raw recipe snapshot and revision per recipe ID per operation;
- one shared in-flight load for duplicate dereferences of the same ID;
- transitive recipe loads included;
- edge-specific recipe factories may be constructed repeatedly from the same snapshot;
- the returned recipe revision vector describes exactly what was loaded.

**Asset evidence is contemporaneous observation, not a snapshot.** An operation records the asset observations it
made, such as `system:version`, and revalidates them before the result is committed. An asset version is
invalidation evidence, not an immutable execution version: it does not pin the pixels Earth Engine evaluates, and
an asset replaced between observation and evaluation cannot be excluded by evidence alone. Revalidation narrows
that window rather than closing it, and the existing rule stands — asset IDs and observations are invalidation
evidence only.

Around both:

- the GUI rechecks current evidence before committing the result;
- a superseded response is discarded or retried;
- Retrieve performs fresh revalidation before submission.

Because the storage contract guarantees that one revision always yields the same execution-relevant content, a
fingerprint the GUI computes from its own load of a revision describes the same inputs the executor used at that
revision. That guarantee is what makes the two readers interchangeable; without it, returning revisions would not
be enough.

Memoizing per ID also removes the possibility of one operation mixing two revisions of the same recipe, so no
separate conflicting-read detection is needed — one snapshot per ID makes the conflict unrepresentable.

The existing operation-owned recipe reader supplies record sharing. Extending its output with exact calculation
evidence is separate work; a browser observation taken before execution cannot stand in for that evidence.

Task atomicity remains separate. Persisted execution bundles are target design, not a guarantee of current tasks.

## Sampling Design integration

Sampling Design is the first persisted derived-result consumer. It supplies two named resource descriptions while
the shared layer owns source evidence, fingerprints, in-flight sharing, replay and stale-response rejection.

Stratum areas depend on:

- the resolved AOI geometry product;
- the resolved stratification image product and selected band;
- the configured Stratification CRS and Scale;
- the contracts that define those products and the area calculation.

Per-stratum probabilities depend on:

- the resolved AOI geometry product;
- the resolved stratification product, band, CRS and Scale when stratification is active;
- the resolved categorical or probability source product and selected bands;
- the proportions mode, target class and configured Proportions Scale;
- the contracts that define those products and the probability calculation.

The two Earth Engine calculations are stratum areas and per-stratum probabilities. Anticipated proportions are
derived locally from the probabilities together with the percentage interpretation, the overall-proportion target
and the current stratum weights, and are rewritten by ordinary form edits without any Earth Engine call. Evidence
therefore belongs to the calculated probabilities; anticipated proportions inherit staleness through that local
derivation, as one of the downstream propagations Sampling Design owns.

The source used only to calculate probabilities is an operation-scoped dependency. It does not become a general
execution edge of the final Sampling Design product merely because its values are materialized into the recipe.

AOI evidence is derived by AOI kind:

- an inline polygon uses a canonical geometry fingerprint;
- an Earth Engine asset or table uses its reference, geometry-affecting selection and `system:version` when
  available;
- a recipe reference resolves the AOI geometry product exposed by that recipe, including relevant transitive recipe
  and asset evidence;
- `ASSET_BOUNDS` binds to the concrete source product whose bounds it adopts;
- a GeoID uses its id and buffer: its geometry is immutable under the GeoID service's contract, so the
  GeoID is its own fingerprint and is never polled. Looking it up can still fail during execution; that is an
  availability failure, not a change.

For a recipe AOI, Sampling Design never decides which fields of the referenced recipe affect geometry. The recipe's
product provider owns that projection. A changed recipe revision says only that the AOI may have changed; after
re-resolution, unchanged AOI evidence leaves the areas current.

The AOI geometry product is the abstraction, but the first milestone does not reimplement every runtime geometry
rule in the browser. Until a recipe type has a shared AOI-product declaration used by both GUI resolution and
executor execution, its fallback is conservative whole persisted-source evidence. "Unrelated edits keep areas
current" is therefore a capability of migrated product providers, not a universal guarantee: a conservative
provider may mark such an edit stale. It must never infer a narrow projection from a consumer-maintained field
list.

Evidence is persisted as section-level sidecars written atomically with the results they describe, leaving the
existing arrays and their owner-first joins untouched:

```
model.stratification.strataCalculatedFrom
model.proportions.probabilityPerStratumCalculatedFrom
```

The generic `{result, calculatedFrom}` envelope is conceptual. Do not wrap or relocate `strata`,
`probabilityPerStratum` or `anticipatedProportions`; their persisted ownership and legacy joined-row compatibility
stay exactly as they are.

Suppose recipe B stores Sampling Design areas calculated from an AOI exposed by recipe A. A may be edited and closed
while B is not open. When B is opened later, the runtime refreshes the revision vector for B's dependencies. If A's
revision is unchanged, the areas stay current with no content load. If it advanced, A is reloaded, its AOI product
re-resolved, and the new operation-input fingerprint compared with B's `calculatedFrom` evidence. A mismatch marks
the areas and their dependent calculated results stale. A and B never need to be open simultaneously, and no update
event or patch stream is required for this check.

Sampling Design-specific code owns the two dependency descriptions, how stale areas and probabilities propagate to
anticipated proportions and allocation, panel messages, recalculation commands and submission blocking. The shared
graph owns closure and applies the recipe-closure limits it already defines; the shared freshness layer owns recipe
and asset observation, generic cache keys, request epochs and source-version subscriptions.

| Concern | Owner |
| --- | --- |
| authorized loading, edges, cycles and closure | shared graph |
| recipe snapshots and asset-version observations | shared freshness layer |
| AOI, image and capability declarations and fingerprints | product and capability owners |
| evidence comparison, replay, in-flight sharing and epochs | generic derived-resource layer |
| area/probability dependency questions and propagation rules | Sampling Design |
| stale presentation, recalculation controls and submission policy | Sampling Design |

The existing per-panel calculation caches are replaced by the generic derived resource, not left running beside it.
Stratum areas migrate first, then per-stratum probabilities; the old module is removed once both have migrated, so
two cache semantics never coexist.

## Resource retention and invalidation

Extend existing source-runtime ownership with one logical resource per kind and normalized question. Share one
in-flight calculation for exact inputs and retain at most the latest successful answer per active resource, or a
small measured inactive LRU. Reuse the runtime's identity, version subscriptions and epoch handling rather than
independent feature caches. Definitive invalidity can be held only for the evidence establishing it; transient
unavailability never becomes a reusable success.

Refresh only actively consumed sources. An unrelated recipe event does no graph work; a changed relevant revision
causes an authorized reload and product comparison. WebSocket revisions/patches are optional latency improvements,
not the only way to detect changes after a dependent recipe was closed. GEE caching, if justified, must preserve
principal and linked-account scope and cannot own long-lived GUI correctness.

Task-driven mutations should invalidate actual written/replaced/partly removed asset IDs through the shared owner.
That integration awaits the task rewrite's lifecycle audit; session mutations already work. Keep polling and
explicit Refresh for external changes and missed notifications.

## Verification and open decisions

Owner tests cover shared claims, independent close orders, retained-answer expiry, save/listing races, replaced
credentials, late replies, revision rollback/withdrawal, transient versus definitive asset failures and unchanged
drawings. Native/browser evidence is needed for visible redraw and panel interaction; live asset reads are needed
for token propagation behavior beyond the supported metadata contract.

Persisted-result work additionally needs exact execution evidence, AOI/image projections, legacy `UNKNOWN`
submission refusal, unchanged fingerprints after irrelevant revision changes and a dependency edited while its
consumer is closed. Never relabel browser preflight as exact executor provenance.

Open decisions include resource-specific retention/refresh budgets, additional product projections, unreliable
asset-version fallback policy, semantic no-op normalization and conflict presentation. The task drift/bundle
policies remain owned by [source resolution](source-resolution.md#coherent-execution-bundles).
