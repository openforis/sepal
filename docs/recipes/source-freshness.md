# Source freshness, caching and invalidation

Technical design for keeping live recipe and Earth Engine asset descriptions current while a recipe is open.
Resolution and frozen task execution belong in [source-resolution.md](source-resolution.md).

## Responsibilities

This subsystem owns:

- session-scoped source-description caching;
- generic versioned derived resources built from source evidence;
- in-flight request deduplication;
- race-safe background refresh;
- account-aware Earth Engine metadata state;
- stale, refreshing and unavailable catalogue states plus propagation of resolver diagnoses;
- consumer expectation revalidation;
- map and panel invalidation when a resolved graph changes.

It does not own task atomicity. A Retrieve task consumes its accepted execution bundle even if the live catalogue
changes afterward.

This catalogue is not a prerequisite for the first Masking robustness slice, Apply-mask stabilization, constant
Fill or direct asset Fill. Those milestones may use the shared dependency graph and existing session events without
introducing cross-session backend resolution. Recipe-backed freshness waits for caller-authorized reads and content
digests from the Node replacement for `sepal-server`.

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

- **Recipe content revision**: a server-owned monotonic integer changed atomically with persisted recipe content.
  It orders websocket events, supports optimistic concurrency and cheaply invalidates browser resources.
- **Recipe content digest**: a digest of the exact persisted bytes or versioned canonical JSON. It establishes
  content identity and supports coherent bundle construction and cross-session comparison.
- **Recipe timestamp**: display and audit metadata only. The current second-resolution `update_time` cannot order
  all saves and is not a cache key.
- **Local draft generation**: exact immutable recipe-object identity or an equivalent runtime-only generation. It
  invalidates results immediately for unsaved edits without pretending that the draft has a persisted revision.
- **Earth Engine asset version**: `{id, system:version}`, with the version normalized to an opaque string. It is
  useful invalidation evidence, not a timestamp and not proof that an execution is pinned to those pixels.

The replacement recipe storage boundary should return revision and digest with content from one committed row. Its
list, load, save and future batch or closure operations expose the revision consistently. After commit it can
publish a compact event such as `{type: 'RECIPE_UPDATED', id, revision}`; including the digest is optional when a
consumer can fetch it with the content. Events that arrive out of order are ignored by revision. Deletion receives
the same ordered treatment.

One source-version registry consumes those events and asset-version observations. It knows current versions and
invalidation only; it does not resolve recipe graphs or own feature-specific results. Dynamic resources subscribe
to only the source references in their resolved dependency closure. An unrelated recipe event does no graph work.
When a relevant version changes, the resource cancels superseded work, resolves against one new snapshot and
publishes the replacement result.

If a remote persisted revision advances while the same recipe has unsaved local edits, retain the local draft and
record that a newer remote revision exists. Never overwrite the draft silently. Conflict presentation and merge
policy belong to recipe editing, while invalidating derived evidence belongs here.

## Conservative fingerprints

Begin with one canonical fingerprint over the complete resolved recipe graph, structured edge roles, recipe
models, relevant adapter, composer and capability contract versions, and relevant asset observations. Whole-model
changes may over-invalidate. That is preferable to silently retaining stale pixels because a new field was omitted
from a hand-maintained category.

Do not initially classify every model field as data, schema or presentation. Introduce narrower fingerprints only
after metrics identify a meaningful expensive invalidation and tests can prove the split fails closed.

The fingerprint is runtime evidence and cache identity. It is not authoritative persisted recipe state.

Revision, digest and fingerprint have different jobs. A revision says that persisted content changed; a digest
identifies that content; a resolved fingerprint identifies the complete derived answer, including dependencies,
asset evidence and contract versions. Do not substitute one for another merely because all can be represented as
strings.

Contract versions identify deliberate supported command or semantic evolution. They are not revisions of source
content and are not used to preserve historical implementation defects. Corrected behavior invalidates affected
derived resources normally; the cache does not select a legacy algorithm based on an old asset or recipe date.

## Entry state

A catalogue entry keeps the last successful description separately from its current refresh state:

```js
{
    description,
    fingerprint,
    observedAt,
    status: 'FRESH', // FRESH, STALE, REFRESHING, TRANSIENT_ERROR, DEFINITIVE_ERROR
    error,
    requestEpoch
}
```

A transient resolution diagnosis does not erase the last successful description or claim that bands disappeared.
The catalogue preserves the transient or definitive classification supplied by source resolution.

`PENDING` is useful before any description exists. `STALE` means usable historical evidence exists but current
validation is required. Diagnostics carry stable codes and dependency paths.

## Refresh triggers

Refresh active sources:

1. when a recipe or source is opened;
2. immediately when a source selection or linked Earth Engine account changes;
3. when a loaded dependency changes in the current GUI session;
4. when returning to an active recipe after browser-tab inactivity;
5. on a bounded timer for active asset sources;
6. before Preview or Retrieve when the current observation is older than policy allows;
7. on an explicit user Refresh command if a migrated consumer demonstrates that it is useful.
8. when a websocket event advances the persisted revision of an output-relevant recipe.

Do not periodically resolve every transitive recipe graph through Earth Engine. For recipes changed in the current
session, use immutable recipe-object changes. For cross-session changes, use ordered revision events to invalidate,
then compare or load the content digest through an authorized recipe read before resolving. The current
second-resolution recipe `update_time` is not sufficient evidence. Cross-session recipe refresh remains deferred
until the Node server replacement can return content, revision and digest from the same storage boundary. Asset
refresh normally starts with metadata and performs bounded runtime inspection only when the consumer contract
needs it.

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

Use asset `system:version`, normalized as an opaque string, as the preferred change token when available. Treat it
as invalidation evidence, not an immutable execution version. `updateTime` remains weaker fallback and display
evidence. An older source reference without a usable version remains valid but is re-observed rather than retained
as a reliably versioned cache entry. ImageCollection refresh follows the consumer's declared policy. The collection
asset's metadata alone is insufficient until live verification proves that relevant membership changes always
advance the collection's version.

Background validation while a recipe is open should detect:

- source deletion or lost permission;
- bands added, removed, reordered or type/grid changed;
- relevant properties or category semantics changed;
- collection membership changes under the declared schema policy;
- replacement under the same asset ID.

## Recipe freshness and dependencies

A recipe description depends on the root model and every output-relevant transitive edge. Local immutable-object
changes invalidate the affected graph immediately. Once the authorized Node storage boundary exists, remote
changes are announced through monotonic content revisions and confirmed through recipe content-digest checks.

Opening a recipe performs background existence and dependency validation using the diagnoses defined by
[source-resolution.md](source-resolution.md). Cycle prevention, deletion behavior and execution eligibility are
owned there; freshness only schedules re-resolution and publishes the resulting current state.

Recipe rename or project movement does not invalidate an ID-based reference, but display metadata must refresh.
If future operations can replace recipe IDs, replacement is an explicit migration rather than inferred from title
or project.

## Expectation validation

Consumers derive requirements from their persisted selections:

```js
{
    product: {
        id: 'IMAGE_OUTPUT',
        kind: 'IMAGE',
        requiredBands: ['ndvi']
    }
}

{
    product: {
        id: 'IMAGE_OUTPUT',
        kind: 'IMAGE'
    },
    capabilities: [{
        id: 'CCDC_SEGMENTS',
        version: 1,
        cardinality: 'EXACTLY_ONE',
        baseBand: 'ndvi',
        requiredMeasures: ['coefficients', 'magnitude', 'rmse']
    }]
}
```

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

## Availability state

The diagnosis taxonomy, known-bad versus unknown policy and execution blocking are owned
by [source-resolution.md](source-resolution.md). The catalogue preserves the last successful description when a
refresh produces a transient diagnosis, marks it as stale evidence, and exposes the current diagnosis beside it.
It never converts a definitive diagnosis into a transient one or decides whether an operation may proceed.

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

A generic derived resource is keyed by its resource kind and normalized question, with a source-version vector for
the root and every output-relevant dependency. Examples include an image-output description, visualization
applicability and future Sampling Design stratification weights. Features must not build independent caches for
these results.

For one exact version vector, the resource may share one in-flight request and replay its last successful terminal
result when a panel closes and reopens. A source-version change invalidates that result and starts new work only
while there is an active consumer. Transient `UNAVAILABLE` results are not retained as successful cache entries.
Definitive invalidity may be retained only for the exact version vector that proved it. Earth Engine identity change
and owning-runtime teardown clear affected resources.

Keep retention bounded. Start with at most the latest successful result per active logical resource, or a small
measured LRU if inactive reuse proves useful. Do not add an unbounded map simply because source descriptions are
usually small. The current cold `resolveImageOutput$` remains one-shot and uncached; a shared live resource is added
behind the source runtime when its first consumer and reliable version evidence are ready.

## Map and panel invalidation

Panels and map layers subscribe to resolved descriptions and fingerprints rather than copied snapshots. A changed
fingerprint causes the current source to be revalidated and the map request to reload. Saved user intent is not
rewritten merely because runtime evidence changed.

Before shared versioned resources exist, an output-dependent panel may repeat observation whenever it mounts. Its
pending UI must remain conservative rather than briefly offer actions that later become incompatible. Once the
resource layer exists, closing and reopening that panel should replay the current successful result immediately and
continue watching the same source-version vector.

Using one conservative fingerprint initially means a palette-only recipe-model edit may reload more than strictly
necessary. Preserve correctness first and measure that cost before introducing specialized presentation-only
invalidation.

## Observability

Emit low-cardinality Prometheus metrics and access-controlled structured logs for:

- cache hits, misses, entry bytes and active entry count;
- refresh reason, duration and result;
- in-flight deduplication and stale response rejection;
- source age at Preview and Retrieve;
- transient unavailability and definitive blocks;
- recipe content-digest changes and asset `updateTime` changes;
- recipe revision events and asset `system:version` changes;
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
- Recipe revision representation, websocket event transport and dirty-draft conflict presentation in the Node
  server migration.
- Initial handling of recipes that become invalid under stricter checks.
- Thresholds that would justify split fingerprints or cache eviction.
