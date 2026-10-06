# Source freshness, caching and invalidation

Technical design for keeping live recipe and Earth Engine asset descriptions, and results derived from them,
current within and across interactive sessions. Resolution and frozen task execution belong in
[source-resolution.md](source-resolution.md).

## Responsibilities

This subsystem owns:

- session-scoped source-description caching;
- generic versioned derived resources built from source evidence;
- in-flight request deduplication;
- race-safe background refresh;
- account-aware Earth Engine metadata state;
- pending, fresh, refresh-required, refreshing and error catalogue states plus propagation of resolver diagnoses;
- consumer expectation revalidation;
- persisted evidence describing the inputs from which a derived result was calculated;
- map and panel invalidation when a resolved graph changes.

It does not own task atomicity. A Retrieve task consumes its accepted execution bundle even if the live catalogue
changes afterward.

This catalogue is not a prerequisite for the first Masking robustness slice, Apply-mask stabilization, constant
Fill or direct asset Fill.

Persisted derived-result freshness uses the server-owned monotonic `revision` that the Recipe service returns
atomically with recipe content. No interim unversioned-recipe tier is needed for Sampling Design freshness.
There is no temporary browser content-hash bridge, no `update_time` freshness rung and no dual-phase snapshot
provider that later swaps its evidence. `update_time` remains display and audit metadata only. Websocket revision
events and patch transport remain optional latency and transport improvements that correctness never requires.

## Shared output description delivery

Packets 1 to 3 are implemented; the broader persisted-result and coherent-execution design below still needs review. Use **description loading** and **description refresh** for
this work; acquisition also names a satellite observation in this application.

### Packet 1: shared watches and loading

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

Packet 1 preserves current conservative content keys, `ui.sourceEvidence` and external freshness behavior. A
refused basis is held as an `UNAVAILABLE` answer with code `SOURCE_BASIS_CHANGED`, recovered like any failure. The
tests cover local answers, sharing, both consumer-close orders, same-tick edit and credential change followed by a
read, late results, basis refusal, failure recovery, expiry before timer cleanup, the retention cap and product
switches ([verification](gui-source-runtime.md#verification)). Existing scalar/array restrictions, export policies
and named-product export refusal are unchanged.

### Packet 2: recipe revisions and shared observations

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

### Packet 3: asset freshness and redraw signaling

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

A live probe on 2026-10-01 (a disposable collection in one user project, one-pixel images) observed the collection's
own `updateTime` advance within 1.5 to 5.2 seconds for each of: a member added, a member deleted (not the newest, the
newest and the last), a member deleted and recreated under its id with other bands and pixels, a member's properties
edited and the collection's properties edited. A member's property edit gave the collection exactly the member's new
`updateTime`. Not exercised: export with overwrite, copy, move or rename through the API, ACL changes, rewritten
GeoTIFFs, ingestion into the public catalogue - whose members can carry the collection's own version - and anything
beyond one project. These are untested, not known failures. Within the propagation delay a read can still see the old
token; the mutation follow-ups and polling cover it.

### Execution boundary

Schema availability and structural validity do not prove executability. Missing dates, training data or required
references can prevent execution even with READY and VALID results, including through wrappers. Document this
boundary now. Requirements are validated in the GUI, before Apply and at Retrieve
([requirement contract](source-resolution.md#requirement-contract)), with no unused resource slot or new panel guards;
rechecking them at the execution boundary is not implemented yet.
Task continues resolving independently. Separately review its acceptance of browser-supplied band selections and
pyramiding policies, including whether policies should be derived or validated against its own description.

## Catalogue boundary

The pure source contract is storage-agnostic. The first catalogue-backed consumer decides whether Redux or a plain
observable store best fits existing GUI lifecycle and DevTools needs. React components consume selectors or
observables; they do not traverse dependencies, parse asset naming conventions or maintain copied source state.

Catalogue keys include:

- normalized source reference;
- authenticated SEPAL principal;
- linked Earth Engine identity or authorization context for assets;
- resolver, adapter, composer and capability contract versions where they affect the answer;
- collection schema policy where it changes the description.

The catalogue stores data and status, never active subscriptions or Earth Engine objects.

The browser catalogue is naturally scoped to one authenticated SEPAL session, but the principal remains part of
the logical key. Any adaptation in GEE, Task or another shared process must preserve that scope explicitly rather
than assume one process serves one user.

## Source versions and invalidation

A source version is change evidence, not a copy of the source and not a claim that Earth Engine execution is
pinned. Keep these values separate:

- **Recipe `revision`**: a server-owned monotonic integer, scoped to one recipe, changed atomically with
  persisted recipe content. It orders websocket events, supports optimistic concurrency and cheaply invalidates
  browser resources. It is distinct from the existing `typeVersion`, which is the recipe schema-migration version
  and says nothing about whether content changed.
- **Recipe timestamp**: display and audit metadata only. The current second-resolution `update_time` cannot order
  all saves and is not a cache key. It is never freshness evidence, not even negatively.
- **Local draft generation**: exact immutable recipe-object identity or an equivalent runtime-only generation. It
  invalidates results immediately for unsaved edits without pretending that the draft has a persisted revision.
- **Earth Engine asset version**: `{id, system:version}`, with the version normalized to an opaque string. It is
  useful invalidation evidence, not a timestamp and not proof that an execution is pinned to those pixels.

### Recipe storage contract

The Recipe service provides:

```
list                          ->  recipe ID + revision, per entry
load                          ->  the recipe, with the revision injected as an additive top-level field,
                                  read from one committed row
save(expectedRevision)        ->  committed revision
```

There is no separate snapshot or executor-facing read. The ordinary authorized load serves editing, dependency
resolution and execution alike, so every reader observes the same content and the same revision from the same
committed row.

Required semantics:

- `revision` is server-owned, monotonic and scoped to one recipe.
- Persisted content and revision change atomically.
- The revision is stored only as a column on the recipe row. It is response metadata, not persisted recipe
  content: a load injects the column value into the returned recipe JSON, stored contents never carry a
  revision, and a client-submitted one is stripped before storage.
- Content and revision are coherent because a load reads both from the same row, so no second representation
  exists to contradict the column.
- A recipe-model migration rewrites stored contents, and advances the column when it does.
- Project placement is row metadata injected on load in the same way. It is not execution content, and
  moving a recipe does not advance its revision.
- **The same revision always returns the same execution-relevant recipe content.** This is what allows evidence
  gathered by one reader to be compared against a fingerprint computed by another; see
  [Exact calculation evidence](#exact-calculation-evidence).
- Save acknowledgement returns the committed revision, and the GUI updates its revision registry from it.
- Existing rows may be backfilled with one fixed initial revision. That value carries no meaning: existing derived
  results are `UNKNOWN` because they lack `calculatedFrom`, and a backfilled revision never retroactively
  validates them.
- Display-only changes such as rename may advance the revision. Product fingerprint comparison
  absorbs that conservative invalidation, so the storage boundary needs no second display-only revision.
- Deletion receives the same ordered treatment as an update. After a *successful* authorized revision-list refresh,
  an absent referenced ID is a missing-source result, reported without disclosing foreign ownership. Failure to
  refresh is `UNAVAILABLE` and is never read as proof of deletion.

Idempotent save behavior, which the storage boundary does NOT yet implement - its save is the conditional
update alone, so a resubmission of already-committed content is answered as a conflict:

```
normalize candidate
if candidate equals current content:
    succeed and return the current revision
else if expectedRevision differs from current:
    reject with a conflict
else:
    persist and increment revision
```

The no-op comparison deliberately precedes the conflict check: a client that resubmits content already committed
converges rather than conflicting. Reordering the two produces spurious conflicts during ordinary editing.

Semantic no-op detection is desirable storage behavior, but Sampling Design correctness must not depend on it. If
it is phased in after the initial revision implementation, spurious revision increments only over-invalidate: they
trigger re-resolution, and an unchanged product fingerprint still preserves the result. Do not describe no-op
detection as unnecessary — it governs event noise, `revision` semantics and optimistic concurrency, and
client-side deep equality is not authoritative because direct clients and future writers can still submit no-ops.

Normalization must be defined well enough that raw gzip or JSON byte equality is never authoritative: transient UI
state excluded, object-key order irrelevant, array order preserved where it is meaningful, value types preserved,
and migration and default semantics versioned. Normalization excludes *transient UI state*, not display metadata:
a title lives in persisted content, which is why a rename legitimately advances the revision.

A persisted content digest remains optional and is not a freshness requirement. Add one only if a concrete
provenance, integrity, cross-record deduplication or immutable-content requirement needs exact byte identity. If
introduced, compute and store it at the trusted persistence boundary rather than serializing large recipe models
in the browser.

Future patch saves do not change this contract. A patch is transport, while revision remains persisted ordering.
The server applies a patch against an expected revision, validates and normalizes the result, and advances the
revision only when the final content differs. A patch may accompany an authorized update event as an optimization;
a client applies it only from the expected base revision and otherwise reloads. Freshness must remain correct when
only the recipe ID and new revision are announced.

The GUI serializes saves per recipe rather than cancelling an in-flight one, because a cancelled request may
still have committed. A save coordinator holds at most one request in flight per recipe and coalesces whatever
arrives while it is out, so an editing session advances through revisions it has been acknowledged rather than
guessing. A draft's base revision changes only on an acknowledgement or a coherent load, which is what keeps a
committed write, a safe retry and a conflicting remote write distinguishable.

If an acknowledgement is lost, recovery is currently the client's: the coordinator loads the recipe and compares
the committed content with what it sent, adopting the returned revision when they agree and entering the conflict
flow when they do not. Blind replay is not safe until the storage boundary detects a no-op, because the retry
carries a base revision the lost acknowledgement may already have advanced. Once that detection exists, replaying
the *exact same payload* becomes the one safe retry.

A conflict against content written by another session must never be retried blindly. Refreshing the registry to
the newer revision and resubmitting would overwrite that session's work with this one's. Preserve the local draft
and enter the explicit conflict flow instead; its presentation and merge policy belong to recipe editing.

One source-version registry consumes those events and asset-version observations. It knows current versions and
invalidation only; it does not resolve recipe graphs or own feature-specific results. Dynamic resources subscribe
to only the source references in their resolved dependency closure. An unrelated recipe event does no graph work.
When a relevant version changes, the resource cancels superseded work, resolves against one new snapshot and
publishes the replacement result.

If a remote persisted revision advances while the same recipe has unsaved local edits, retain the local draft and
record that a newer remote revision exists. Never overwrite the draft silently. Conflict presentation and merge
policy belong to recipe editing, while invalidating derived evidence belongs here.

## Snapshot authority

Consumers receive recipe snapshots through one provider that states which representation it is handing over:

```js
{
    reference,
    origin: 'ROOT_DRAFT' | 'PERSISTED',
    record,
    versionToken
}
```

- The explicitly supplied **root** may be an unsaved draft. Its `versionToken` is a local draft generation.
- Referenced recipes consumed by persisted derived calculations use fresh, **operation-local persisted snapshots**.
  Their `versionToken` is `revision`.
- An open referenced recipe's unsaved draft must never be fingerprinted while the executor runs against its
  persisted version. Binding a calculation to a draft that the executor cannot see is the defect this separation
  exists to prevent.
- Supporting draft dependencies later requires an executor that consumes the same frozen draft closure. It must
  never happen accidentally as a side effect of reading whatever the store already holds.

Dependency snapshots must not be written into, or overwrite, `process.loadedRecipes`. That map currently conflates
editable roots with dependency cache entries: an open recipe's editing state and a recipe loaded only because
something referenced it occupy the same slot, and its loader returns a cached record without re-reading. It is a
convenience cache, not freshness authority, and writing operation-local snapshots into it would overwrite live
editing state.

A local draft generation is an O(1) observation, not a hash: never stringify or hash an entire model on a render,
source request or store update. Observe the execution-relevant object — the model — rather than the whole recipe,
which also carries transient UI state such as map bounds, and rather than a shallow copy, which drops
non-enumerable identity markers. Where interior identity is not guaranteed, fall back to object identity.

A successful **save acknowledgement** is the in-session dependency trigger. A dependent calculation binds to
persisted content, so a draft edit to a dependency changes nothing until it commits, and the acknowledgement is the
first moment its new revision is known.

Revision refresh happens according to policy when the dependent recipe is opened, when returning after inactivity,
and when submitting Retrieve. The existing recipe list can initially supply the batch revision vector — every
recipe in a legitimate closure is owned by the same principal — but it must be re-fetched at those triggers rather
than trusted from session start, because another session may have advanced a revision since it was loaded. A
dedicated batch-revision read for a specific ID set is the natural refinement.

The precise claim is that **unchanged authoritative evidence avoids recipe-content loads**. Reopening still costs a
bounded revision-vector refresh; it is not free of HTTP.

## Product-scoped fingerprints

A source version answers whether a source may have changed. It does not answer whether the change matters to a
particular consumer. Revisions and draft generations are **invalidation triggers and provenance. They never become
the operation-input fingerprint.** Wiring a revision into the fingerprint would make every conservative or
display-only revision bump force an expensive recalculation, which is precisely what the fingerprint exists to
avoid. The sequence is always:

```
revision or draft generation changed
    -> re-resolve the consumed product
    -> compare operation-input fingerprint
    -> CURRENT or STALE
```

The quick `CURRENT` path must compare all applicable evidence, not only recipe revisions:

- the normalized operation question;
- resource and relevant contract versions;
- the recipe revision vector;
- refreshed asset evidence, including `system:version`;
- inline inputs such as polygon geometry.

The graph owns loading, authorization, edges, cycles and ordering. It does not interpret products. A recipe selected
as an AOI is a dependency through the AOI geometry it exposes, not through its undifferentiated model: the product
resolver asks for that geometry and follows any transitive references needed to describe it. A title, visualization
or unrelated algorithm change may advance the recipe revision without changing the AOI fingerprint.

Product fingerprints include normalized declarations, structured edge roles, relevant adapter, composer, capability
and transformation contract versions, and relevant asset observations. A provider that owns a product projection
fingerprints only that product's relevant normalized inputs. A provider that has not yet declared one may
conservatively fingerprint its normalized loaded execution content, computed once when calculating or after a
revision-triggered reload. That may over-invalidate, which is acceptable; hashing whole recipes on renders or
ordinary store updates is not. Narrow only at an owned product boundary; never maintain consumer-side lists of
supposedly relevant recipe fields.

Unknown relevance fails closed and over-invalidates. Once a product provider declares its inputs, unrelated fields
stay outside that product fingerprint by construction rather than through a heuristic data/schema/presentation
classification.

The fingerprint is derived evidence and cache identity. It may be persisted with the result it justifies, but it is
not authoritative source content and does not replace revision ordering.

Revision and fingerprint have different jobs. A revision says that persisted content changed; a resolved product
fingerprint identifies the inputs relevant to one derived answer, including dependencies, asset evidence and
contract versions. Do not substitute one for the other merely because both can be represented as strings.

Contract versions identify deliberate supported command or semantic evolution. They are not revisions of source
content and are not used to preserve historical implementation defects. Corrected behavior invalidates affected
derived resources normally; the cache does not select a legacy algorithm based on an old asset or recipe date.

## State axes

Three independent state spaces answer three different questions. Keeping them separate is what stops one word from
meaning two things:

```js
// catalogue observation - is our description of this source current?
'PENDING' | 'FRESH' | 'REFRESH_REQUIRED' | 'REFRESHING' | 'TRANSIENT_ERROR' | 'DEFINITIVE_ERROR'

// derived-result comparison - does this saved result still answer the same question?
'CURRENT' | 'STALE' | 'UNKNOWN'

// runtime - can this source be used right now?
'READY' | 'UNAVAILABLE' | 'INVALID'
```

`REFRESH_REQUIRED` means a historical source description exists but requires current validation. `STALE` means the
current resolved operation inputs are known to differ from the persisted calculation evidence. The first is "we
have not checked yet"; the second is "we checked and it changed". `STALE` is never a catalogue refresh state.

A catalogue entry keeps the last successful description separately from its current refresh state:

```js
{
    description,
    fingerprint,
    observedAt,
    status: 'FRESH', // PENDING, FRESH, REFRESH_REQUIRED, REFRESHING, TRANSIENT_ERROR, DEFINITIVE_ERROR
    error,
    requestEpoch
}
```

`PENDING` applies before any description exists. A transient resolution diagnosis does not erase the last successful
description or claim that bands disappeared. The catalogue preserves the transient or definitive classification
supplied by source resolution. Diagnostics carry stable codes and dependency paths.

## Refresh triggers

Refresh active sources:

1. when a recipe or source is opened;
2. immediately when a source selection or linked Earth Engine account changes;
3. when a dependency's save is acknowledged in the current GUI session;
4. when returning to an active recipe after browser-tab inactivity;
5. on a bounded timer for active asset sources;
6. before Preview or Retrieve when the current observation is older than policy allows;
7. on an explicit user Refresh command if a migrated consumer demonstrates that it is useful;
8. when a websocket event advances the persisted revision of an output-relevant recipe.

Triggers 1, 4 and 6 refresh the revision vector for the dependencies of the recipe being opened, resumed or
submitted. Trigger 3 is a save acknowledgement rather than a draft edit: a persisted calculation binds to persisted
content, so an uncommitted edit to a dependency changes nothing it depends on. Trigger 8 improves latency for
already-open consumers and is never the only path to discovering change.

Do not periodically resolve every transitive recipe graph through Earth Engine. A revision that has not moved needs
no content load; a changed revision causes an authorized reload and product re-resolution. Revisions alone never
settle a derived result — that decision weighs all applicable evidence, as described under
[Product-scoped fingerprints](#product-scoped-fingerprints). The
second-resolution recipe `update_time` is never used as evidence, in either direction. Asset refresh normally
starts with metadata and performs bounded runtime inspection only when the consumer contract needs it.

Only actively consumed sources need scheduled refresh. Inactive entries may remain for the GUI session.

## Race and traversal safety

Every refresh receives a monotonically increasing epoch. A response may update an entry only if its epoch is still
current. Cancellation is useful for releasing work but is not the correctness mechanism; a late response must be
harmless even when the underlying request cannot be cancelled.

Identical in-flight requests are shared. Graph resolution memoizes diamond dependencies, uses bounded concurrency
for independent branches, and applies the traversal limits defined by the resolution contract. A newer account or
source selection invalidates every older request before its response is considered.

## Asset freshness

Earth Engine asset IDs are stable while their metadata, schema, pixels and permissions can change. Cache entries
are scoped to the linked account. Account link, unlink or replacement invalidates affected entries immediately.

An asset's change token is its metadata `updateTime`, opaque and at full precision, for the whole asset - a
collection's included: the live probe saw a collection's own `updateTime` advance for every membership, schema and
property change it made ([packet 3](#packet-3-asset-freshness-and-redraw-signaling)), so no token is constructed from
a collection's members, size or newest member. It is invalidation evidence, not an immutable execution version, and a
matching token is not proof of unchanged contents. A source without a token is unversioned: what was read from it is
bounded in what it may authorize, never in what is drawn.

The source runtime owns asset metadata evidence: map layers, Retrieve and evidence observers share its reads, its
in-flight requests and its account scoping, and nothing keeps a parallel cache. Direct asset layers read their bands
and presets through it; persistent layer snapshots are identity seeds, never proof of freshness, and unchanged preset
identities are kept without replacing saved user intent.

Tasks should report the **actual affected asset IDs** after destination changes, including collection destinations
and written members where relevant, partial writes of a failed or cancelled export included. The shared owner
invalidates those assets and revalidates active consumers; tasks do not identify recipes, layers or panels to refresh
([task-driven asset invalidation](data-sources.md#task-driven-asset-invalidation)). This integration is deferred
until the task rewrite lands; its lifecycle and notification paths must be audited again before implementation.

Background validation while a recipe is open should detect:

- source deletion or lost permission;
- bands added, removed, reordered or type/grid changed;
- relevant properties or category semantics changed;
- collection membership changes under the declared schema policy;
- replacement under the same asset ID.

## Recipe freshness and dependencies

A recipe description depends on the root model and every output-relevant transitive edge. Local immutable-model
changes invalidate the affected graph immediately for the editable root. A persisted revision change invalidates
previously resolved descriptions and causes an authorized reload; the resulting product fingerprint determines
whether an existing derived answer remains reusable.

A dependent recipe need not be open when its source changes. When it is opened later, a revision-vector refresh
identifies which dependencies moved, changed ones are reloaded and re-resolved, and the resulting product
fingerprints are compared with the persisted derived-result evidence. Unchanged revisions settle the question
without loading content. Events improve latency for already-open consumers; they are not the only path to
discovering change.

Opening a recipe performs background existence and dependency validation using the diagnoses defined by
[source-resolution.md](source-resolution.md). Cycle prevention, deletion behavior and execution eligibility are
owned there; freshness only schedules re-resolution and publishes the resulting current state.

Recipe rename or project movement does not invalidate an ID-based reference, but display metadata must refresh.
If future operations can replace recipe IDs, replacement is an explicit migration rather than inferred from title
or project.

## Expectation validation

Consumers declare requirements over the facts of what they select: pure shared rules, declared by the consuming
type with the section owning them and the operations they gate
([requirement contract](source-resolution.md#requirement-contract)). That contract supersedes the earlier
expectation-object shape (product `requiredBands`, capability `cardinality` and `requiredMeasures`).

Refresh reconciles evidence with intent:

- added unused bands update choices without changing the model;
- reordering does not alter name-based mappings;
- removed unused bands require no user action;
- missing or incompatible required bands remain selected and visibly invalid;
- changed values with unchanged bands invalidate maps through the conservative graph fingerprint;
- changed source presets update choices without overwriting local styles.

The GUI directs the user to the panel owning the invalid expectation. It must not allow a later Earth Engine
`select` or model-property read to become the first validation.

Candidate discovery uses the same expectation contract. It queries resolved source instances and distinguishes
`SUPPORTED`, `UNSUPPORTED` and `NEEDS_EVIDENCE`; it does not index a denormalized effective recipe type. A selector
can therefore admit a pass-through recipe only when its current operation and dependency graph preserve the
required capability, without knowing that recipe type. Catalogue refresh re-evaluates the query when any
output-relevant dependency or asset observation changes.

### Declarative dependency evaluation

Agreed direction for subsequent implementation, not an implemented declaration API: evaluate the current model
against current source descriptions and local dependencies instead of maintaining chains of imperative
"when X changes, invalidate Y" rules. Shared observation and source descriptions are implemented. The
[validation boundary review](data-sources.md#validation-boundary-review) extends the implemented requirement contract
towards this direction rather than defining a second one; CCDC Slice and BAYTS do not introduce it.

Recipe definitions own ordinary pure functions declaring:

- the inputs a calculation or section consumes, including dependencies conditional on its mode;
- the semantic projection of those inputs and the requirements they must satisfy;
- its derived output and whether a change permits automatic derivation, requires recalculation or needs review.

Use the same declaration and evaluation contract for local model values, locally derived outputs and resolved
recipe or asset outputs. Requirements operate on the supplied inputs, not on whether their origin is internal or
external. Providers own obtaining those inputs and their availability and freshness evidence; the evaluator does
not load sources or branch on their location. Uniform evaluation does not imply identical acquisition or versioning.

A section-to-section dependency list alone is insufficient. Band Math consumes the bands actually referenced by
an expression; Sampling Design's manual proportions depend on stratum identities, not their colors or ordering,
while automatic proportions consume different inputs. Reuse the existing expression parser and domain functions
rather than inventing a rule language. Keep external source traversal and observation in their existing shared
boundaries; local calculation dependencies are not additional recipe-reference edges.

Derive diagnostics and propagate affected state from the current inputs, independently of which panel is open.
Diagnostics identify a stable reason and the affected model location; the GUI maps that location to the owning
section and corrective action. Apply the expectation-validation rules above without deleting user configuration.
A Change Alerts analysis band disappearing and a Band Math expression losing an input share that mechanism,
but their recipe definitions own the different semantic requirements.

Keep three questions separate: is the configuration compatible, is a calculated result still current, and does a
user decision need review? Compatible inputs can contain changed pixel values. Cheap derived output can update
automatically; stored calculations use the [result evidence](#persisted-derived-result-evidence) captured by the
actual operation, not flags inferred from edit events. User-authored choices are not calculated results.

The declaration shape and reusable evaluator remain open until the bounded Band Math workflow establishes what
is needed. Extract only demonstrated common mechanics; do not build a general rules engine or rewrite Sampling
Design's invalidation planner in the CCDC Slice or Band Math packet. That planner stays Sampling Design's current
mechanism until then; it is not the final architecture.

## Availability state

The diagnosis taxonomy, known-bad versus unknown policy and execution blocking are owned
by [source-resolution.md](source-resolution.md). The catalogue preserves the last successful description when a
refresh produces a transient diagnosis, marks the entry `REFRESH_REQUIRED`, and exposes the current diagnosis
beside it. It never converts a definitive diagnosis into a transient one or decides whether an operation may
proceed.

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

This request-scoped memoization is a permanent correctness and efficiency improvement, not temporary Sampling
Design scaffolding: the current reference loader re-reads on every subscription, so one calculation dereferencing
the same recipe twice can already observe two different revisions, and pays for the duplicate loads.

Task atomicity remains separate. A task executes its accepted execution bundle even if the live catalogue changes
afterward.

## Cache policy

Do not impose an arbitrary entry-count cap initially. Source descriptions are expected to be small and users cannot
practically activate hundreds of sources. Measure:

- entry count and serialized bytes;
- unusually wide image or collection schemas;
- request frequency and latency;
- inactive-entry lifetime.

Add eviction or per-entry bounds only in response to evidence. This is separate from execution-bundle safeguards,
which protect server and task payload boundaries.

The GEE module may coalesce identical concurrent metadata requests or use a short request cache. Recipe entries are
keyed by SEPAL principal; asset entries are keyed by both SEPAL principal and linked Earth Engine identity. GEE does
not own long-lived correctness state: instances restart, may be replicated and cannot notify the GUI that a source
became stale.

A generic derived resource has a logical key consisting of its resource kind and normalized question. A
source-version vector for every output-relevant dependency tells it when current input evidence must be resolved
again. The resulting operation-input fingerprint decides whether the previous answer remains reusable. Examples
include an image-output description, visualization applicability and Sampling Design stratum areas and per-stratum
probabilities. Features must not build independent caches for these results, and existing per-feature caches are
replaced rather than left running beside the shared one.

For one exact input fingerprint, the resource may share one in-flight request and replay its last successful
terminal result when a panel closes and reopens. A source-version change invalidates its evidence and triggers
re-resolution; new expensive work starts only if the input fingerprint changed and there is an active consumer.
Transient `UNAVAILABLE` results are not retained as successful cache entries. Definitive invalidity may be retained
only for the exact evidence that proved it. Earth Engine identity change and owning-runtime teardown clear affected
resources.

Keep retention bounded. Start with at most the latest successful result per active logical resource, or a small
measured LRU if inactive reuse proves useful. Do not add an unbounded map simply because source descriptions are
usually small. The current cold `resolveImageOutput$` remains one-shot and uncached; a shared live resource is added
behind the source runtime when its first consumer, refresh policy and product-fingerprint evidence are ready.

### Sampling Design first vertical slice

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

## Map and panel invalidation

Panels and map layers subscribe to resolved descriptions and fingerprints rather than copied snapshots. A changed
fingerprint causes the current source to be revalidated and the map request to reload. Saved user intent is not
rewritten merely because runtime evidence changed.

Before shared versioned resources exist, an output-dependent panel may repeat observation whenever it mounts. Its
pending UI must remain conservative rather than briefly offer actions that later become incompatible. Once the
resource layer exists, closing and reopening that panel should replay the current successful result immediately and
continue watching its current source evidence.

A recipe revision may cause re-resolution without causing a map or calculation refresh. Only a changed product or
operation-input fingerprint invalidates the rendered or calculated answer. Providers that have not yet isolated
their product inputs may over-invalidate through their conservative model fingerprint; preserve correctness and
measure that cost before narrowing them.

## Observability

Emit low-cardinality Prometheus metrics and access-controlled structured logs for:

- cache hits, misses, entry bytes and active entry count;
- refresh reason, duration and result;
- in-flight deduplication and stale response rejection;
- source age at Preview and Retrieve;
- transient unavailability and definitive blocks;
- revision-vector refreshes, and how often they avoid a content load;
- recipe revision events, save conflicts and asset `system:version` changes;
- recipe revision changes that leave a consumed product fingerprint unchanged;
- accepted no-op saves and incorrectly published no-op update events;
- asset `updateTime` fallback observations;
- map invalidations caused by resolved-graph changes.

Do not label metrics with recipe IDs, asset IDs or usernames.

Stale responses overwriting a newer epoch and cache hits crossing a SEPAL or Earth Engine principal are contract
violations whose counters must remain zero. Any non-zero value requires investigation. Refresh latency, transient
failure rate, observation age, catalogue growth and invalidation-rate thresholds are set after the first
catalogue-backed consumer establishes normal behavior. Visualization-only invalidation is product telemetry rather
than an operational page.

## Verification

Pure tests own catalogue transitions, canonical fingerprinting, epochs, stale-while-revalidate, in-flight
deduplication, account invalidation, dependency memoization and expectation reconciliation.

Versioned-resource tests also prove that identical snapshots share work, a reopened consumer receives the replayed
successful result, a relevant recipe or asset version invalidates exactly the dependent resources, unrelated
events do nothing, transient failures are not cached as success, and unsaved local edits are never overwritten by a
remote event.

The Sampling Design slice additionally proves that a source recipe may change while its dependent Sampling Design
recipe is closed. Reopening the dependent recipe refreshes the revision vector, keeps results current without a
content load when no revision moved, re-resolves consumed products when one did, keeps areas current when the
exposed AOI fingerprint is unchanged despite a conservative revision change, marks them stale when the fingerprint
changed, and rejects a response calculated for superseded inputs. Retrieve revalidates afresh and blocks stale or
unknown applicable results. Asset replacement under the same ID exercises the same path through `system:version`.

Execution-boundary tests prove that one operation dereferencing the same recipe twice observes exactly one snapshot
and one revision, and that the returned evidence vector describes the snapshots actually used.

Focused GUI tests cover each migrated source boundary and a late-response race without broad component rendering.
Environment witnesses prove the shared contract loads through the GUI build and GEE/Task runtimes.

Manual acceptance is limited to browser behavior that pure tests cannot establish:

- visible stale/refresh/error states;
- source edit in another tab or browser session;
- linked-account replacement;
- map reload after pixel, schema, category or preset changes.

## Open decisions

- Redux versus a dedicated observable catalogue after the first catalogue-backed slice.
- Refresh interval and freshness threshold based on measured cost.
- Whether an explicit Refresh command improves recovery.
- Collection schema policy for each migrated consumer.
- Whether every relevant ImageCollection membership change advances `system:version`; if not, the bounded member
  evidence required by each collection policy.
- Whether semantic no-op detection ships with the initial `revision` implementation or is phased in after it.
- The exact normalization rules for persisted-content equality, and their versioning.
- Websocket event transport and dirty-draft conflict presentation in the Node server migration.
- Whether the shared recipe-closure limits suit this path, in particular whether the 8 MiB serialized bound holds
  for large Classification and manually selected Mosaic recipes. This needs measurement, not a second limit policy.
- Whether future patch events are useful enough to apply locally; freshness correctness must not depend on them.
- Initial handling of recipes that become invalid under stricter checks.
- Thresholds that would justify split fingerprints or cache eviction.
