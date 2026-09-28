# Recipe data sources - architecture and roadmap

Technical index for aligning how SEPAL recipes consume other recipes and Earth Engine assets. This is a
cross-recipe concern. Masking, CCDC, CCDC Slice and Classification provide acceptance cases, but none owns the
shared model. User-facing documentation belongs in the separate `sepal-doc` repository.

## Current delivery focus

Make the shared output declaration the single band authority for every recipe type. The work after it —
requirement validation, capability projection and visualization applicability — needs a description for every
source, and falls back to per-type helpers wherever one is missing.

Consumer migrations should adopt the shared contracts, preserve existing behavior and fix regressions they
introduce. Existing limitations unrelated to those contracts belong in recipe developer notes, not as implicit
requirements of a migration. [PyEO Alerts](../../recipes/pyeo-alerts.md) records its deferred index-handling work
on that basis.

### Output-declaration migration

Only Asset, BAYTS Alerts, CCDC, CCDC Slice, Change Alerts, Class Change, Classification, Index Change, LandTrendr,
Masking, Optical Mosaic, Phenology, PyEO Alerts, Radar Mosaic, Regression, Remapping and Unsupervised Classification
declare an `IMAGE_OUTPUT` provider.

- Map layers, their forms, the visualization selector and editor, and every Retrieve panel over an image output read
  bands through the common read. A declared type is answered through its declaration there; any other is answered by
  the legacy seam. Retrieve panels take only labels and groups from a type's `bands.js`.
- Undeclared types keep independent GUI and Earth Engine band lists, which the
  [execution comparison](output-products.md#early-execution-comparison-findings) has shown to drift.

`getAvailableBands()` answers several [different questions](output-products.md#problem). A migration splits them
between their owners rather than wrapping the helper in a provider, which would carry its mixed meanings into the
shared contract:

- the configured recipe's output bands: the type's `IMAGE_OUTPUT` provider;
- bands shown by one map mode: a named map product, never an unqualified union with the canonical output;
- labels, tooltips, groups and display ranges: GUI band presentation;
- presets: product presets under [visualization ownership](visualizations.md).

Every type is to declare its image output; not declaring one is a migration state, not a supported answer. The
migration cannot land at once, so its order is chosen to keep that state in one place, removable by deletion alone,
and short-lived. Rework — rebuilding a consumer because a decision it depended on came later — is worse than a
temporary answer, because it cannot be deleted.

**Bounded Asset band and metadata acquisition.** Raw collection schema reads use the first image; configured Asset
recipes apply their filters first to support heterogeneous collections. GEE and Task share these reads, without
unfiltered mosaics or aggregate geometry. Encoding comes from the asset's own metadata. Execution extent and
compositing are unchanged, so collection-wide geometry can still make ASSET_BOUNDS drawing, preview and export
expensive. See [band discovery without image construction](output-products.md#band-discovery-without-image-construction).

Apply the same strategy as the remaining recipe families migrate. Audit Planet Mosaic, Stack and Band Math, whose
band readers construct their output, and the generic typed `/bands` path, which bypasses cheaper
catalogues. Establish which observations are necessary; do not assume every constructed graph is equally costly.
Known schemas belong in declarations and referenced schemas in provider reads; extend bounded acquisition only
where a family still needs observation.

1. **The consumer API**, settled before any consumer switches:
   - *Map-product identity.* A map layer names the product it displays and supplies that product's declared
     parameters; the absence of a mode is not an identity
     ([map-product identity](output-products.md#map-product-identity)). Only types with map modes depend on it:
     LandTrendr, BAYTS Alerts, Change Alerts and CCDC's `count`.
   - *Reading a recipe's own output.* Consumers read bands synchronously, so the read is synchronous and total. It
     answers with a status (resolved, needs observation, unavailable or invalid) and never acquires. Descriptions
     are dependency-scoped, so a provider that needs nothing from a missing source still answers, and structural
     soundness of the whole closure is reported separately
     ([reading a recipe's own output](gui-source-runtime.md#reading-a-recipes-own-output)). It reads the records
     the session holds, through the graph a map layer already derives, so Masking over an Optical Mosaic the
     session has loaded is answered at once. A terminal its acquisition owner retains answers the rest, while it
     is still about those records. Consumers never assemble dependency catalogues themselves.
   - *Acquisition ownership.* Every consumer that can need observation has an acquisition owner whose lifetime
     covers it. Reuse the source runtime and observation lifecycle; a synchronous getter never starts work.
     Migrating a working consumer must not leave it permanently empty because nothing acquires its answer.
2. **One seam, then switch the consumers once.** Types without a provider are answered in one GUI module from their
   registered helpers, as a distinct, unverified legacy answer — never as resolved evidence with physical facts or
   export policy. Map layers, preset filtering and Retrieve read through the same boundary for every type and do
   not branch on whether a type is declared. Retrieve's existing `UNDECLARED_OUTPUT` fallback is folded into that
   seam. Map layers of mode-bearing types stay on the seam until their map products are declared.
3. **Migrate families.** Each removes its entry from the seam and nothing else is touched twice, so their order
   matters less than their independence:
   - model-derived outputs: Regression, Unsupervised Classification, Index Change, Class Change, Classification,
     Remapping, Phenology and PyEO Alerts have migrated: each
     declares its scalar bands in execution order with their pyramiding policies, and Earth Engine's catalogue and
     optional-band conditions come from the declaration. Index Change declares `error` and `confidence` only when
     both images name an error band, and `change` only when its legend has entries. Class Change always declares
     `transition` and `confidence`; confidence is measured from both images' probability bands and is masked where
     either image holds none, while the transition is still computed. Classification declares `class` (mode), then
     `class_probability` for classifiers that support probabilities, `regression` for those that support
     regression, and one `probability_<value>` per legend entry in the legend's stored order (all mean); an export
     returns its selected bands in the order requested, which Retrieve makes the output's order. Without legend entries its schema is unchanged, but Earth
     Engine cannot build `class_probability`, so a probability-capable classifier's default output fails while a
     request for `class` alone still runs; that requirement is left to requirement validation. Remapping declares
     `class` (mode) only when its legend has entries, and otherwise no bands, which is what execution builds.
     Masking over either inherits these policies, so its `class` is exported with `mode` where its fallback
     applied `mean`. [Phenology](../../recipes/phenology.md) declares its 23 metrics and 12 months (mean); a month
     without observations is a masked band rather than a missing one, and an empty selection returns every declared
     band. [PyEO Alerts](../../recipes/pyeo-alerts.md) declares its 18 report bands (sample). Masking now describes
     Phenology from its declaration instead of observing its running image, which offered no bands, and exports PyEO
     with `sample` where its fallback applied `mean`;
   - map-product types: LandTrendr, BAYTS Alerts and Change Alerts. CCDC's `COUNT` is declared as a
     configuration-only map product
     ([declared products](output-products.md#map-product-identity)): one scalar `count`, never exported, whose
     layer acquires only its dependencies' validity. LandTrendr's canonical change result is declared: `yod`, `mag`,
     `dur`, `preval`, `postval`, `rmse` and `sig`, all scalar, with `sample` for `yod` and `dur` and `mean` for the
     rest, and no encoding. Masking over LandTrendr inherits those policies, so it exports `yod` and `dur` with
     `sample` where its fallback applied `mean`, and Task's asset export resolves LandTrendr as a declared root and
     requires its dependencies to be valid. Its annual mosaic is a declared map product taking `{year}` and
     delegating to Optical Mosaic, so LandTrendr has no legacy band entry left. BAYTS Alerts' canonical alerts are
     declared from the shared `ALERT_BANDS`: `non_forest_probability`, `change_probability`, `flag`, `flag_orbit`,
     `first_detection_date` and `confirmation_date`, all scalar and `sample`, with no encoding, whether a run starts
     from its own initial alerts or continues a previous run's; the layer's confidence filters mask pixels and change
     no band. Its Earth Engine catalogue answers from that declaration without reading its reference. Masking over
     BAYTS Alerts exports every alert band with `sample` where its fallback applied `mean`, and Task resolves BAYTS
     Alerts as a declared root and requires its dependencies to be valid. Its first and last radar observations are
     still answered by its legacy entry: their `{position}` parameter and delegation to Radar Mosaic are pending.
     Change Alerts' canonical changes are declared as `CHANGE_ALERT_BANDS` in its shared type:
     `last_stable_date`, `first_detection_date`, `confirmation_date`, `last_detection_date`, `confidence`,
     `difference`, `detection_count`, `monitoring_observation_count` and `calibration_observation_count`, all scalar
     and `sample`, with no encoding. Source type, confidence settings and observations decide masks and values, never bands, and
     the schema is known before a period or a reference is chosen; being described does not make such a recipe
     executable ([being described is not being executable](gui-source-runtime.md#reading-a-recipes-own-output)). Its Earth Engine
     catalogue answers from that declaration without resolving segments or computing a geometry. Masking over Change
     Alerts exports every change band with `sample` where its fallback applied `mean`. Its monitoring and calibration
     mosaics are still answered by its legacy entry: their `{period, mosaicType}` parameters and delegation to the
     configured Optical, Radar or Planet Mosaic are pending;
   - Radar Mosaic has migrated ([Radar Mosaic](../../recipes/radar-mosaic.md)). Its shared type declares each
     configuration: a stated target date makes a point in time - `VV`, `VH`, `ratio_VV_VH`, `orbit`, `dayOfYear`
     and `daysFromTarget` - and anything else a time scan of 25 bands, its 15 statistics then `_phase`, `_amp`,
     `_res`, `_const` and `_t` for each polarisation. All are scalar with no encoding; `orbit` keeps its mode,
     `dayOfYear`, `daysFromTarget` and the phases are sampled and the rest averaged, which changes the coarse pyramid
     levels of newly exported assets, Masking's included, and no full-resolution pixel. Earth Engine's catalogue
     answers the declared bands whatever is selected, while execution computes only the harmonics a selection needs.
     A point in time asked for nothing still builds every band it constructs. Construction bands - `angle`,
     `quality`, `unixTimeDays`, per-image harmonic terms - are not public, though explicit requests for them still
     build, so Masking over a point in time now offers six bands. A Sentinel-1 collection's measures for temporal
     consumers are a separate contract (`recipe/radar/collectionMeasures.js`). BAYTS' radar observations and Change
     Alerts' radar mosaics take their names from this schema while their products remain undeclared;
   - Planet Mosaic, BAYTS Historical and Time Series; collection-internal bands wait for
     [source planning](output-products.md#source-planning-and-collection-composition);
   - Stack, through the existing `inputs()` access for name-based selection and renaming. Review the correspondence
     between output and input bands before implementation; its capability preservation still waits for
     [capability projection](output-products.md#transformation-effects-and-capability-projection);
   - Band Math, which needs the provider outcome combining declared constraints with observation. That is a
     provider-contract change, so design it early rather than last.
4. **Make the declaration mandatory.** `imageOutput` becomes required, as `directSources` is. A type without an image
   product — Sampling Design — declares that explicitly. An undeclared type then fails at load rather than at
   runtime. Delete the legacy adapter, `noImageOutput` and the registered band authorities; retain the common
   consumer API. Labels, tooltips, groups and display ranges remain GUI presentation.

Each family is one packet, verified against the image its real `getImage$()` returns rather than against another
helper. Verification distinguishes the public bands available to request, the image built with no selection, and
the output of an explicit selection ([declaration and description](output-products.md#declaration-and-description)).
A default image need not contain every available band, and internal working bands do not become public merely
because they appear in that image. Each family states its default-selection behavior and verifies both default and
explicit requests. A family is done when its `bands.js` and Earth Engine `getBands$()` no longer define bands
independently of the declaration. What remains of `bands.js` — labels, groups and display ranges — is GUI band
presentation, not a migration state.

#### Contract reviews before the remaining migrations

Review Band Math's provider outcome and Stack's band correspondence before implementing those migrations. These reviews can proceed alongside other independent family migrations;
they must not wait until only the difficult families remain.

- **Band Math:** establish how configured output names and constraints combine with observed physical facts,
  including pending and failed evidence. Derive the smallest provider extension from actual expressions and
  consumers, rather than adding a general expression framework.
- **Stack:** establish which input band each selected or renamed output corresponds to. That relationship is the
  basis for later presentation and capability inheritance; copied source snapshots are not its authority. This
  review does not bring forward the deferred shared picker or capability-projection implementation.
- **Map products needing more than configuration:** extend provider access, acquisition identity and retained-answer
  validation together when a product actually needs referenced records or observations. Today's configuration-only
  products can reuse dependency-validity acquisitions across parameter changes; do not carry that assumption into
  a more demanding product without establishing what makes its answer current.
- **Execution requirements:** review the minimum shared result contract before implementing shared live descriptions.
  A description being `READY` and a closure being `VALID` do not establish that the recipe can execute. Requirements
  must be evaluated through wrappers and at execution boundaries, with their evidence and freshness explicit; they
  must not become empty schemas or independent panel guards. This brings forward contract review, while requirement
  validation remains a separate implementation packet below.

#### Preparation packets

Before implementation, inventory every band-helper call site, including direct imports in Retrieve and specialized
map layers. For each, name its product and parameters, read contract, evidence source, acquisition owner and
lifetime, pending/failure behavior, and legacy behavior that must be preserved. Include execution boundaries whose
refusal currently depends on an unavailable description. Review the inventory and plan before changing code.

Deliver steps 1–2 as three separately reviewable packets:

1. **Dependency-scoped descriptions and structural dependency checks.** The resolver and observer fail a
   description only on what its providers read, detect cycles on the path of provider reads, and withhold a
   recipe's own observation when any structural diagnosis lies below it. The complete closure answers
   `dependencyValidity` separately, and Retrieve and Task's asset export of a declared root require it to be
   `VALID`. A known
   schema is not permission to run ([dependency-scoped descriptions](gui-source-runtime.md#reading-a-recipes-own-output)).
   After a failed closure, `SourceEvidenceSync` re-observes when a record it read changes; restoring only the
   recipe it could not read does not.
2. **Common GUI read API and display consumers.** Map layers read the product they name through the common read,
   and retain what they acquire through the runtime's one-shot operations for as long as they are mounted
   ([who acquires](gui-source-runtime.md#reading-a-recipes-own-output)). Their forms, the visualization selector and
   the visualization editor are given that read. The editor's requests carry the product the layer shows.
   Map preview requires `VALID` dependencies.
   - Legacy answers stay unverified. Their display hints are presentation, as declared types' labels and cursor
     precision are.
   - Input workflows and Sampling Design filter the presets they copy against the names they observed.
   - The `SourceEvidenceSync` whole-graph check stays; what its removal needs is recorded with
     [live source evidence](gui-source-runtime.md#live-source-evidence).
3. **Retrieve consumers.** Retrieve reads its recipe's image output through the same API, and each panel owns its
   acquisition while open. Undeclared outputs, including declared wrappers over undeclared sources, are answered by
   the legacy adapter; acquisition failures, broken dependencies and invalid descriptions never qualify. A legacy
   answer supplies choices alone and never destination compatibility, export policy or encoding: an undeclared type's
   export sends no policy, so Earth Engine's own default applies, and a declared wrapper's fallback reaches only bands
   its evidence lifecycle currently vouches for as scalar. CCDC's measures and Slice's structured selection are translated into the names they export
   and checked against the answer. Task keeps its independent, authorized resolution through shared contracts and
   runtime adapters; it neither imports the GUI API nor trusts a browser description
   ([Retrieve integration](gui-source-runtime.md#retrieve-integration)).

Acceptance: a later recipe migration adds its declaration and removes its legacy entry without requiring another
consumer rewrite. Each packet identifies and removes the paths it supersedes. Use targeted tests while iterating;
reserve the full GUI suite for the final readiness check.

### Following work

In order, each independently mergeable:

1. **Shared live output descriptions**, immediately after the output declarations are mandatory and the legacy
   adapter is removed, with the execution-requirements contract reviewed first. Cached description readiness and
   structural validity must retain their separate meanings rather than implying execution readiness.
   The source runtime owns reusable descriptions and in-flight acquisitions; map layers and Retrieve subscribe to
   the same current answer rather than acquiring independently on every panel opening.
   Reuse the common read and acquisition contracts, with no recipe-specific caches.
   - One source-version registry tracks local draft changes, recipe revisions, credential context and observed
     asset versions. Relevant changes invalidate dependent answers immediately and trigger background refresh;
     superseded responses cannot publish. Closing one consumer must not cancel work another still needs.
   - Recipe revision refreshes and asset-version checks establish freshness. Prioritize assets used by active
     consumers and share checks across dependents. SEPAL operations can invalidate immediately; polling must cover
     external changes. Establish what collection versions reveal about member and metadata changes before relying
     on them. Polling intervals and acceptable evidence age belong to this packet's contract review.
   - Retrieve opens without a new acquisition when a current answer is held. Otherwise it waits for refresh, and
     Apply rechecks currency before accepting the answer. Refresh failures never authorize stale options.
   - Websocket recipe revision events can follow as a latency optimization; revision refresh on reconnect covers
     missed events, and correctness must not depend on notification delivery.
   This implements the interactive description-sharing part of
   [source freshness](source-freshness.md). Persisted calculation freshness and coherent task execution remain
   separate, later milestones. Acceptance: visualization and Retrieve share one acquisition for the same question,
   and dependency or credential changes withdraw its authority for both until a current answer is available.
2. **Instance-level requirement validation.** One shared `SUPPORTED | UNSUPPORTED | NEEDS_EVIDENCE` validator
   behind the recipe selectors, replacing type filters and type-level candidacy, and repeated at the execution
   boundary so saved, stale and directly submitted models fail with a stated diagnosis. See
   [requirement and capability discovery](source-resolution.md#requirement-and-capability-discovery).
3. **Declarative dependency evaluation**, starting with the
   [Band Math chain](#later-follow-up-band-math-dependencies).
4. **Capability projection, visualization applicability and snapshot retirement.** Transformation effects decide
   whether capabilities survive, including export-band subsets; visualizations are validated against the resolved
   product without positional remapping; Stack and Band Math stop treating copied input snapshots as authority.
   Include band-presentation inheritance: producers supply labels and optional descriptions through GUI
   presentation, and wrappers that preserve a band's meaning, such as Masking, preserve that presentation.
   Masking Retrieve currently falls back to raw names such as LandTrendr's `yod`. Resolve presentation through
   the source relationship, including Stack's reviewed selection and renaming correspondence, rather than adding
   producer-specific cases to Masking; transformations that change a band's meaning supply their own presentation.
   Translation stays in the GUI, and presentation never decides
   which bands exist or their physical or export properties.
   Keep semantic facts separate from consumer decisions: a band may state that it represents an observation date,
   while CCDC owns whether that quantity is suitable for fitting. Scalar or integer shape alone does not establish
   an appropriate pyramiding policy.
5. **Sampling Design derived-result freshness** ([milestone 5](#5-add-sampling-design-derived-result-freshness)).
6. **Caller-authorized closure reads and coherent execution**
   ([milestone 7](#7-complete-coherent-execution-and-live-freshness-infrastructure)).
7. **Source planning and the temporal collection composer**, following the
   [research plan](output-products.md#research-plan).

Recipe deletion warns about no dependents yet; [save-time edge indexing](source-resolution.md#deletion-and-movement)
is a separate small packet.

Visualizing a recipe whose dependency was deleted shows the user a raw JSON 404 error. This was observed manually;
its origin has not been investigated, and whether it is a regression is not established. Investigate the error
presentation separately.

**CCDC breakpoint selection while switching data sets.** The Sources panel clears selected breakpoint bands
when the data-set selection becomes empty: `Form.Buttons` prunes against the empty options even while disabled.
Preserve the selection through that incomplete editing state, then reconcile against the next configured
data sets. Switching Landsat 8 → none → Sentinel-2 must retain NDVI; a band unsupported by the new data sets
should be removed once their options are established. Applying with no data sets must remain blocked.

**Default colors for large categorical legends.** Replace the shared default-color overflow behavior, which
assigns the last of 20 palette colors to every further entry. Class Change can need many more colors: seven
source classes yield 49 transitions. Reuse the palette application's `pickColors(count, colors)` interpolation
to distribute default colors across the complete legend instead of adding a recipe-specific color generator.
Use entry position and total count, not category values, and account for Class Change's one-based codes skipping
the first color. Preserve saved and user-edited colors. Check categorical distinguishability at larger counts;
interpolation avoids a repeated final color but does not guarantee that every category is easy to distinguish.

## Scope and constraints

The architecture provides one contract for resolving sources, describing outputs, validating dependencies and
owning visualizations. It must replace recipe-specific copying, derivation and refresh logic incrementally rather
than introducing another parallel synchronization mechanism.

Recipe storage is the Node `recipe` module: reads and writes carry a trusted principal, and `revision` is
owned by the row. GEE reads referenced recipes as the user whose request it is serving, and a task executor as
its own worker session's owning user; neither holds administrator credentials, and the executor's state and
progress callbacks are authorized by that session against the task it was assigned. Each execution operation
retains each successfully read recipe for its own lifetime, so one operation cannot mix two revisions of the
same recipe. Failed reads can be retried. Authorized batch/closure endpoints and coherent execution bundles are
not implemented. Browser resolution completes a selected root's closure through the existing authenticated
per-recipe read and the shared batch-shaped traversal. Retrieve preflight retains those records locally; the live
evidence lifecycle uses the session's reference-counted loader. Neither makes browser evidence the execution graph.
Recipe Fill and instance-level capability discovery still require their own acquisition and validation contracts.

Activate output descriptions and capabilities one runtime boundary or consumer family at a time. Each milestone
must correct an existing defect or deliver a usable generic contract without requiring the rest of the architecture
to land.

## Design documents

- [Source resolution, dependencies and execution](source-resolution.md) owns source references, structured
  dependency edges, authorization, capability-provider lineage, graph traversal, evidence acquisition, execution
  bundles, provenance and task atomicity.
- [Source freshness, caching and invalidation](source-freshness.md) owns live source descriptions, fingerprints,
  refresh scheduling, race handling, availability, consumer dependency evaluation, derived-result freshness and
  map invalidation.
- [GUI source runtime](gui-source-runtime.md) defines the stable browser boundary through which components request
  source resolution without owning Redux catalogue state, loading or cache policy.
- [Recipe output products and band schemas](output-products.md) owns product identity, output-band description and
  declaration semantics; separates physical schema, export requirements, capabilities and GUI projections; and
  records the cross-recipe migration audit.
- [Visualization ownership and validity](visualizations.md) owns source presets, user-defined styles,
  transformation rules, selection validity, map use and export metadata.
- [Mask and Fill](mask.md) consumes these foundations and must not create a competing lineage or snapshot model.

Observability is cross-cutting. Each design document specifies its Prometheus metrics, structured logs and the
signals that require action.

### Recipe developer notes

Individual recipes' purpose, workflow, invariants and deferred local issues belong in
[`docs/recipes/`](../../recipes/README.md), separately from the shared designs and roadmap here.

## Shared model

### Sources

A source selected by a user is either a recipe reference or an Earth Engine asset reference:

```js
{type: 'RECIPE_REF', id: 'recipe-id'}
{type: 'ASSET', id: 'projects/project/assets/image'}
```

Recipes and assets share output-description and validation contracts, but not loading or revision semantics.
Recipes can be frozen into an execution bundle. Assets remain mutable under a stable ID and can only be observed
and checked for drift.

### Execution and semantics

The **execution source** supplies the pixels. A Masking recipe wrapping a Classification remains the execution
source; replacing it with the Classification ID bypasses the mask.

The **capability provider** supplies one named domain contract such as CCDC segments or classification categories.
Providers are capability-specific: one resolved output can preserve, derive or obtain different capabilities from
different nodes. There is no single effective or semantic recipe type. Terminal recipe type alone is not
compatibility evidence.

### Source descriptions and expectations

A source description is runtime evidence: the ordered bands available from the source with their export requirements
and encoding, provisional generic band semantics, source visualizations, capabilities, revision evidence and
diagnostics. It belongs to runtime state, not persisted recipe configuration.

A consumer expectation is derived from the consuming model. Selecting band `ndvi` means that `ndvi` must still
exist. Selecting a CCDC measure also requires the corresponding CCDC capability. Discovery updates available
choices but never silently replaces a missing saved selection.

Masking, Slice and Change Alerts read current descriptions rather than writing fresh copies beside the selection.
A copy in a saved recipe is the fallback while nothing has been observed, never the answer once something
has. The selection itself is durable intent and is never replaced by what it stands for: a Masking over CCDC
remains what executes while CCDC supplies the semantics, through selection, refresh, reopening and execution.

A source whose type has an image-output provider is described by resolving that
[provider](output-products.md#declaration-and-description) over the closure the lifecycle already completed. Its
running image is observed only where a provider asks for it, or when the source's type has no provider yet; a failed
acquisition or an invalid description withholds the answer rather than falling back to that observation. A directly
selected asset is read through its band evidence, encoding included. Band choices, visualization choices and preset
filtering all read the same evidence.

Live acquisition is owned by the shared source-evidence lifecycle: when to read, what a reading was based on,
cancellation, and rejection of superseded answers. It completes the closure of the selected source, not of the
consumer, so a consumer whose own configuration has lost a dependency can still acquire the source that would
repair it; the source's own dependencies still take part in invalidation. A consumer may declare what to do with
an answer that was accepted - its settings are written in the same action as the evidence, compared against the
last successful observation, so a failed read cannot reset user edits on recovery - and what to say when one was
not, since a panel that shows no withheld state would otherwise fail silently. One read answers everything asked
of one asset. Panel prefill can instead use a one-shot read: PyEO stages proposed configuration until Apply and
keeps acquisition separate from the decision to copy defaults.

### Products and capabilities

One canonical product, and a capability per requirement a migrated consumer has shown cannot be expressed
without one:

- the `IMAGE_OUTPUT` product: executable image, ordered output-band schema and per-band export requirements;
- `CCDC_SEGMENTS`: stored bands, base bands, measures and date interpretation, for CCDC Slice and Change Alerts;
- `BAYTS_HISTORICAL_STATS`: which record or asset produced the statistics BAYTS Alerts monitors against;
- `OPTICAL_COLLECTION_DEFAULTS`: the collection configuration and window PyEO Alerts fills its panels from.

A capability is a name and the declaration key it asks for. A recipe type states what it produces by declaring
that key, and the shared step (`capability/providerStep.js`) answers `PRODUCES` with what was declared,
`PRESERVES` with the input filling a declared preserving role, or `UNSUPPORTED`/`MALFORMED`. It is pure,
recognises no recipe type by name, and follows no mask, fill or AOI. Execution walks it as it loads records; the
GUI walks it over records the closure already resolved (`recipe/sourceProvider.js`), which answers
`{record, declared}`, `{assetId}` or a diagnosed `{error}`. Naming a failure, and deciding what a producer must
then prove, belongs to the capability that asked.

A declaration establishes what a consumer can READ, never what may execute. A producer declaring no
`OPTICAL_COLLECTION_DEFAULTS` still answers about its bands, still classifies and is configured by hand.
Candidacy is not evidence either: an asset mosaic declares where something would be read from, not what its
asset holds. Consumers therefore acquire source information and derive defaults as separate questions, and an
answer to one survives a failure of the other.

The adapters share the producer-step rule. Change Alerts and BAYTS candidate selectors use its declaration query;
Slice's selector and the four classification pickers still use type filters. Declaration candidacy does not establish
support for a particular wrapper instance; that requires resolving the selected source and its evidence.

An asset mosaic carries three declarations of the same shape, one per capability. Before adding another, review
whether a single "stands for its asset" declaration can express the shared fact without erasing capability-specific
requirements.

Add another capability only when a migrated consumer demonstrates that product schema, adapter identity and current
capabilities cannot express its contract. A future `CLASSIFICATION_RESULT` may be useful, but it should be defined
from real Classification consumers rather than guessed in advance.

Recipe definitions declare product-transformation guarantees, such as preserving ordered band schema and values at
valid pixels while changing the mask. Capability contracts declare which additional guarantees they require. The
product resolver combines those contracts bottom-up to preserve, decorate, derive or drop capabilities; it does not
copy arbitrary methods or properties from a terminal recipe onto a wrapper. This avoids changing every consumer when
a new pass-through recipe is added, and avoids changing every pass-through recipe when a new capability can already
be decided from its declared guarantees.

Transformations are not restricted to one-input decorators. A Stack can derive one output from several role-bearing
inputs, preserve a capability over an unchanged subset of output bands, or expose several instances of the same
capability. Consumer expectations state any required cardinality and selection constraints; the resolver never
chooses one matching instance silently.

### Shared contract home

Pure recipe contracts belong under `lib/js/shared/src/recipe`, grouped by responsibility: `source/` for references
and traversal, `output/` for products and transformations, `capability/` for named consumer requirements, and `type/`
for recipe definitions. They must not depend on React, Redux, Earth Engine or task infrastructure.
GUI, GEE and Task adapt the same contract at their boundaries.

Recipe-specific behavior belongs to one shared recipe definition per type. A single minimal catalogue imports
those definitions and indexes them by persisted recipe type; it contains no source, capability or presentation
logic. A definition must explicitly declare its direct sources or explicitly declare that it has none, and must
declare the output transformation needed for generic capability preservation. Adding a recipe must not require
updating separate switches for dependencies, bands, capabilities and runtime consumers.

The intended end state is that implementing a recipe primarily means declaring its model edges, output
transformations and capabilities, plus its own execution and UI behavior, through small, well-defined APIs.
Apply the [complexity and extension API guidance](../../code-design.md#complexity-and-extension-apis): shared
infrastructure may be complex, while each recipe implementation remains minimal and focused on its differences.
Recipe authors should not need to reconstruct graph traversal, acquisition, cancellation, refresh or submission
mechanics. Generic consumers derive behavior from the contracts rather than require copied orchestration or
per-recipe compatibility code.

A configured collection should own its source merging, filtering, normalization and band availability, with
execution and description reusing those rules. For example, CCDC should ask that collection which measures it
supplies and define how those become segment outputs; it should not reconstruct optical, radar and Planet
collection behavior. Review simplification by the responsibilities and knowledge removed from recipe code, not
by relocation into a shared directory or reduced line count alone.

During migration, recipe-specific adapters must remain thin and removable. Extract a new shared API only when a
second consumer demonstrates the same stable repeated shape; temporary fallback policy must not become part of the
permanent recipe API.

Recipe action builders should describe state transitions only. New source-resolution, observation and submission
work must start explicitly after dispatch through runtime or command boundaries, not through
`actionBuilder.sideEffect()`. When a migrated path already uses a reducer-side effect, remove it when behavior and
ordering can be preserved within that packet; unrelated uses remain separate cleanup work.

Known scientific or execution defects are corrected on the integration branch before the new contracts describe the
affected behavior. Contract versions identify deliberate durable contract evolution; they do not preserve old bugs as
supported algorithms. Existing assets produced by defective code receive no source-resolution workaround and may
need to be recreated when correctness matters. This does not prohibit backward-compatible readers for established
asset formats: preserving CCDC metadata and Slice usability is format compatibility, not preservation of a defective
algorithm.

Generic reference and edge modules know only canonical value shapes. Legacy model normalization and role names are
owned by the recipe definition that understands those fields. Roles are opaque to generic traversal unless a
cross-recipe contract explicitly gives one shared meaning.

Pure behavior is tested once in the shared library. Each runtime gets a thin environment witness proving that the
shared module resolves and executes under Vite or Node ESM, plus focused boundary tests for behavior owned by that
runtime.

### Recipe-type knowledge boundary

A recipe definition knows its own persisted model, direct source roles, transformation and capabilities it
intrinsically provides or derives. A consumer knows the capability it requires. Neither enumerates the concrete
recipe types on the other side. Concrete type dispatch belongs in the central registry, and temporary type-specific
migration adapters must have an explicit removal condition.

The maintenance tests for this boundary are:

- adding a pass-through or composing recipe does not modify existing consumers, selectors or Retrieve;
- adding a consumer adds an expectation, not a list of compatible recipe types;
- adding a capability does not modify existing transformations whose declared guarantees already decide whether it
  is preserved;
- adding a recipe type requires its definition and runtime implementation, not new cross-recipe switches.

## Normative policy map

Normative policy appears only in the owning design document:

- [Source resolution](source-resolution.md) owns explicit-principal authorization, edge completeness, cycles,
  deletion, diagnostics, execution eligibility, bundle lifetime and compatibility, asset observations, provenance
  and legacy evidence.
- [Source freshness](source-freshness.md) owns the session catalogue, conservative fingerprinting, refresh
  scheduling, race handling, map invalidation, consumer dependency evaluation and derived-result freshness.
  It consumes resolution diagnoses without redefining them.
- [Output products](output-products.md) owns product identity, output-band declarations, source-adapter commands,
  temporal collection composition, operation requirements and the boundary between canonical output, map products
  and GUI projections.
- [Visualization ownership](visualizations.md) owns source-preset and user-style ownership, applicability,
  transformation, map selection and export filtering.

This index records implementation order and scope. When a summary here appears to conflict with an owning
document, the owning document is authoritative and this index must be corrected.

## Acceptance scope

The shared contracts must cover:

- differently role-bearing edges in one recipe;
- direct and indirect cycles, missing sources and incomplete references;
- outer execution identity versus capability-provider identity;
- direct and transitive map invalidation;
- stale copied band and visualization snapshots;
- per-band export requirements through transformations and composition;
- controlled rejection of incompatible consumer expectations.

Keep each correction independently mergeable. Do not combine runtime output descriptions, visualization ownership,
domain capabilities and recipe-specific operation controls merely because one acceptance case exposes all of them.

## Architecture milestones

The numbered milestones retain their identifiers for cross-references and describe architectural dependencies,
not the current work queue; follow the delivery focus above. Current contracts and remaining work are identified
separately. Do not hold usable behavior until later architecture is ready. Coherent closure acquisition remains a
prerequisite only for the work that depends on it.

### 1. Establish runtime image output contracts

The shared `IMAGE_OUTPUT` contract describes outer execution identity, ordered bands, per-band export requirements
and evidence. The browser's one-shot runtime completes a bounded dependency closure, resolves providers and observes
bands through existing execution APIs where a provider asks for them. Retrieve consumes that description for band
choices, selection, destination compatibility and pyramiding policy, submitting the selected names; an unmigrated
recipe is answered by the legacy adapter, which supplies choices alone.

Remaining work:

- Extend output declarations to further consumers where they replace existing logic. Keep source observations in
  runtime state and remove each legacy policy only when its replacement is accepted.
- Verify exported pixels and metadata for the supported direct and wrapped sources. Runtime witnesses establish
  contract handoffs, not live Earth Engine computation.
- Keep declaration-driven array-band policies and destination checks consistent between forms and submission.
  Do not add recipe-type checks to Masking or silently apply an export-policy fallback to unresolved bands.

### 2. Stabilize Apply mask

Masking declares identity band mapping and preserved values at valid pixels. Its live evidence comes from the
selected primary source; copied bands and presets are only an unobserved compatibility fallback.

Remaining work:

- Extend the resolved description incrementally with preserved date range and source-visualization ownership.
- Capture current Earth Engine behavior, add explicit mask-band selection with legacy first-band compatibility, and
  validate required operation inputs.
- Verify Preview, map rendering, Retrieve and exported metadata against the same resolved output while preserving
  outer execution identity.

Exit criterion: Apply mask is behaviorally stable, stale source snapshots cannot silently win, and every supported
workflow executes the Masking recipe rather than a capability provider.

### 3. Ship constant Fill

- Add the operation discriminator with legacy Apply mask as its default.
- Implement a finite constant replacement for selected target bands.
- Preserve output band names, order, metadata and the primary footprint.
- Validate malformed saved models at both form and backend boundaries.

Exit criterion: constant Fill works in Preview and Retrieve and introduces no fill dependency, recipe catalogue,
bundle, provenance or caller-aware loading requirement.

### 4. Add direct asset Fill

- Add explicit name-based target-to-replacement band mapping.
- Resolve the replacement through the user's linked Earth Engine identity.
- Verify masks, projections and footprint behavior without introducing new recipe loading.

Exit criterion: asset Fill is validated end to end and cannot silently remap bands by position.

### Storage and loading prerequisites

`/api/processing-recipes` is served by the Node `recipe` module behind the authenticating gateway:

- recipe reads and writes use the trusted SEPAL principal; reads apply the owner-or-administrator policy without
  substituting service-account authority for the requesting user;
- `revision` is a column on the recipe row, injected as an additive top-level field and never stored in recipe
  content, with list, load and save all exposing the same committed revision;
- save accepts `expectedRevision` and returns the committed revision, so a client maintains a revision registry
  and detects concurrent writes;
- owner, non-owner and missing-principal behavior is covered by the module's own tests.

GEE and Task use caller-authorized readers and operation-scoped records. The remaining execution-bundle work is
trusted closure acquisition and graph-wide coherence. A batch or closure API can reduce round trips but does not
itself provide a coherent snapshot; a transaction or bounded revision-recheck protocol must establish that.

The full storage contract, including no-op save behavior and normalization requirements, is defined in
[source-freshness.md](source-freshness.md). `revision` is distinct from the existing `typeVersion`, which is
the recipe schema-migration version.

An endpoint may orchestrate the shared JavaScript traversal and bundle logic; it must not introduce a separate
definition of edges, capability rules or access policy.

### 5. Add Sampling Design derived-result freshness

Uses the existing storage `revision`. No interim unversioned-recipe path is planned or built:
there is no temporary browser content-hash bridge and no `update_time` freshness rung.

- Add the recipe snapshot provider that distinguishes an editable root draft from operation-local persisted
  dependency snapshots, keyed by `revision`. Dependency snapshots never enter the shared loaded-recipe map.
- Reuse the existing operation-scoped recipe records and shared in-flight reads. Add the exact recipe/asset
  evidence vector to derived results; record sharing alone does not establish persisted-result freshness.
- Resolve recipe AOIs through the AOI geometry product they expose, including transitive recipe and asset evidence,
  rather than teaching Sampling Design which recipe fields affect geometry. Unmigrated recipe types fall back to
  conservative whole persisted-source evidence.
- Add generic persisted `calculatedFrom` sidecars, operation-input fingerprint comparison and stale-response epochs.
- Migrate stratum areas first, then per-stratum probabilities, each declaring its own named source roles and
  parameters. Replace both existing per-panel calculation caches with the generic derived resource and remove the
  old module once both have migrated.
- On open and before Retrieve, refresh the dependency revision vector, re-resolve only changed dependencies, and
  mark results stale only when their operation-input fingerprint changed. Keep stale values as context, block their
  use and direct the user to recalculate.
- Treat a legacy result without `calculatedFrom` as `UNKNOWN`, blocking submission exactly as `STALE` does. Every
  existing Sampling Design result is in that position and needs one recalculation — potentially a batch
  calculation — before its next submission, with its existing values visible as context until then.
- Reuse the existing shared recipe-closure limits rather than defining another policy.

Exit criterion: a recipe or asset may change while its dependent Sampling Design recipe is closed. Opening that
recipe refreshes current source evidence; unchanged complete evidence preserves results without loading unchanged
recipe content; changed evidence re-resolves the consumed products; changed operation-input fingerprints mark the
affected results stale while unchanged fingerprints preserve them despite conservative revision changes; a late
calculation response cannot commit; and Retrieve revalidates afresh and blocks stale or unknown applicable results.
No update-time or temporary content-hash bridge is involved.

### 6. Add recipe Fill

- Reuse caller-authorized loading for the fill reference and define its acquisition and execution requirements.
- Reuse the shared graph for cycles, missing sources and execution-versus-capability-provider identity.
- Apply the same explicit band mapping and output-preservation contract as asset Fill.

### 7. Complete coherent execution and live freshness infrastructure

- Add explicit live and bundled resolution contexts on top of the authorized operation-scoped reader. A bundled
  operation must never fall back to live reads for a missing member.
- Build bundles by loading the closure and coherently rechecking every revision with bounded retries. A content
  digest remains optional until a concrete integrity or provenance requirement needs exact byte identity.
- Extend the session catalogue and product-scoped fingerprints established by Sampling Design with remote
  invalidation and coherent execution support.
- Extend the source-version registry and shared resources introduced by shared live output descriptions
  ([following work](#following-work)) to visualization applicability and Sampling Design stratum areas and
  per-stratum probabilities. Reuse their invalidation, in-flight deduplication and replay rather than creating
  another registry or recipe-specific caches.
- Extend remote invalidation to these resources; add websocket revision events if not already provided and,
  if justified, patch transport. Both remain latency and transport optimizations; correctness established in
  step 5 never depends on them.
- Progressively migrate recipe types to explicit AOI and image product projections, reducing the conservative
  whole-source recalculation that unmigrated providers fall back to.

### 8. Migrate CCDC Slice capabilities and visualizations

Slice and Change Alerts share the CCDC producer contract and source-evidence lifecycle. Their current execution,
date-format and compatibility rules are described in
[source resolution](source-resolution.md#current-segment-consumer-contract); GUI refresh and template identity
belong to [GUI source runtime](gui-source-runtime.md#live-source-evidence). No second synchronization or producer
discovery path is needed.

Remaining work:

- Replace Slice's hard-coded CCDC/ASSET_MOSAIC candidate filter with the declaration query, while keeping candidacy
  distinct from verified support for a specific recipe or asset.
- Define the closed `CCDC_SEGMENT_SLICE` transformation and structural capability evidence. The current mode-aware
  band derivation is not a complete capability-validation contract.
- Preserve existing CCDC Segments assets through a narrow structural asset contract. Interpret legacy
  `visualization_*` and `baseBands` properties as template configuration after validation; do not require assets
  to be recreated or rewritten solely to adopt that contract.
- Verify direct and masked segment sources against live Earth Engine, including ImageCollection retrieval,
  date representations and output-band semantics. Node runtime witnesses substitute external boundaries and
  cannot establish correct pixels.
- Keep Preview, map selection and Retrieve filtering aligned as validation strengthens. Structured provenance
  may support future consumers but is not a prerequisite for existing Slice assets.

### Later follow-up: Band Math dependencies

Implement one chain: **input band -> calculation -> output**. This is a separate consumer-validation packet,
independent of selector presentation and acquisition changes.
Follow the [declarative evaluation direction](source-freshness.md#declarative-dependency-evaluation), reusing the
shared source-observation lifecycle rather than adding another watcher, cache or source traversal.

1. Identify user configuration versus derived fields in Band Math's current sync path, including expression and
   output references. Preserve saved-model compatibility and intentional rename behavior.
2. Express the chain's consumed inputs, requirements and derived output through recipe-owned pure functions,
   using the existing expression parser. Use the same declaration and evaluation contract for local configuration,
   calculation outputs and current evidence from selected recipes or assets; only their providers differ.
3. Connect derived diagnostics to the owning sections and affected Preview/Retrieve operations. Remove the
   superseded bookkeeping for this chain; leave unrelated sync behavior alone. Recheck the same requirements at
   execution, so a closed panel or directly submitted model cannot bypass them.

Acceptance scenarios, without closing or reopening the recipe:

- Removing a required band identifies the affected calculation and output and prevents their execution, while
  preserving the expression and output configuration. Restoring the band restores validity automatically.
  Exercise the same rule for a local input-selection change and for a change to the external source's bands.
- Removing an unused band or changing only a visualization does not invalidate the calculation.
- An unavailable source is reported as unverified, not as a missing band; a superseded observation cannot change
  the current diagnosis. Cover source replacement and upstream changes under the same recipe or asset ID.

Use requirements exposed by Change Alerts as another real consumer when shaping the evaluation contract.
Sampling Design's persisted-result freshness remains
step 5; neither its planner nor all input forms are rewritten here. The declaration API is determined by these
workflows, not by a speculative framework or synthetic consumer.

### 9. Source selection and further consumers

Extend the shared contracts where a consumer demonstrates a requirement. Keep selector presentation, source
compatibility, panel defaults and execution behavior as separate responsibilities and separately reviewable work.

Still to do here:

- Add an **Open recipe** action to the shared recipe selector, enabled when a recipe is selected. Focus its
  existing SEPAL tab by recipe ID, or open it in a new tab without replacing the current recipe. Preserve
  unsaved edits in existing tabs and support references across projects. Keep navigation in a shared
  open-or-focus operation that reuses normal recipe loading and revision initialization. Navigation may load
  on click; displaying the button or changing the selection must add no reads to the selector's callback contract.
- Define [classification output versus reusable classifier behavior](source-resolution.md#classification-results-and-reusable-classifiers)
  before admitting masked classifications to PyEO, CCDC, Time Series or Phenology. Decide mask semantics for the
  baseline image, training and newly classified monitoring images; never unwrap a selection and silently drop it.
- Surface recipe-dependency diagnostics in the GUI's shared layer-error handling. A rejected cycle should
  explain the circular dependency and show its path, using known recipe names where available, instead of
  only "Failed to load layer - Bad request". Preserve the execution rejection and retain a generic fallback
  for unrecognised failures. Cover the diagnostic's passage from the execution response to the visible error.
- Continue one consumer family at a time. Likely groups are the remaining alert recipes, Stack and Band Math,
  generic image inputs and Classification/Regression reuse. Every migration needs a stated stopping rule,
  coexistence plan and removal of the superseded local synchronization path.

### Band encoding

Each band of an image output may state what its stored values mean: `physical = stored * scale + offset`, in
`unit` where established. The field is part of the shared output-band record described in
[output products](output-products.md#output-band-description); it describes representation, not measurement
identity, and it is numeric encoding, not pixel size. Absent is unknown — never 1, and never inferred from band
names, data types or a producer's current configuration.

**Producers.** A producer states the encoding of the bands it actually emits. The optical mosaic declares a
available bands derived from its persisted model: the data sets that actually contribute observations (the selected
scenes' data sets when scenes are picked by hand, after alias expansion and model migration), and the indexes and
tasseled-cap components computable from the logical bands they share. Without a contributing data set nothing can be
asked for, whatever the composing method. The same rule is execution's `getBands$()` and the GUI's index
availability. Normalization maps native data-set encodings onto reflectance and kilokelvin, and the composer stores
every composited band at 10000 per unit of that quantity, so reflectance bands, indexes and tasseled-cap components
are stored at `1e-4` (`'1'`) and thermal bands at `0.1` (`'K'`). Date bands, added after storage, and the native
`qa` bitmask are undeclared.

**Transformations.** A preserving provider carries each available band with its encoding. Any other provider states
its own output; a band keeping its name through a calculation inherits nothing. An Asset recipe provides the bands
its own configured image holds — its filtering, masking and compositing included — because a collection asset is
read as its first image, which a recipe filtered to any other one does not provide. Its encoding comes from the
asset's own metadata, never from the properties its running image carries: it keeps that encoding for an image and
for mosaic, median, mean, minimum, maximum and mode composites, whose values are stored values or linear in them,
while a standard-deviation composite leaves encoding unknown. A band the asset reading does not hold has no stated
encoding to take, so it stays unknown.

**Persisted form.** An Earth Engine string property of an image or an image collection holds at most 16,384 UTF-8
bytes. A direct property update rejects a larger value; a batch export accepts one and completes with the property
silently missing. That is the measured limit for those two metadata paths — not a universal Earth Engine property
limit, and no safe number of properties per asset was established. A 31-band optical output takes about 1.5 kB, but
an output with hundreds of bands does not fit one property: 293 bands take about 17 kB.

An export therefore writes the encoding as a manifest plus as many parts as it needs, each within the limit:

```json
sepal_band_encoding    {"version": 2, "parts": 2}
sepal_band_encoding_1  {"red": {"scale": 0.0001, "offset": 0, "unit": "1"}, "…": {}}
sepal_band_encoding_2  {"…": {}}
```

Bands with unknown encoding are absent from the parts. The manifest alone says what the value is: every part it
names must be readable, or nothing is known — a partial dictionary would otherwise read as an authoritative
statement that the missing bands have no encoding. A property the manifest does not name is left over from an
earlier write and is never part of the value, which is what stops an inherited or obsolete property from becoming
authoritative. Within a complete representation a malformed entry withholds only its own band. The manifest is
always written, with no parts when nothing is known. Version 1, which held the whole dictionary inline in
`sepal_band_encoding`, is still read; the version is part of the durable contract, and an unsupported version is
unknown, not guessed. At most 64 parts are written or read, so a reader can name every property it needs before it
reads the asset.

**Failure.** An encoding that cannot be represented stops the export: a band whose single entry exceeds a whole
property, or more parts than can be read back, fails before anything is created, replaced, deleted, updated or
submitted, naming the entry or property, its measured size and the limit. There is no truncation, no partial
encoding and no silent downgrade to unknown. Size is measured on the string the property is set to, not on its
characters and not on the request body. The same limit governs the property filter in front of `setAssetProperties`,
which keeps a value Earth Engine would reject from failing the whole write; a property of another origin that
exceeds it is still dropped there.

**Export authority.** The task resolves the output description itself, from the recipe it exports: it completes the
recipe's closure through its own operation-scoped reader and resolves the shared providers, so the description and
the exported image come from the same records. The export names its bands, the image returned has exactly those
bands, and encoding is written for them; an export naming none builds the producer's default image, which the
available bands do not describe, and records no encoding. Where the only thing resolution reports is an undeclared
output — the exported recipe's own, or that of a recipe it depends on — the export proceeds as before with unknown
encoding. A failed read, an incomplete closure or an invalid description fails the export rather than being
recorded as unknown, and so does a closure whose dependencies are not structurally sound, even where the
description reads none of the broken part.

An image collection keeps its existing tiles unless it is replaced, so its encoding must describe those too.
Resuming compares the persisted and proposed encodings as facts:

| Established encodings | Outcome |
|---|---|
| disagree for a band: a different scale, offset or stated unit | refused before any property changes or tile is submitted; use Replace |
| agree for the same set of bands, with the same units stated | the encoding is kept |
| incomplete, with no contradiction (absent, empty, partial, unreadable or unsupported metadata — a missing part included — or a unit stated on one side only) | exported as explicitly unknown |

**Asset reading.** Asset band evidence reads the encoding in the same evaluation as the bands and their
dimensionality, however many properties it occupies. An asset without the property, or with an unreadable, unsupported or partially malformed one, still
describes its bands, and each band it cannot establish is unknown; a failed evaluation remains a failed read. A
recipe's encoding comes from its provider and is never read from its running image. An image collection is read
through its own properties; consuming a collection requires its members to be homogeneous in the bands and encoding
consumed, which is what lets one description stand for the whole.

**Not included.** Nothing converts pixels or visualization ranges. Convert at one boundary, never both, when a
consumer needs physical values; derived quantities need their own rules, and phase and timing do not inherit a base
band's multiplier. Other producers, export destinations, charts and legends adopt the contract separately.

## Deliberately deferred

- Consolidate [structured band selection](output-products.md#structured-band-selection-deferred) across producer
  and preserving-wrapper Retrieve panels, using CCDC and Slice as the first cases. This includes base-band/result-type
  relationships and a shared picker, beyond option grouping; defaults and automatic band inclusion need explicit
  policy. Keep it separate from band encoding and catalogue correctness.
- Decide asset date-format authority separately from source-resolution migrations: whether a stated asset format
  can be overridden, and how missing or incorrect metadata can be corrected. Preserve the current explicit
  override, including zero, until that decision defines validation and saved-recipe compatibility.
- Explore [map inspection and capability-driven layer actions](map-inspection.md), including charts for added
  layers. Discussion only; scope and scheduling undecided.
- Persistent source metadata across page reloads.
- A distributed GEE metadata cache.
- Fine-grained data/schema/presentation fingerprints.
- Automatic repair of missing band selections.
- Live input-imagery panel refresh when the selected source recipe changes without changing its ID. Start with
  the shared Stack/Remapping form after the bounded Band Math follow-up above. Refresh available bands and
  visualizations while the panel stays open, applying the same dependency-evaluation rules. This remains separate
  from correcting explicit asset/recipe switching and must preserve live visualization propagation into Masking.
- One repository-wide migration commit.
- Recipe Fill before its source acquisition and execution requirements are defined.
- Execution bundles before trusted closure acquisition, graph-wide coherence and task acceptance are implemented.
- Any interim unversioned-recipe freshness path: no temporary browser content hashing and no `update_time`
  freshness rung. Persisted derived-result freshness uses the existing `revision` contract.
- Requiring domain-capability work as a prerequisite for constant Fill.
- Project requested output bands once, at the export boundary, rather than in each producer. Every producer must
  honor `outputBands` itself today ([current limitation](output-products.md#current-execution-request-limitation)),
  and BAYTS Alerts and Change Alerts each project it separately. Only live evidence
  (`modules/gee/verify/declaredOutputBands.mjs`) guards those projections, since observing a selection without Earth
  Engine means emulating it. Selecting the named bands after a producer builds its image closes that class for every
  producer. First audit which producers still honor neither the selection nor `outputBands`; remove the
  per-producer projections once the boundary owns them. Change Alerts' `toChanges` threads `selection` only to
  sequence its segment source, and that chain goes with them.
- One authentication helper for the `modules/gee/verify` scripts. Each script carries its own copy of the
  service-account and linked-user sign-in.
- Shared gateway-authentication middleware for Node/Koa modules. Extract the repeated `sepal-user` parsing,
  `ctx.state.currentUser` assignment, 401 handling and role guards from Recipe, Budget, Message, Scene Metadata
  and Worker into shared HTTP infrastructure, with loggers injected at composition roots. Preserve each module's
  role combinations and response contract, and land this as a dedicated cross-module commit rather than as part
  of Recipe source resolution.

### Task-driven asset invalidation

Connect task completion to the shared asset-freshness design in a separate packet.

- Exporters report actual affected asset IDs to shared asset invalidation, without knowing which recipes or
  layers consume them. Invalidate when a destination may have changed and recheck after success, failure or
  cancellation; an unsuccessful replacement can still have deleted or partly rebuilt the destination.
- Handle present -> missing -> changed transitions, including partially populated collections. Preserve saved
  references and selections during temporary absence, withhold unavailable imagery, and refresh active consumers
  when the asset returns. Notifications trigger reads of actual state, not blind catalogue additions or removals.
- Keep catalogue scanning and explicit refresh for external changes and missed notifications.

### Physical-value presentation

General physical-unit legends, charts and pixel inspection remain deferred beyond the bounded
[band-encoding contract](#band-encoding). Slice's description and visualization consumers need no producer-specific
encoding knowledge: producers supply ready-to-use descriptions and visualizations. Share encoding declarations
between execution and preset conversion where that removes duplicated assumptions without changing pixel values
or reinterpreting saved ranges.

**Input-aware Index Change defaults.** Derive the default difference visualization from resolved input-band
semantics and trustworthy ranges, accounting for encoding and units. The current preset uses copied input ranges,
whose input-form fallback is -10,000 to 10,000. For two probability bands bounded by [0, 1], such as Dynamic World
tree probabilities, the difference is bounded by [-1, 1]. In general, `to - from` has bounds
`[toMin - fromMax, toMax - fromMin]` when both ranges are known and expressed in compatible units. Distinguish
semantic bounds from a chosen display stretch; encoding alone establishes neither. Keep this as presentation
work, without changing pixel arithmetic, and preserve user-edited or saved styles. Define a fallback for unknown
ranges when the richer input-band contract is designed.

The narrow radar RGB preset correction need not wait: its ratio range must match the existing x1000 encoding,
not the x100 used for VV/VH. Verify matching ranges and unchanged pixel encoding without broadening this into
an all-product migration.
