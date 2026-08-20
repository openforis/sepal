# Source freshness, caching and invalidation

Technical design for keeping live recipe and Earth Engine asset descriptions current while a recipe is open.
Resolution and frozen task execution belong in [source-resolution.md](source-resolution.md).

## Responsibilities

This subsystem owns:

- session-scoped source-description caching;
- in-flight request deduplication;
- race-safe background refresh;
- account-aware Earth Engine metadata state;
- stale, refreshing and unavailable catalogue states plus propagation of resolver diagnoses;
- consumer expectation revalidation;
- map and panel invalidation when a resolved graph changes.

It does not own task atomicity. A Retrieve task consumes its accepted execution bundle even if the live catalogue
changes afterward.

## Catalogue boundary

The pure source contract is storage-agnostic. The CCDC Slice vertical implementation decides whether Redux or a
plain observable store best fits existing GUI lifecycle and DevTools needs. React components consume selectors or
observables; they do not traverse dependencies, parse asset naming conventions or maintain copied source state.

Catalogue keys include:

- normalized source reference;
- authenticated SEPAL principal;
- linked Earth Engine identity or authorization context for assets;
- resolver and capability contract version;
- collection schema policy where it changes the description.

The catalogue stores data and status, never active subscriptions or Earth Engine objects.

The browser catalogue is naturally scoped to one authenticated SEPAL session, but the principal remains part of
the logical key. Any adaptation in GEE, Task or another shared process must preserve that scope explicitly rather
than assume one process serves one user.

## Conservative fingerprints

Begin with one canonical fingerprint over the complete resolved recipe graph, structured edge roles, recipe
models, capability versions and relevant asset observations. Whole-model changes may over-invalidate. That is
preferable to silently retaining stale pixels because a new field was omitted from a hand-maintained category.

Do not initially classify every model field as data, schema or presentation. Introduce narrower fingerprints only
after metrics identify a meaningful expensive invalidation and tests can prove the split fails closed.

The fingerprint is runtime evidence and cache identity. It is not authoritative persisted recipe state.

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
7. on an explicit user Refresh command if the CCDC slice demonstrates that it is useful.

Do not periodically resolve every transitive recipe graph through Earth Engine. For recipes changed in the current
session, use existing state events. For cross-session changes, check a cheap recipe revision first and resolve the
graph only when that revision changed. Asset refresh normally starts with metadata and performs bounded runtime
inspection only when the consumer contract needs it.

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

Use asset `updateTime` as revision evidence, not as an immutable version. ImageCollection refresh follows the
consumer's declared policy. The collection asset's metadata alone is insufficient when member schema affects the
contract.

Background validation while a recipe is open should detect:

- source deletion or lost permission;
- bands added, removed, reordered or type/grid changed;
- relevant properties or category semantics changed;
- collection membership changes under the declared schema policy;
- replacement under the same asset ID.

## Recipe freshness and dependencies

A recipe description depends on the root model and every output-relevant transitive edge. Local changes invalidate
the affected graph immediately. Remote changes are discovered through recipe revision checks.

Opening a recipe performs background existence and dependency validation using the diagnoses defined by
[source-resolution.md](source-resolution.md). Cycle prevention, deletion behavior and execution eligibility are
owned there; freshness only schedules re-resolution and publishes the resulting current state.

Recipe rename or project movement does not invalidate an ID-based reference, but display metadata must refresh.
If future operations can replace recipe IDs, replacement is an explicit migration rather than inferred from title
or project.

## Expectation validation

Consumers derive requirements from their persisted selections:

```js
{capability: 'IMAGE_OUTPUT', requiredBands: ['ndvi']}

{
    capability: 'CCDC_SEGMENTS',
    baseBand: 'ndvi',
    requiredMeasures: ['coefficients', 'magnitude', 'rmse']
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

## Availability state

The diagnosis taxonomy, known-bad versus unknown policy, execution blocking and transient override rules are owned
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

## Map and panel invalidation

Panels and map layers subscribe to resolved descriptions and fingerprints rather than copied snapshots. A changed
fingerprint causes the current source to be revalidated and the map request to reload. Saved user intent is not
rewritten merely because runtime evidence changed.

Using one conservative fingerprint initially means a palette-only recipe-model edit may reload more than strictly
necessary. Preserve correctness first and measure that cost before introducing specialized presentation-only
invalidation.

## Observability

Emit low-cardinality Prometheus metrics and access-controlled structured logs for:

- cache hits, misses, entry bytes and active entry count;
- refresh reason, duration and result;
- in-flight deduplication and stale response rejection;
- source age at Preview and Retrieve;
- transient overrides and definitive blocks;
- recipe revision changes and asset `updateTime` changes;
- map invalidations caused by resolved-graph changes.

Do not label metrics with recipe IDs, asset IDs or usernames.

Stale responses overwriting a newer epoch and cache hits crossing a SEPAL or Earth Engine principal are contract
violations whose counters must remain zero. Any non-zero value requires investigation. Refresh latency, transient
failure rate, observation age, catalogue growth and invalidation-rate thresholds are set after the CCDC slice
establishes normal behavior. Visualization-only invalidation is product telemetry rather than an operational page.

## Verification

Pure tests own catalogue transitions, canonical fingerprinting, epochs, stale-while-revalidate, in-flight
deduplication, account invalidation, dependency memoization and expectation reconciliation.

Focused GUI tests cover the CCDC source boundary and a late-response race without broad component rendering.
Environment witnesses prove the shared contract loads through the GUI build and GEE/Task runtimes.

Manual acceptance is limited to browser behavior that pure tests cannot establish:

- visible stale/refresh/error states;
- source edit in another tab or browser session;
- linked-account replacement;
- map reload after pixel, schema, category or preset changes;
- explicit transient override and its visible audit state.

## Open decisions

- Redux versus a dedicated observable catalogue after the CCDC vertical slice.
- Refresh interval and freshness threshold based on measured cost.
- Whether an explicit Refresh command improves recovery.
- Collection schema policy for each migrated consumer.
- Initial handling of recipes that become invalid under stricter checks.
- Thresholds that would justify split fingerprints or cache eviction.
