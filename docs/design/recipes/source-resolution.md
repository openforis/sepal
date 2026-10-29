# Source resolution, dependencies and execution

This document describes the current resolution and execution-readiness contracts, followed by the target design
for coherent execution bundles and provenance. It does not track delivery history. Remaining work is in the
[roadmap](data-sources.md#remaining-work).

[Output products](output-products.md) owns band schemas and product declarations;
[the GUI runtime](gui-source-runtime.md) owns browser acquisition;
[freshness](source-freshness.md) owns currency and invalidation;
[behavior contracts](behavior-contracts.md) owns editing, diagnosis and repair policy.

## Current design

### Authorization and recipe storage

Recipe list, load and save use the trusted SEPAL principal. The Node Recipe service applies its ownership policy;
a missing or inaccessible record is not disclosed differently to an unauthorized caller. A principal never comes
from recipe JSON. GEE reads as the user authenticated for the request, including the user identified by a task's
key, with no administrator fallback.

Recipe content and its server-owned monotonic `revision` are loaded from one committed row. Save uses
`expectedRevision` and returns the committed revision. `typeVersion` is schema versioning, and `update_time` is
display/audit metadata; neither is freshness authority. The complete storage and save-coordination contract is in
[source freshness](source-freshness.md#recipe-storage-contract).

Authorized per-recipe reads exist. A batch/closure endpoint and graph-wide coherent snapshot protocol do not.
Any shared cache must preserve principal scoping; asset evidence also belongs to its linked Earth Engine identity.

### Structured source edges

Each shared recipe-type definition declares its direct recipe and asset references, interpreting that type's own
persisted shapes. Generic traversal receives canonical references and role-bearing edges:

```js
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'PRIMARY_IMAGE', path: ['model', 'source']}
{reference: {type: 'ASSET', id: 'asset-id'}, role: 'MASK_IMAGE', path: ['model', 'imageMask']}
```

Roles belong to definitions rather than a central enumeration. A definition explicitly declares its sources or
that it has none. References to imagery, training data and AOIs are distinct roles. Display layers and provenance
snapshots are not computation edges merely because they contain a recipe ID.

The shared graph owns closure, missing/malformed references, cycle detection, diagnostic paths and diamond reuse.
The browser closure loader applies bounded depth, node count, serialized bytes, loading rounds and concurrency.
A missing session record means acquisition is needed, not deletion. A failed closure cannot establish validity.
Representative saved-model tests audit declarations against executable reference shapes.

Capability inheritance follows only its declared preserving role. A mask or future fill source affects pixels and
participates in dependencies but supplies no inherited capability. An AOI affects geometry, not image semantics.

### Operation-scoped recipe loading

`RecipeScope` retains one successful recipe record per ID per execution operation. Concurrent dereferences share
the in-flight read; a failed read is evicted for retry. Closing the operation releases records and cancels reads.
GeoID reads use the same ownership boundary. Factories may be constructed repeatedly from those retained records.

Each subscriber receives `next`, `error` and `complete` in the whole async context captured at subscription.
The protected observable is the only return path from the scope's private retention mechanism; callers add no
context wrappers. The service bridge uses the same Node-only `inSubscriberContext` helper. Sharing the record
therefore cannot import another branch's ancestry or authority. Dependency ancestry remains path-local, and real
self-cycles and indirect cycles still fail.

This guarantees one version per recipe per operation. It neither establishes graph-wide coherence nor freezes
Earth Engine assets. It is not a persisted Retrieve bundle.

### Execution identity and capability providers

The selected outer source supplies the pixels. A Masking over CCDC executes Masking while CCDC supplies segment
interpretation. Resolving the provider must never replace the selected reference and bypass its mask.

`providerStep` reads a capability's declaration and answers `PRODUCES`, `PRESERVES`, `UNSUPPORTED` or `MALFORMED`.
`discoverProvider` walks already-held records, retaining the provider chain or the point where it stopped.
Execution uses the same producer-step rules with its operation-owned loader. Discovery establishes where facts
come from; it does not validate an asset's contents or authorize every use of the producer.

Current contracts include `IMAGE_OUTPUT`, `CCDC_SEGMENTS`, `BAYTS_HISTORICAL_STATS` and the optional
`OPTICAL_COLLECTION_DEFAULTS` prefill contract. General transformation-based capability projection and
multiple preserved instances remain target work in [output products](output-products.md#transformation-and-capability-projection).

### Requirement contract

A shared requirement has a stable ID and pure `evaluate(facts, parameters)`. It loads nothing, translates nothing
and holds no UI state. Facts concern the discovered provider, not the consumer that selected it. Its answers are
`SUPPORTED`, `UNSUPPORTED` and `NEEDS_EVIDENCE`.

Provider discovery, evidence acquisition and requirement evaluation are separate responsibilities. An unknown
rank, unread observation or unresolved input cannot establish incompatibility. Transport failure is unavailable,
not a missing-band finding. Typed asset metadata establishes physical structure; it does not prove array lengths,
scientific meaning or every ImageCollection member's schema.

GUI declarations bind these rules to source roles, operations, sections, items and form inputs. Local rules can
supply `localFacts` and enumerate items without source acquisition. Dependencies between declared items identify
the declaration and item, not a translated message or inferred field path. The same findings drive section marks,
operation gates and candidate feedback.

### Execution readiness

Description answers which bands are available; readiness answers whether a declared operation may run.
A Classification without training data can remain described while its execution is refused.

The shared readiness read combines configuration requirements, applicable description refusals, the needs declared
for each dependency role and structural dependency validity. It uses the existing graph, acquisition loop and
per-read memoization; no persisted validity flag or second validator is involved.

| Readiness | Meaning |
| --- | --- |
| `READY` | All declared requirements are met. |
| `NEEDS_EVIDENCE` | No confirmed finding, with records or observations still needed. |
| `UNAVAILABLE` | No confirmed finding, but required evidence could not be acquired. |
| `NOT_READY` | At least one confirmed finding. |

Findings keep their code, originating model path and `recipePath`. A confirmed finding outranks unrelated pending
or failed evidence and remains visible while that evidence is read. Repair or changed evidence starts a new
assessment; findings are recomputed rather than manually cleared.

Operations include `IMAGE_OUTPUT`, `CLASSIFIER`, `TRAINING_DATA`, `PIXEL_OBSERVATIONS`, `PIXEL_SEGMENTS` and declared
named products. `REFERENCE` checks resolution only; it is not a claim that the source can execute. Each actual
edge must have a declared need for the operation being judged; otherwise `UNCLASSIFIED_ROLE` refuses it.

A type's `analysisPrerequisites` apply to every operation and named product it declares. Operations may add needs
and requirements but cannot weaken those prerequisites. Named-product readiness is evaluated beside its own
cheap description, without describing or constructing the canonical image.

Time Series and CCDC declare their selected Classification once as an analysis prerequisite. An untrainable
selection holds native and classified operations, including count previews, until repaired or explicitly
removed. This is the configured-analysis policy, not a claim that native output needs training computationally.
Phenology retains its conditional policy for its configured classified band.

`CLASSIFIER` requires a single input image when applying a Classification to collection imagery. A standalone
multi-input Classification and its use as a training-data Provider remain separate supported operations.

### Consumers

Layers, Retrieve and chart actions consume shared gates, not toolbar colors or recipe-specific validators.
A confirmed withdrawal removes an existing layer before transient description-refresh handling can preserve it.
Pending/unavailable evidence may preserve an unchanged existing drawing but authorizes no new work.

Retrieve closes through its normal Close action when a confirmed source/configuration problem disables its opening
action. Pending, unavailable or expired evidence, unacknowledged saves, an empty selection and destination problems
leave the panel open. Repair enables opening without reopening it automatically. Closing discards unapplied edits
and retains the last submitted settings.

`Form.Panel.accepts(values)` is the common acceptance boundary for Apply, Enter and wizard forward submission.
An owner refusal happens before settings are saved, work is submitted or the panel closes. Retrieve also decides
again from current state immediately before sending. Button appearance is never the sole protection.

Draft candidates are evaluated independently of the applied recipe. A valid replacement can be applied while the
old selection is invalid; Cancel leaves the old configuration and its holds intact. Confirmed unusability blocks
reference Apply/Next/Done through the same candidate, including last-moment state changes. Back and Cancel remain
available. Entry-level required-field validation stays with the form.

Reference feedback distinguishes an actual upstream defect from a restriction on the requested use. A two-input
Classification can be valid itself while unsuitable as a collection classifier. Known restrictions explain the
consumer's requirement and repair location; unknown use refusals use neutral wording rather than claiming the
producer is broken. Findings specific to an operation retain that operation in shared readiness.

Shared feedback retains recipe IDs alongside names until rendering. The common renderer opens known recipes
through `openRecipeById$`; ordinary text remains text. Identical names are not identities. Field/list indicators
provide keyboard and touch access, and hidden or covered owners cannot leave interactive tooltips behind.
Opening a reference preserves the originating panel draft.

A stated local, located or selected-source refusal takes priority over the generic output-refused fallback for
operations it covers. A generic refusal still protects operations with no stated reason. Presentation-only
suppression such as `toolbarMark: false` removes a mark, never an operation hold. Empty Band Math output and
Classification training setup can consequently be neutral without being executable.

Attribution follows the paths actually returned by readiness. In a diamond graph only one route to a shared origin
may be present; another affected route must not be invented. Execution remains blocked even when every route is
not marked. Complete multi-route attribution is an open follow-up.

### Reused training data

Classification reuses Classification data, and Regression reuses Regression data. Each point-contributing Provider
owns its imagery, points, labels, sampling scale and masks. The Consumer owns its effective feature definition and
normalization, applied once. Intermediate reuse forwards that definition unchanged. A trained recipe consumed as
an input image starts its own training definition; the definition travels only along training-reuse edges.

The named-feature contract is shared between readiness and `classification/features.js` execution:

- Requested features retain the Consumer's construction: raw/provided band, calculated index, ordered combination
  or configured built-in covariate. The Provider's selected bands do not limit the features its imagery can supply.
- Matching is case-insensitive only when unique. `red` beside `Red` is ambiguous even when one matches exactly.
  No input position, role name, ranking or first-match fallback chooses a supplier.
- Each feature needs exactly one supplying Provider input. Combinations and index operands come from that input;
  bands from different inputs are not combined. Unused duplicates do not cause a finding.
- Provided indexes are selected directly, even beside spectral bands. Calculated indexes require their operands;
  a provided/calculated representation mismatch is not silently converted.
- Consumer operand order and exact output spelling are retained. Configured covariates may repeat under their
  generated names; an ordinary band called `latitude` is not thereby a covariate.
- Effective requests account for later band-set/covariate overwrites. Partial inputs missing required operands do
  not create irrelevant collisions. Case-colliding Consumer combination operands are refused during reuse.
- Supplied features retain their masks; built-in covariates retain native masks and the supplying-input masking.
  Sampling uses the Provider's scale and an explicit projection anchored to its first supplied non-covariate band.
- Missing, ambiguous and construction-incompatible features raise located shared findings. Unknown inputs never
  establish missing or unique supply; two known suppliers can establish ambiguity beside an unknown input.
  Execution also enforces exactly one supplier with readiness bypassed.

`TRAINING_DATA` checks imagery needed for sampling, not the Provider's own band selection or classified image.
An intermediate storing no points forwards definitions without building its own samples. Training assembly stays
outside per-scene collection prediction. Shared Providers receive definitions per call rather than caching a
Consumer-dependent answer on the Provider.

Matching names does not establish units, encoding, sample adequacy after masking, probability calibration or
comparability between independently fitted models. Those remain separate requirements/product decisions.

### Change Alerts REF

REF validates a usable segment source and processing evidence; Sources owns the configured monitoring measure.
A reference with no measure any supported monitoring data can observe is refused in REF. A generally suitable
reference that does not fit the current consumer choices is repairable in Sources, without silently changing them.

| Requirement | Owner | Affected work |
| --- | --- | --- |
| Sliceable segments | REF | Alerts/Retrieve; provider-chain suitability for period mosaics. |
| Any monitorable measure | REF | Alerts/Retrieve and reference selection. |
| Configured monitored measure observable by selected imagery | Sources | Alerts/Retrieve and both chart streams. |
| Chartable segments | REF | Segment chart; optional for selecting an otherwise usable reference. |
| Effective processing/date-format evidence | REF | Alerts, period mosaics and both chart streams. |

The live recipe reference's `IMAGE_OUTPUT` readiness is a common analysis prerequisite, including dependencies
such as its Classification. An exported asset is independent of its producer's private records. A missing saved
monitoring band stays visible and repairable; a confirmed finding closes an open chart and cancels both streams.
Repair enables reopening without reopening automatically. Period/source refusals that need no processing evidence
remain visible while that evidence is pending.

Change Alerts derives reference-owned processing through `changeAlerts/processing.js`. Recipe values use the
producer's execution defaults for omitted keys. Asset precedence is per field: canonical `processing`, top-level
legacy recipe properties, nested `formattedProperties`, then `surfaceReflectance` for SR. A complete recognized
producer record supplies omitted execution defaults; a partial import governs only its stated keys. A malformed
governing form is `UNREADABLE`, not permission to use a lower form. Valid higher metadata wins over malformed lower
metadata. Recorded date format governs Change Alerts; CCDC Slice keeps its own policy.

Reference/recorded values are read-only. Genuinely absent asset metadata uses labelled editable consumer fallbacks;
pending or failed evidence never does. Only the first Reference Apply during creation seeds editable monitoring
defaults, atomically from current candidate facts. Reopen, Refresh, producer edits and replacement never reseed;
Cancel writes nothing. Both segment-capable export paths write server-derived processing metadata. The shared
field-state/preservation mechanics live in `referenceProcessing.js`; recipe-specific interpretation stays local.
There is no separate copy-again action.

### CCDC Slice SRC

SRC requires the segment layout its slicing operation reads, including complete measures and their stored order;
the optional chart requirement judges its own smaller set of needs. A chartable source can therefore be unusable
for slicing, or vice versa. Typed ranks that are unknown do not become scalars. Array lengths, date correctness,
per-pixel segment presence and collection-wide homogeneity are not proved by metadata alone.

The shared source observation and candidate mechanism serves SRC, layers, Retrieve and the chart. Computed CCDC
and preserving Masking chains use the same provider resolution; the selected outer source remains what executes.
A saved unsuitable source stays visible while a valid draft replacement can be applied. The source's configured
asset date-format override, including zero, retains its existing precedence; Slice's final default is zero.
Options' break-analysis-band compatibility and broader server parity remain open work.

The Slice chart obtains optional band labels from the resolved producer using records already held by its operation.
CCDC's class labels decorate probabilities; missing labels fall back to raw names. Labels never change chart values,
requests, readiness or selection identity, and never require another read solely for presentation.

### BAYTS Alerts REF

REF needs at least one usable historical pass. PRC requires each monitored pass to be usable. For an asset, a pass
requires the seven scalar historical statistics in their supported pairing/order; computed Historical declares
what it produces. Unknown ranks and unreadable assets remain distinct from incompatibility.

Reference-owned geometric correction and spatial-speckle settings come from the Historical producer or its
recorded asset metadata. Complete `recipe_options` beside `recipe_type: BAYTS_HISTORICAL` applies producer defaults
for omitted keys; partial imports govern only stated keys. Missing metadata permits labelled editable fallbacks;
malformed governing metadata holds the alerts and radar map. Defaults shown in PRC agree with execution, and valid
zero parameters are preserved.

Passes, masks and angles belong to Alerts and are seeded only at first creation Reference Apply. Unsupported
selected passes remain visible and removable, with a field finding holding Apply. They are never automatically
rewritten. Hidden unused values and saved reference-owned copies are preserved by PRC Apply/Cancel, including
absent keys. No background observation writes configuration.

The radar product stays a nearest-date contextual mosaic using effective alert processing and the alert-forced
options: no outlier/multitemporal filtering, no orbit-number restriction, minimum observations one. It does not
claim to reproduce historical normalization or exactly the observations the algorithm scores. Server-derived
historical export metadata remains future work; current asset options are legacy GUI-supplied properties.

### Operation availability and server coverage

`operationAvailability`, request gates and candidate bindings consume the same declared decisions. Their coverage
is per operation and consumer, not a universal recipe-valid flag. The common chart lifecycle owns request
cancellation, confirmed withdrawal and rendering only when its container can be measured.

Server execution guards cover recipe-aware image exports and the declared Time Series/CCDC observation and segment
operations. Change Alerts observations acquire reference processing before projecting the collection and enforce
the monitored-measure rule; alert construction enforces the same rule. A point chart replaces its own AOI with the
clicked point without changing referenced imagery's AOIs.

Coverage limits remain explicit:

- Generic preview and several bands/histogram/distinct-value/geometry/sample routes lack a complete shared server
  guard; GUI holds do not prove these routes are guarded.
- Direct asset segment reads do not implement all GUI structural checks. The segment endpoint knows its producer,
  not every requirement of a consumer chart combining segments and observations.
- `REFERENCE` closure loading can read dependencies an operation never executes. Executed-edge acquisition and
  propagation of selected-output context through wrappers remain separate work.
- Browser destination checks reject raster-file array selections, but CCDC's Drive/workspace execution boundaries
  still need their own complete selected-shape validation.
- Some image-asset export work is prepared alongside readiness rather than strictly after it. Export refusal is
  established; a universal no-image-construction-before-refusal guarantee is not.

## Target design

The following sections describe unimplemented architecture. Existing operation record-sharing and GUI preflight
must not be represented as these stronger guarantees.

### Explicit resolution contexts

```js
resolveSourceGraph({rootRecipe, context: {mode: 'LIVE', principal, loadRecipes, describeAssets}})
resolveSourceGraph({rootRecipe, context: {mode: 'BUNDLED', recipesById, assetObservationsById}})
```

Live resolution reads the current authorized graph. Bundled resolution reads only supplied members and observations;
a missing member fails instead of falling back live. A server endpoint may orchestrate the shared traversal but
must not duplicate edge, capability or authorization rules. Transport alone does not establish coherence.

### Requirement and capability discovery

Selectors should query configured source instances, not infer suitability from type names. Cheap candidacy can
retain deliberate eligibility restrictions. Current records refine candidates; selected candidates get bounded
validation using the same requirements. Opening a picker must not load every closure or inspect every asset.
Unknown/unavailable candidates are not known unsuitable, and the current selection remains visible with diagnosis.

General discovery may need authorized summaries/indexes with revisions, asset evidence and contract versions.
It must not depend on loading the entire catalogue or a denormalized effective recipe type. A requirement with
several admissible capability instances needs explicit cardinality or instance selection. Permanently unknowable
semantic requirements are unsupported with `INSUFFICIENT_PROVENANCE`, not pending forever.

### Classification results and reusable classifiers

A classified result supplies pixels and category meaning; a reusable classifier supplies training and behavior
for another image. PyEO needs both baseline imagery and classification behavior. CCDC, Time Series and Phenology
also apply a classifier to collection imagery. Band/legend availability does not prove that capability.

Before admitting a masked Classification, define whether its mask affects the baseline, training footprint or
newly classified imagery for each operation. Preserve the selected wrapper wherever its output is used; resolving
the classifier must not silently discard the mask. An image masked before Classification is a different composition.

### Deletion and movement

Recipe deletion must not cascade. A future save-time reference index supports authorized direct/transitive
"used by" queries and dependent warnings without loading every JSON record. Index updates must agree with the saved
revision, and existing records need an indexing policy before completeness is claimed.

Processing references remain repairable after deletion; optional display references have a separate cleanup policy.
A 404 or listing absence alone is not proof of deletion. Rename and project movement retain ID-based references.
A future already-accepted execution bundle survives later recipe deletion; live Earth Engine availability does not.

### Coherent execution bundles

A trusted server boundary constructs the exact root and complete authorized dependency models, their revisions,
asset observations and a supported bundle schema version. Discovery and command binding use that same graph;
browser-built plans remain preflight. Assets are observations, never frozen pixels.

Loading sequentially is not atomic. Record every revision, resolve the closure, then coherently recheck revisions;
retry the whole build a bounded number of times or report changing sources. Enforce measured independent depth,
node-count and serialized-byte limits across storage, HTTP, worker transfer and task memory. A content digest is
optional until an integrity or provenance requirement justifies it.

#### Preview

Build a fresh ephemeral bundle for each request. Later source edits affect later previews, not work already in flight.

#### Retrieve

Build the bundle at task acceptance and store it with the task. Execution resolves recipe references exclusively
from that bundle. Unsupported schema versions and missing members fail with a controlled resubmission diagnosis;
there is no live fallback. Later loss of recipe access does not revoke the accepted recipe snapshot, while asset
permissions and pixels remain live. A preview fingerprint and a later submission fingerprint may differ and must
not be presented as identical.

### Earth Engine assets and provenance

Assets remain assets even when exported by SEPAL; `recipe_id` is provenance, not an execution edge.
Physical band names, types and grids come from observed schema. Mutable metadata can interpret a verified band
only under the contract that recognizes it; it cannot make a missing band exist or generically grant a capability.

Live asset currency currently uses metadata `updateTime`. Any future use of `system:version` needs normalization
as an opaque token and verification of collection membership/replacement semantics. Neither token pins EE execution.
A future bundle records observations before execution and checks for drift afterward where practical. The policy
for a completed drifted export—delete, retain as suspect, or ask the user—needs a destination-aware decision.

Trusted versioned provenance should bind asset identity/replacement evidence, accepted bundle, physical schema,
bounded presentation-envelope digest and relevant algorithm/adapter/capability versions at a trusted boundary.
Asset properties alone cannot provide that trust. Detailed source models belong in access-controlled task audit
storage unless sharing them is explicitly intended.

Existing CCDC assets retain their narrowly validated structural compatibility and legacy Slice templates; they do
not require a new provenance envelope merely to slice. Relational consumers may need stronger measurement evidence.
Known algorithm defects are corrected rather than preserved as legacy computations. No generic user assertion
turns unknown provenance into verified semantics.

### Observability and verification

Measure graph latency/size, changing-revision retries, controlled resolution outcomes, asset drift and provenance
use. IDs and usernames belong only in access-controlled logs, never metric labels. Add operational thresholds when
a concrete consumer establishes a baseline rather than inventing global limits.

Tests at the owning boundaries cover diamonds and cycles, unauthorized/missing reads, late subscribers and all
notification kinds, independent operations, candidate repair, confirmed findings beside pending evidence and
current-state submission. Future bundles additionally need two-user authorization, coherent-revision retry,
unsupported-schema/size limits and proof that missing members never load live. Live checks establish pixels, masks,
date representation and destination behavior that stand-ins cannot prove.

Open decisions include bundle limits/retries and transport, trusted provenance storage/canonicalization, asset-drift
output policy, capability-instance selection and the measurement evidence required by relational consumers.
