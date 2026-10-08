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

Every recipe type with an image declares an `IMAGE_OUTPUT` provider: Asset, Band Math, BAYTS Alerts, BAYTS Historical,
CCDC, CCDC Slice, Change Alerts, Class Change, Classification, Index Change, LandTrendr, Masking, Optical Mosaic,
Phenology, Planet Mosaic, PyEO Alerts, Radar Mosaic, Regression, Remapping, Stack, Time Series and Unsupervised
Classification. Sampling Design, which has no image, declares `NO_IMAGE_OUTPUT`; registration refuses a type that
states neither.

- Map layers, their forms, the visualization selector and editor, and every Retrieve panel over an image output read
  bands through the common read, which answers every type through its declaration. Retrieve panels take only labels
  and groups from a type's `bands.js`.

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

Apply the same strategy as the remaining recipe families migrate. Audit the generic typed `/bands` path, which
bypasses cheaper catalogues. Establish which observations are necessary; do not assume every constructed graph is equally costly.
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
     session has loaded is answered at once. A terminal the source runtime holds answers the rest, while it is
     still about those records. Consumers never assemble dependency catalogues themselves.
   - *Loading ownership.* Every consumer that can need observation watches its question while it is open, and the
     source runtime loads and holds the answer for every consumer watching it; a synchronous getter never starts
     work. Migrating a working consumer must not leave it permanently empty because nothing loads its answer.
2. **One read, then switch the consumers once.** Map layers, preset filtering and Retrieve read through the same
   boundary for every type and do not branch on how a type describes its output. Types without a provider were
   answered there by an unverified legacy seam until every type declared its output (step 4), which removed it.
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
     the declared `RADAR_OBSERVATION` map product, taking `{position: 'first' | 'last'}` and delegating to Radar
     Mosaic's point-in-time declaration over the same radar options; a monitoring period that cannot place the
     position is refused rather than described as another mosaic, so BAYTS Alerts has no legacy band entry left
     ([BAYTS Alerts](../../recipes/bayts-alerts.md)).
     Change Alerts' canonical changes are declared as `CHANGE_ALERT_BANDS` in its shared type:
     `last_stable_date`, `first_detection_date`, `confirmation_date`, `last_detection_date`, `confidence`,
     `difference`, `detection_count`, `monitoring_observation_count` and `calibration_observation_count`, all scalar
     and `sample`, with no encoding. Source type, confidence settings and observations decide masks and values, never bands, and
     the schema is known before a period or a reference is chosen; being described does not make such a recipe
     executable ([being described is not being executable](gui-source-runtime.md#reading-a-recipes-own-output)). Its Earth Engine
     catalogue answers from that declaration without resolving segments or computing a geometry. Masking over Change
     Alerts exports every change band with `sample` where its fallback applied `mean`. Its monitoring and calibration
     mosaics are the declared `COLLECTION_MOSAIC` map product, taking `{period: 'monitoring' | 'calibration',
     mosaicType: 'latest' | 'median'}` and delegating to the Optical, Radar or Planet Mosaic declaration its own
     sources name, over the recipe one shared projection builds for both description and execution. A period or
     source that cannot build it is refused, and the reference is never read to describe it, so Change Alerts has no
     legacy band entry left ([Change Alerts](../../recipes/change-alerts.md)). Its period's dates, like BAYTS' target,
     come from one shared calendar that keeps years below 100 literal;
   - Radar Mosaic has migrated ([Radar Mosaic](../../recipes/radar-mosaic.md)). Its shared type declares each
     configuration: a stated target date makes a point in time - `VV`, `VH`, `ratio_VV_VH`, `orbit`, `dayOfYear`
     and `daysFromTarget` - and anything else a time scan of 25 bands, its 15 statistics then `_phase`, `_amp`,
     `_res`, `_const` and `_t` for each polarisation. All are scalar with no encoding; `orbit` keeps its mode,
     `dayOfYear`, `daysFromTarget` and the phases are sampled and the rest averaged, which changes the coarse pyramid
     levels of newly exported assets, Masking's included, and no full-resolution pixel. Earth Engine's catalogue
     answers the declared bands whatever is selected, while execution computes only the harmonics a selection needs;
     a point in time asked for nothing builds its six bands and no harmonics. Construction bands - `angle`,
     `quality`, `unixTimeDays`, per-image harmonic terms - are not public, though explicit requests for them still
     build, so Masking over a point in time now offers six bands. A Sentinel-1 collection's measures for temporal
     consumers are a separate contract (`recipe/radar/collectionMeasures.js`). BAYTS' radar observation is described
     by this declaration, as are Change Alerts' radar mosaics;
   - Planet Mosaic has migrated ([Planet Mosaic](../../recipes/planet-mosaic.md)). Its shared type declares one
     schema from the configuration alone, the same on every branch: `blue`, `green`, `red`, `nir`, then `ndvi`,
     `ndwi`, `evi`, `evi2`, `savi` and `kndvi`, all scalar and averaged. Indexes are encoded at ten thousand per unit,
     as are the spectral bands of Daily with histogram matching, which maps them onto a reference at that scale; other
     spectral bands keep their assets' unstated scaling. What Daily without matching builds beyond that for an empty
     request - its working bands, and PSB.SD imagery's other bands - is not public, though explicit requests for them
     still build, and a branch Earth Engine cannot run, such as that composite over four-band and eight-band imagery
     together, describes the same bands. Its Earth Engine catalogue answers the declaration without building the
     image. Retrieve, Masking and Stack therefore offer `kndvi`, and Change Alerts' Planet mosaics are described by
     this declaration. The Planet choices temporal recipes offer are a
     separate presentation vocabulary, unchanged, and a Planet collection's measures remain CCDC's;
   - BAYTS Historical has migrated ([BAYTS Historical](../../recipes/bayts-historical.md)), in two separately
     reviewable changes. Its producer first honours physical-output requests: a nonempty `outputBands` gets exactly
     those names, in request order, and any other request the complete declared output; a bare `selection` keeps
     its existing meaning, which requests no bands here. An unknown name then fails the request instead of returning
     a different schema. Its shared type then declares, in stored orbit order and per orbit, `VV_mean`, `VV_std`,
     `VH_mean`, `VH_std`, `orbit`, `VV_speckle` and `VH_speckle` with `_asc` or `_desc` suffixes - the order execution
     builds - all scalar, `mode` for the orbit numbers and `mean` for the rest, with no encoding, so new exports,
     Masking's and Stack's included, change at coarser pyramid levels only for orbits. Missing, empty, malformed or
     unknown orbit choices and repeated passes are refused before anything is read, never normalized. Both orbit
     bands show as whole numbers. Its Earth Engine catalogue answers the declaration without building anything.
     Retrieve still exports all bands to Earth Engine only, and `historicalStatsSource` remains the separate
     capability BAYTS Alerts reads. Each pass is built from that pass's imagery alone; a configured pass without
     scenes in the period keeps its bands, fully masked, and a history none of whose passes has scenes is refused;
   - Time Series has migrated ([Time Series](../../recipes/time-series.md)). Its shared type declares one scalar
     `count`, averaged, with no encoding, whatever its sources, and its Earth Engine catalogue answers it without
     building the collection. Its map keeps reading `IMAGE_OUTPUT`. Its chart and its SEPAL export are measures of
     its collection, not bands of this image, and keep their own contracts; collection-internal bands wait for
     [source planning](output-products.md#source-planning-and-collection-composition). Its GUI registration states
     it is no image source, which keeps it out of source pickers. Execution builds its count whatever is asked for;
   - Stack has migrated ([Stack](../../recipes/stack.md)). Each output band corresponds to one band of one input:
     the input images in model order, and within each the bands its mapping names. Through `inputs()`, an output
     band takes that input band's dimensionality, pyramiding policy and encoding under its new name, from the input's
     current description rather than the snapshot copied at selection; a scalar its input states no policy for is
     averaged, while an array gets no policy it was not given. A mapping
     is checked before any input is read: an image without one, a blank name or a final name already taken is
     refused, and a band the input does not hold is refused once it is read, as is an input with no image output.
     Its Earth Engine catalogue answers the mapped names without building the image. New exports
     therefore sample arrays, take their sources' policies - `mode` for a classification - and record their
     encoding, and Masking over Stack exports those policies; capability preservation still waits for
     [capability projection](output-products.md#transformation-effects-and-capability-projection);
   - Band Math has migrated ([Band Math](../../recipes/band-math.md)). Its declaration names its configured output
     bands in configured order under their final names, and refuses two alike before anything is read. Its running
     image is observed for dimensionality alone and must carry exactly those names, or the provider refuses it
     (`CONFLICTING_OBSERVATION`); nothing is offered while that observation is pending. A verified scalar is averaged
     at coarser pyramid levels, as Earth Engine's default always exported it, a verified array is sampled, and a band
     whose dimensionality was not observed is refused; no encoding is stated. Arrays can therefore be exported
     to Earth Engine alone. Its Earth Engine catalogue answers the configured names without building the image.
     Masking over Band Math exports those policies, so a scalar named `change` is averaged where Masking's fallback
     took its mode. Through `inputs()` it also requires every band an input includes to be a band of that input's
     current description, refused as `MISSING_INPUT_BAND` where it is included, and holds each input to its whole
     description as Stack does - so an input that cannot be described refuses it, Earth Engine building it or not;
4. **Make the declaration mandatory.** `imageOutput` is required, as `directSources` is. Sampling Design, which
   produces no image, declares `imageOutput: NO_IMAGE_OUTPUT`; read as an image it is refused as `NON_IMAGE_OUTPUT`,
   which is definitive, located at the design through any wrapper, and stops a generic image export. A type stating
   neither fails at registration. The legacy adapter, Retrieve's legacy and evidence authorities, and the registered
   band authorities are deleted; the common consumer API remains. Input eligibility is stated apart from output: every
   GUI registration states `imageSource: true | false`, refused at registration without it, and the pickers offering
   recipes as images - input imagery, a map layer's source, an area of interest - offer only image sources. CCDC, Time
   Series and Sampling Design are not, though CCDC and Time Series declare images, and Masking's image to mask still
   takes a source of segments, CCDC included. Eligibility for those pickers is not proof that a recipe executes.
   Every band of a READY description has established dimensionality: `dataType.arrayDimensions` is a nonnegative
   integer (0 for scalar, positive for array), supplied by declaration, inheritance or observation. A band without
   it is refused as `INCOMPLETE_IMAGE_OUTPUT` at `['bands', i, 'dataType']`, so an asset or a running image observed
   without it is never described, in the GUI or in Task; Band Math and Stack no longer state a band of unknown shape.
   A provider asking only which bands it can be asked for - CCDC - still observes names alone and establishes their
   shape from its declaration. The map renderer and the visualization editor offer only established scalars. Empty
   outputs remain valid; encoding, units and meaning can remain unknown. Labels, tooltips, groups and display ranges
   remain GUI presentation.

Each family is one packet, verified against the image its real `getImage$()` returns rather than against another
helper. Verification distinguishes the public bands available to request, the image built with no selection, and
the output of an explicit selection ([declaration and description](output-products.md#declaration-and-description)).
A default image need not contain every available band, and internal working bands do not become public merely
because they appear in that image. Each family states its default-selection behavior and verifies both default and
explicit requests. A family is done when its `bands.js` and Earth Engine `getBands$()` no longer define bands
independently of the declaration. What remains of `bands.js` — labels, groups and display ranges — is GUI band
presentation, not a migration state.

#### Contract reviews before the remaining migrations

These reviews can proceed alongside independent family migrations; they must not wait until only the difficult
families remain.

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
   After a failed closure, the evidence registry re-observes when a record it read changes; restoring only the
   recipe it could not read does not.
2. **Common GUI read API and display consumers.** Map layers read the product they name through the common read,
   and retain what they acquire through the runtime's one-shot operations for as long as they are mounted
   ([who acquires](gui-source-runtime.md#reading-a-recipes-own-output)). Their forms, the visualization selector and
   the visualization editor are given that read. The editor's requests carry the product the layer shows.
   Map preview requires `VALID` dependencies.
   - Input workflows and Sampling Design filter the presets they copy against the names they observed.
   - The evidence registry's whole-graph check stays; what its removal needs is recorded with
     [live source evidence](gui-source-runtime.md#live-source-evidence).
3. **Retrieve consumers.** Retrieve reads its recipe's image output through the same API, and each panel owns its
   acquisition while open. Its description is the one export authority: choices, destination compatibility and
   policies come from it, and acquisition failures, broken dependencies, invalid descriptions and a recipe with no
   image output block. CCDC's measures and Slice's structured selection are translated into the names they export
   and checked against the answer. Task keeps its independent, authorized resolution through shared contracts and
   runtime adapters; it neither imports the GUI API nor trusts a browser description
   ([Retrieve integration](gui-source-runtime.md#retrieve-integration)).

Acceptance: a later recipe migration adds its declaration and removes its legacy entry without requiring another
consumer rewrite. Each packet identifies and removes the paths it supersedes. Use targeted tests while iterating;
reserve the full GUI suite for the final readiness check.

### Following work

In order, each independently mergeable:

1. **Shared live output descriptions.** The declaration migration is complete. Implement this work in three
   separately reviewed packets, following the [delivery contract](source-freshness.md#shared-output-description-delivery):
   - **Packet 1, implemented:** runtime-owned watches for every active map/Retrieve question, including
     descriptions answered locally without loading. Equal work is shared across consumers, with reference counting,
     cancellation, held failures and bounded retention. Existing conservative local content and credential
     invalidation, source evidence and the common read are preserved. No external freshness claim is added.
   - **Packet 2, implemented:** recipe revision freshness and shared observations. Answers keep evidence of the
     records they read and are withdrawn when a newer revision or a withdrawn listing supersedes it; the listing is
     refreshed while outputs are watched; drafts are never replaced, and Retrieve waits for or refuses a dependency
     draft storage does not hold. Band observations are shared by what Earth Engine evaluates
     ([contract](source-freshness.md#packet-2-recipe-revisions-and-shared-observations)).
   - **Packet 3, implemented:** asset evidence for every active consumer - a metadata `updateTime` token, polled while
     visible, invalidated by this session's mutations and by failures naming an asset - withdraws descriptions and
     export authority it supersedes, and redraws only what an asset change, an input change or an explicit Refresh
     requires; elapsed time, unchanged checks, replaced credentials and transient failures keep existing drawings.
     Source evidence is no longer a change signal
     ([contract](source-freshness.md#packet-3-asset-freshness-and-redraw-signaling)).
   Description loading and refresh are distinct from satellite acquisitions. Reuse the existing runtime and pure
   read contracts, with no recipe-specific caches. Schema, structural validity and execution requirements remain
   separate; no unused requirements resource or readiness framework is introduced here. A reused description does
   not establish unchanged pixels. Task remains independent, and named map products cannot authorize exports.
   Acceptance: map and Retrieve share work for the same question, closing one preserves the other's work, and Apply
   rejects outdated authority before component effects run. Refresh failure never authorizes stale options.
   Persisted calculation freshness and coherent execution remain later milestones. Websocket revision events are
   optional latency improvements; correctness must not depend on notification delivery.
2. **Configured-source requirement validation.** Check whether a particular recipe or asset meets a consumer's
   requirements, using its configuration and available evidence. Change Alerts REF is implemented
   ([contract](source-resolution.md#change-alerts-ref)), and so is CCDC Slice SRC
   ([contract](source-resolution.md#ccdc-slice-src)), and BAYTS Alerts REF and PRC
   ([contract](source-resolution.md#bayts-alerts-ref)); the remaining consumers follow. The
   reference-API review set their order: image-asset metadata keeps array rank, so Change Alerts reads its reference
   from metadata alone (done); shared segment-evidence readers and selection by role (done); evidence owned by the
   source runtime, so an operation a type declares requirements for is checked wherever the recipe is shown, with
   prefill behaviour kept (done); Change Alerts' boundary (done): pure shared requirements with stable ids over
   explicit facts ([requirement contract](source-resolution.md#requirement-contract)), one requirement per operation's
   actual reads - the alerts, the monitored measure in Sources, the segment chart - and every source section validated
   before Apply through the shared form binding, with the Sources feedback and source-feasibility amendment
   ([below](#declarative-validation-across-model-properties)). The agreed order from here:
   1. Finish and commit Change Alerts (done).
   2. Review the shared validation boundary against the
      [declarative dependency evaluation](source-freshness.md#declarative-dependency-evaluation) plan and the
      [validation guidance](../../code-design.md#validation-across-model-properties), with Change Alerts, Band Math and
      Sampling Design as the concrete examples (done; [outcome](#validation-boundary-review)).
   3. Adapt the boundary as the review finds: declared feedback inputs and explicit cross-section advisories (done).
      Then resume CCDC Slice (done) and BAYTS (done), with a requirement derived from what its execution reads
      ([findings](#configured-source-suitability-findings)); BAYTS' monitored passes are PRC's to check, advising
      REF.
   A separate follow-up is [declared reference layer sources](#declared-reference-layer-sources), replacing
   recipe-specific input-layer bookkeeping with shared derivation.
   One shared
   `SUPPORTED | UNSUPPORTED | NEEDS_EVIDENCE` validator
   behind the recipe selectors, replacing type filters and type-level candidacy, and repeated at the execution
   boundary so saved, stale and directly submitted models fail with a stated diagnosis. See
   [requirement and capability discovery](source-resolution.md#requirement-and-capability-discovery) and the
   [configured-source suitability findings](#configured-source-suitability-findings).
3. **Declarative dependency evaluation**, starting with the
   [Band Math chain](#later-follow-up-band-math-dependencies). The boundary review in item 2 informs it, and does not
   implement it.
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

**Deferred until the task rewrite lands:** [task-driven asset invalidation](#task-driven-asset-invalidation).
Re-audit the new task lifecycle and notification paths before choosing the integration route or scheduling it.
Keep Task changes out of the next requirement-validation packet; its Task execution-boundary integration must
be reviewed against the rewritten service.

Recipe deletion warns about no dependents yet; [persisted reference indexing](#persisted-reference-index) is a
separate follow-up, covering processing dependencies and display references. Loading
[unused map sources](#load-map-sources-only-when-needed) should not serve as dependency checking.

**Retained closed drafts after their save settles.** The recipe cache keeps a closed draft whose save has not settled
past its last claimant (`recipeCacheClaims.js`), and nothing evicts it once the save settles: it stays cached until a
claimant takes and releases it again. This retains an extra record, never loses unsaved work. Clean up separately,
evicting an unclaimed closed draft when its save state settles.

**Recipe-scoped modals, then opening a selected recipe.** Application-wide modals block tab navigation, so a
source selector cannot open its selected recipe consistently everywhere it appears. Settle
[recipe-scoped modals](#recipe-scoped-modals) first; [opening the selected recipe](#open-selected-recipe) follows.

**Recipe packages: separate developer architecture track.** [Recipe packaging](#recipe-packages) is the intended
direction for keeping a recipe's concerns together. It does not block or expand the current user-facing sequence:
Change Alerts requirement and form-validation improvements, the validation boundary review, then CCDC Slice, then
BAYTS. Those improvements can
ship incrementally without waiting for a packaging design.

Opening a recipe with an unavailable saved recipe layer source can show a raw JSON 404 notification, even when no
map area displays that source. `RecipeImageLayerSource` interpolates the raw load error into its translated message;
the translation helper serializes that object. Replace it with a readable diagnosis naming the source, keeping
technical details in logs. This presentation correction is separate from lazy loading and reference indexing below.

**Geometry reads during incomplete input editing.** A Stack remove-all/add-again sequence exposed a geometry request
with no first input, causing `imageFactory` to read `.type` from undefined. The unguarded first-input access predates
the output migration. Band Math, Remapping, Classification, Regression and Unsupervised Classification have similar
geometry access patterns; their browser behavior has not been reproduced. Investigate as a bounded shared follow-up
after the declaration migrations, provided valid configured recipes recover; a persistent failure with valid inputs
or a migration regression should be addressed sooner. Reproduce the empty-to-populated transition, withhold geometry
requests for incomplete input configurations, and prevent superseded responses from updating the map. At the execution
boundary, reject missing or malformed image references with a stated diagnosis rather than a TypeError. A factory
guard improves diagnostics but does not replace request-lifecycle handling. Keep this separate from schema availability
and align it with the execution-requirements contract; it need not implement the whole requirements system.

**CCDC breakpoint selection while switching data sets.** The Sources panel clears selected breakpoint bands
when the data-set selection becomes empty: `Form.Buttons` prunes against the empty options even while disabled.
Preserve the selection through that incomplete editing state, then reconcile against the next configured
data sets. Switching Landsat 8 → none → Sentinel-2 must retain NDVI; a band unsupported by the new data sets
should be removed once their options are established. Applying with no data sets must remain blocked.

**Stack generated band names and explicit overrides.** A separate naming packet, not part of the output-declaration
migration. Stack currently stores generated names and user overrides together as `outputName`: removing the first of
two classifications leaves the remaining automatic names suffixed with `_1`. Separate generated defaults from optional
overrides, showing the effective default as the input placeholder. Clearing an override returns to automatic naming;
an empty override is valid when its effective name is valid. Recompute defaults when the input configuration changes,
not on panel opening or evidence refresh. Reserve explicit names first, then allocate unique defaults in Stack order.
Two explicit names that collide must fail validation rather than being silently renamed. Preserve overrides by image
and band identity across input edits. Use one shared effective-name rule for description, execution and GUI consumers.

Existing saved names have no provenance: preserve them as explicit names rather than guessing whether a suffix was
generated; clearing one opts it into automatic naming. Recomputed defaults change the output schema. Keep Stack-owned
styles and selections attached to the same source-band identity where possible, and never silently rebind them to a
different source that acquires the old name. Downstream name-based references require the existing missing-band
handling; do not rewrite dependent recipes automatically. Band Math already distinguishes defaults and overrides,
but its removal handlers do not consistently recompute defaults, so reuse the concept rather than copying its logic.
Acceptance covers adding two same-named sources, deleting the first, reordering inputs, preserving explicit overrides,
clearing an override, duplicate validation, saved-model compatibility and references affected by an automatic rename.

**Default colors for large categorical legends.** Replace the shared default-color overflow behavior, which
assigns the last of 20 palette colors to every further entry. Class Change can need many more colors: seven
source classes yield 49 transitions. Reuse the palette application's `pickColors(count, colors)` interpolation
to distribute default colors across the complete legend instead of adding a recipe-specific color generator.
Use entry position and total count, not category values, and account for Class Change's one-based codes skipping
the first color. Preserve saved and user-edited colors. Check categorical distinguishability at larger counts;
interpolation avoids a repeated final color but does not guarantee that every category is easy to distinguish.

**Asset-layer visualization selection.** A standalone asset map layer (`assetImageLayer.jsx`) keeps a saved selection
its asset no longer offers even when other styles are available, so it draws nothing, while recipe layers replace such
a selection with the first candidate ([selection behavior](visualizations.md#selection-behavior)). Apply the same rule
through the asset layer's own evidence lifecycle: reconcile only against a successful, current metadata read, keep the
selection while a read is pending or failed or offers nothing, and never delete a user style.

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
Recipe Fill and configured-source capability discovery still require their own acquisition and validation contracts.

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

The adapters share the producer-step rule. Change Alerts, CCDC Slice and BAYTS candidate selectors use its
declaration query; the four classification pickers still use type filters. Declaration candidacy does not establish
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
choices, selection, destination compatibility and pyramiding policy, submitting the selected names.

Remaining work:

- Extend output declarations to further consumers where they replace existing logic. Keep source observations in
  runtime state and remove each legacy policy only when its replacement is accepted.
- Verify exported pixels and metadata for the supported direct and wrapped sources. Runtime witnesses establish
  contract handoffs, not live Earth Engine computation.
- Keep declaration-driven array-band policies and destination checks consistent between forms and submission.
  Do not add recipe-type checks to Masking or silently apply an export-policy fallback to unresolved bands.

### 2. Stabilize Apply mask

Masking declares identity band mapping and preserved values at valid pixels. Its bands are its description, and
its live evidence - the presets it inherits - comes from the selected primary source; copied presets are only an
unobserved compatibility fallback.

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

Done ([contract](source-resolution.md#ccdc-slice-src)): SRC's picker offers types that may provide segments
(`mayProvideSegments`), with candidacy kept apart from verified support, which the requirements judge from evidence;
the structural evidence Slice needs (`ccdcSegments.sliceSource`) is derived from what its execution reads and checked
before Apply, by its layers and Retrieve, and the chart is held to `ccdcSegments.chartable`.

Remaining work:

- Define the closed `CCDC_SEGMENT_SLICE` transformation capability, and recheck the structural requirement at the
  execution boundary. The current mode-aware band derivation is not a complete capability-validation contract.
- Validate Options' break-analysis band against the measures the source holds.
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
   output references. Preserve saved-model compatibility and intentional rename behavior (done).
2. Express the chain's consumed inputs, requirements and derived output through recipe-owned pure functions,
   using the expression analysis the editor lints with (`modules/gui/src/widget/codeEditor/expressionAnalysis.js`).
   Use the same declaration and evaluation contract for local configuration, calculation outputs and current evidence
   from selected recipes or assets; only their providers differ. Done for local configuration. Current evidence of
   the inputs' bands is judged by Band Math's output description instead (`inputs()`), which refuses what execution
   would, and the editor marks the inputs it finds lacking a band, and Input imagery, from that description.
3. Connect derived diagnostics to the owning sections and affected Preview/Retrieve operations. Remove the
   superseded bookkeeping for this chain; leave unrelated sync behavior alone (done: the persisted `invalid` flag is
   gone). Recheck the same requirements at execution, so a closed panel or directly submitted model cannot bypass
   them (not done: Task and Earth Engine execution do not recheck them).

Acceptance scenarios, without closing or reopening the recipe:

- Deliberately removing an input band from the local selection removes its direct pass-through output, including
  saved recipes whose copied input and output band IDs differ (done; [Band Math](../../recipes/band-math.md#inputs)).
  Unaffected calculations remain executable. This is distinct from preserving an expression that needs the removed band.
- Removing a required band identifies the affected calculation and output and prevents their execution, while
  preserving the expression and output configuration. Restoring the band restores validity automatically. Done for a
  local input-selection change; a change to the external source's bands is refused by the output description, which
  withholds previews and Retrieve until the band returns, and marks the input and Input imagery until then. Still
  deferred, as separate packets: judging an item's edit as a candidate before it is applied, with its own Apply policy,
  and rechecking these requirements at the execution boundary. Where the description refuses the configuration before
  reading the inputs - repeated output names, say, or nothing output - the editor reads them once to mark an input's
  problem beside the refusal (`EXPLAIN`, [GUI source runtime](gui-source-runtime.md)); other consumers have the
  refusal at once and read nothing for it.
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

- Use the shared compact Asset/Recipe selector (`SourceTypeButtons`) in Change Alerts REF, replacing its section
  selection screen and header dropdown, as in CCDC Slice SRC. Keep date-format controls asset-only, preserve saved
  selections, prefill and candidate validation, and clear the previous selection and date format when changing type.
  This is a presentation follow-up, separate from requirement migration.
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
recipe's closure through its own operation-scoped reader and resolves the shared providers, so the description and the
exported image come from the same records. The export names its bands, the image returned has exactly those bands, and
encoding is written for them; an export naming none builds the producer's default image, which the available bands do
not describe, and records no encoding. A recipe with no image output - the exported recipe, or one it reads as an
image - fails the export before anything is built. So does a failed read, an incomplete closure or an invalid
description, rather than being recorded as unknown, and a closure whose dependencies are not structurally sound, even
where the description reads none of the broken part.

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

### Configured-source suitability findings

Change Alerts REF is the first consumer, now implemented ([contract](source-resolution.md#change-alerts-ref)): its
configured chain, asset structure, missing reference and selected-source presentation follow the constraints below.
The findings do not authorize a migration of every picker or execution boundary. The capability-chain
cases were reproduced through shared rules, without Earth Engine. Other findings come from code inspection,
unless stated otherwise; they are not claims of end-to-end reproduction.

| Gap | Current behavior | Follow-up |
| --- | --- | --- |
| Type candidacy differs from configured capability | Masking is a candidate for segments and BAYTS statistics even when its primary source is an optical mosaic; the configured provider walk rejects it. An unfilled preserving role is malformed, and Stack does not currently preserve these capabilities. | Start with a diagnosis for Change Alerts REF that names where the configured chain stopped. Keep deliberate picker eligibility separate from suitability. |
| Wrapper support differs between consumers (resolved for CCDC Slice) | CCDC Slice's picker offers the types that may provide segments, Masking among them; a Masking over anything but CCDC is refused from its configured chain. | None for Slice. |
| Asset segment inference is not validation | `ccdc/segmentsAsset.js` derives a base band from a lone `x_rmse` or a derived `x_intercept`; non-empty `baseBands` does not prove CCDC segments. Change Alerts and CCDC Slice judge typed bands under their own requirements instead. | None for those consumers; another consumer of segments defines its own minimum structural evidence. |
| Historical-statistics validation is GUI-only (REF and PRC resolved) | BAYTS Alerts REF judges each pass's statistics from typed evidence, and PRC the monitored passes' coverage ([contract](source-resolution.md#bayts-alerts-ref)). Execution still uses the reference image without a capability check. | Review the execution contract separately. |
| Wrappers bypass direct type exclusions | Masking over CCDC remains eligible wherever Masking is offered, including its own mask field, despite CCDC's direct exclusion. | Audit each consumer's actual shape requirement before introducing scalar-image validation; do not assume every image consumer requires scalars. |
| Classification-only inputs rely on GUI filters | Execution callers assume classifier/training methods exist; wrong types can fail with missing-method errors. | Define the requirement and execution diagnosis without incidentally admitting Masking over Classification. |
| Selected-source errors are poorly presented | Evidence failures can disable actions without marking SRC/REF; unavailable or no-longer-offered selections can appear blank or disappear from input lists while remaining in the model. | Preserve and display the selected reference, mark its owning section, and explain the specific failure. Never clear it as a side effect of validation. |
| Asset metadata omitted array dimensionality (resolved) | The Earth Engine client's legacy conversion keeps a band's precision and range but drops the rank the Cloud API states (`dimensionsCount`), so an image asset's array bands read as scalars to `assetAvailableBands`: the asset layer offered them for styling and kept styles over them. `/assetMetadata` now converts the Cloud record itself and states each band's rank as `data_type.dimensions`, none for a scalar; a band with no type states none, and a rank that is no count, or a band the record does not match, stays unknown. Collections and Cloud GeoTIFFs already stated it. | Change Alerts REF reads its reference from metadata alone. Cursor display types read precision only and were unaffected. |
| Picker and translation gaps | `RecipeInput` bypasses its filter for an unknown GUI type. Required-message keys reported missing include Classification training data; the AOI key also needs checking. CCDC Slice SRC and Change Alerts REF have theirs. | Add focused picker and message coverage when these paths are changed. |

Contract constraints for the first packet:

- Provider discovery must remain possible before its evidence is loaded. A producing declaration identifies where
  to obtain evidence; it does not by itself validate the contents of an asset-backed recipe. Bare assets and
  asset-backed recipes must use the same capability rule and explicitly current evidence.
- Keep output schema, structural validity, suitability and complete execution requirements distinct. An unsuitable
  source is not a transport failure. After an attempted load fails, the combined UI state must settle to unavailable,
  not remain indefinitely checking or label the source unsuitable.
- Absence from the recipe listing triggers an availability check; it does not prove deletion. Preserve new recipes
  and open or unsettled drafts. Use missing-or-unavailable wording unless deletion is established separately.
- Retain the selected reference, provider path and offending role/path in structured diagnostics. The GUI owns
  translated wording and titles. A pure read must not dispatch or start another loading path.
- Reuse source-runtime and evidence-lifecycle ownership. Changing shared `lib/js/ee` code can affect Task even
  without editing `modules/task`; execution changes need a boundary review while Task is being rewritten.

Scalar-image and classification-input requirements are subsequent packets; CCDC Slice's and BAYTS Alerts' are done. The first packet
must not broaden their behavior while adapting shared discovery code. Execution parity for asset segment leaves
and the ASSET/inline branches of `loadSegments` remains to be designed, rather than claimed by GUI validation.

A recipe shown outside its editor is checked for every operation its type declares requirements for: the layer or
chart requesting it watches the evidence the operation needs
([evidence watches](gui-source-runtime.md#evidence-watches)), and a provider-only operation reads the records of a chain
the session does not hold before it is allowed or refused. Presentation evidence of types without requirements is
observed only by their editors.

Its segment chart read bands its requirement did not check: `CCDCGraph` plots `tBreak`, `changeProb`, `numObs` and a
measure's `_magnitude`, which the alerts never read, and a reference without them made the chart fail as it drew. The
chart now has its own requirement, reported in REF as a warning without refusing a reference the alerts can use.

Source-error presentation acceptance includes a visibly invalid owning SRC/REF section, an explanation naming
the affected source, a retained selection that can be repaired, and visible progress on Refresh. The missing
Refresh feedback was observed manually after deleting a temporary asset; the unavailable message and export
blocking worked. Broader Retrieve diagnostic presentation and Refresh feedback remain separate follow-ups.

### Declarative validation across model properties

General form-design guidance lives in
[code design](../../code-design.md#validation-across-model-properties); it is not owned by source resolution or limited
to source fields. Distinguish feasibility, compatibility of current settings and invalidation of derived results.
Declare rule inputs and feedback ownership, keeping pure domain rules separate from shared form coordination.
Cross-section warnings are chosen for useful advance notice, not generated for every dependency or invalidation.
The items below are concrete applications of that broader policy.

- **Change Alerts amendment, implemented** ([contract](source-resolution.md#change-alerts-ref)): REF is refused if
  none of the supported monitoring sources can use its measures. Otherwise the replacement is allowed, with one
  short aggregate REF advisory naming the sections needing attention and both remedies: choose another reference or
  update those sections. Sources stays invalid after Apply, marked on the toolbar - whose Sources button previously
  ignored the section's problems, so an Optical-to-Radar replacement showed no error there. Its tooltip names the
  setting to change: the type; other data sets of the same type or other pre-processing, pointing to both; or the
  band. Sources' choices keep their existing presentation.
- **Operation availability, implemented for the segment chart and Retrieve**
  ([contract](source-resolution.md#operation-availability)): availability is a shared assessment of one operation.
  It is derived from the declared requirements, the current configuration and the current evidence, by the
  requirement reads the request gates already use. Its consumers are the toolbar action that opens the operation
  (disabled while prerequisites are checked or unmet, with no added feedback), the open panel (the chart takes its
  segment gate, bands and whether any band can be plotted from it) and the request or submission gate (Retrieve's
  source gate). Recipe types supply declarations and facts, such as the bands Change Alerts' monitoring data
  observes; the evaluation and the gate interpretation are shared. Retrieve's listing, draft and asset authority
  stay with its panel and submission, since opening the panel is what renews them.
  Rules over local model properties feed the same assessment, implemented for Band Math (below), so a form's Apply,
  its toolbar action and its request gate answer from one rule. Planned, not implemented: other operations and
  recipe types. It stays per operation, never a recipe-wide validity flag, and adds no separate validation system.
- **Validation boundary review, done; its local-configuration direction implemented for Band Math**
  <a id="validation-boundary-review"></a>. The requirement reader, candidate validation, section status, gates and
  operation availability stay the one assessment; the review extends that contract rather than adding another.
  Implemented from it, preserving behaviour: a section declares the form input showing what its requirements find
  (`input`, a form input name, never a model location), or none, showing them on its toolbar button only; a
  requirement declares the sections advising that it is not met (`advise`), so a recipe declaring none acquires no
  cross-section advisory. Availability keeps its structured reason (the gate) whether or not a tooltip shows it.
  Implemented for Band Math (`sourceRequirements.js`, [Band Math](../../recipes/band-math.md#configuration-checks)):
  - rules over local configuration: a declaration supplies its facts from the recipe (`localFacts`) instead of a role
    and its evidence, so its reads are checked at once, select nothing and are never acquired;
  - optional item enumeration over those facts (`items`), one read per item - a calculation, an output image - with a
    stable id, the model location its panel commits, and its prerequisites;
  - prerequisites identified by declaration id and item id, never by rule id or path - Change Alerts declares
    `ccdcSegments.monitoredMeasure` twice; a read keeps its own verdict apart from its effective one, a prerequisite
    not read counts as unmet, and a suppressed message never makes its operation available;
  - section marks, item marks and operation gates aggregating every item - an item held only by a prerequisite marks
    its section too, by naming what it depends on.

  Not implemented: judging an edit by these rules before it is applied. A local declaration binds no form panel, so
  each panel's Apply keeps its own validation. Proposed for a later packet: an item panel judged as a candidate by the
  item being edited only, an item still being added included, with an explicit policy for whether unmet prerequisites
  hold its Apply.

  Sampling Design's planner (`planDerivedUpdates.js`) stays its current invalidation mechanism, unchanged for now; the
  [direction](source-freshness.md#declarative-dependency-evaluation) remains current-input evaluation and result
  provenance rather than edit-triggered flags. Staleness keeps today's mark but stays distinct from incompatibility
  in the assessment. A rule over min-distance would keep that check's applicability: stratified, systematic sampling
  only.
- **Date compatibility follow-up:** verify execution's required reference coverage relative to calibration dates
  and the available evidence before adding a declarative Dates requirement. Preserve user dates; distinguish an
  incompatible selected period from a reference that supports no valid period. The proposed preceding-year rule
  needs verification, not an assumption encoded in validation.
- **Prevent impossible choices:** subsequently derive enabled monitoring types and relevant dependent fields from
  established reference facts: disable incompatible choices, and hide dependent fields that cannot apply. Pending or
  failed reads must not disable choices as if incompatibility were known. Consider defaulting an unset Type when
  exactly one type is compatible; do not silently replace an explicit configured type or monitoring settings.
  Defaulting policy remains a separate decision.
- **Field-level Sources feedback, deferred:** saying an incompatibility on the Type, Data sets or Analysis band
  choice itself needs button choices to present field errors, which they do not today; doing it for every form is a
  separate decision. Where an incompatible type leaves no possible band, avoid a redundant band error beside the
  actionable one on the type.
- **Accessible field semantics, deferred:** labelled widgets as named groups stating disabled, busy and invalid
  state, application-wide, rather than as part of a validation packet.

- **Sampling Design review, not yet scheduled:** an AOI change affects many derived results and settings. Identify
  actual incompatibilities separately from normal invalidation and recomputation. Assess whether retained choices
  or loss of user work merit advance notice; do not automatically warn on AOI merely because other sections depend
  on it. Existing invalidation alone neither establishes suitability nor requires a warning.

Implement and verify concrete rules incrementally, then reuse the boundary in other recipes. This does not
authorize an application-wide validation rewrite or a general constraint-solving framework.

### Recipe packages

Architectural direction, not yet scheduled. A recipe should ultimately be owned by one JavaScript package containing
its shared definitions and domain rules, GUI components and text, Earth Engine implementation, and tests. SEPAL
provides the common forms, maps, source runtime, persistence and execution infrastructure through explicit interfaces.
The aim is simpler recipe development and ownership; current validation and diagnostic improvements deliver
independent user benefits and retain priority.

Two kinds of spread need addressing: registration in the GUI recipe catalogue, GUI layer catalogue, shared type
registry and Earth Engine factory; and recipe logic spread between locations such as `recipe/type/changeAlerts.js`
and `recipe/changeAlerts/`. Consolidating registries alone does not create a recipe package.

The design must establish:

- Separate browser-safe shared, GUI and execution entry points, with enforced dependency boundaries. One package
  must not make server code part of the browser bundle or require React in Task.
- Dependencies between recipe packages, including composition such as Change Alerts building mosaics: distinguish
  direct package dependencies from capabilities supplied through host interfaces.
- How the host discovers and registers each package's contributions without parallel hand-maintained catalogues.
- Package and saved-model versioning, migrations, and compatibility between GUI, shared definitions and execution.
- Build and deployment ownership. Packaging together does not require independent deployment: a first migration
  may build and deploy recipe packages with SEPAL. Independent installation and deployment remain separate decisions.

Use a simple recipe to test a concrete package layout and Change Alerts to examine cross-recipe dependencies before
choosing a migration. Keep current declarations and pure rules compatible with this direction, but introduce no
package framework or speculative dependency machinery into the ongoing source-requirement packets.

### Declared reference layer sources

Follow-up to the reference-API review; not part of the current suitability migrations.
Recipe specifications explicitly opt source roles into becoming map-layout layer sources. Shared code derives
those sources from the current references, so recipes do not each add and maintain them in input-panel handlers.
Not every dependency is suitable for display; the declaration decides which ones are exposed.

- Keep derived sources separate from sources explicitly added through the layout. Dropping an input reference
  removes its derived source, never a user-added source that happens to reference the same asset or recipe.
- Give derived sources stable identities tied to their role and, for multiple inputs, their input entry. Replacing
  a reference should preserve area assignments and compatible settings through the existing reconciliation rules.
- Treat Remove on a derived source as a persisted hide choice, so the source does not immediately reappear.
  Define when that choice resets (for example, when the reference changes) before implementation.
- Edit derived sources through their owning input panel. Layout-added sources remain independently editable.
  Ownership should be explicit rather than inferred from source-ID conventions.
- Specify cleanup of area assignments when a derived source disappears, and compatibility for existing saved
  layouts, before migrating input panels. Keep derivation in the GUI; this declaration does not change execution.

### Load map sources only when needed

The map currently mounts a loader for every saved additional recipe source, including sources no area displays,
to refresh its description. Use the recipe listing for display names, falling back to the saved description when
needed. Listing absence does not establish deletion. Acquire the full recipe when an active consumer actually
needs it, such as a displayed map layer, rather than merely because it remains in the layout's source list.

- Keep source entries and area assignments intact when deferring their reads; use the existing runtime and cache
  claims when a consumer starts or stops using one.
- Verify that an unused source causes no full-recipe load, that selecting it loads and validates it, and that
  display names follow listing changes without loading recipe contents.
- Do not use these incidental reads to discover broken dependencies; that belongs to the reference index below.

### Persisted reference index

Extend the [save-time edge-indexing direction](source-resolution.md#deletion-and-movement) with a persisted index
derived from recipe declarations and saved configuration. Recipes should not maintain another manual reference
list. Index updates must remain consistent with the saved recipe revision; define how existing saved recipes are
indexed before treating reverse-reference queries as complete.

- Distinguish processing dependencies, whose loss breaks computation, from optional map display references.
  A reference may serve both purposes. Display references must not become execution dependencies.
- Support direct and transitive "used by" queries and warnings before deletion without loading every recipe's
  full JSON. Respect access permissions when reporting dependents.
- Keep processing references after deletion so their owning inputs can diagnose and repair them; never cascade
  deletion to dependent recipes.
- Define cleanup of display references after a confirmed deletion, including what happens to map areas using
  them. The current manual removal also removes those areas; automatic cleanup must not inherit that implicitly.
- A recipe-load 404 means missing or inaccessible, not confirmed deletion: the service deliberately answers both
  alike. Do not automatically rewrite saved recipes on that signal alone, or on listing absence or transient
  failure. Confirmed deletion events can support targeted cleanup under the policy above.

These are follow-ups, not additions to the current suitability packet. Coordinate derived display references with
[declared reference layer sources](#declared-reference-layer-sources).

### Recipe-scoped modals

Investigation, not yet scheduled; a prerequisite for [opening the selected recipe](#open-selected-recipe). Modals
are application-wide today: while one is shown, neither recipe tabs nor application sections can be reached.
Investigate modals that block interaction only within their own recipe, leaving recipe-tab and application-section
navigation available.

- Preserve pending form edits when leaving a tab or section with a modal open and returning to it. Nothing is
  applied, cleared or reset by navigating away.
- Define the backdrop's extent and what clicking it does, where focus goes on opening, on leaving and on returning,
  which keyboard shortcuts reach the modal, its recipe and the rest of the application, and how a modal is
  dismissed - including when its recipe's tab is closed.

### Open selected recipe

Revisit after [recipe-scoped modals](#recipe-scoped-modals) are settled. A recipe selector offers to open its
selected recipe; it must behave the same everywhere the selector appears, not only outside modals.

- Leave the originating form as it was: opening never applies, clears or changes the selection or pending edits,
  and they are intact on returning to its tab.
- Select the recipe's existing tab when it has one, including one opened while the recipe was being read, rather
  than opening a second.
- Protect unsaved drafts: an open draft, or a closed one whose saves have not settled, is never replaced by a cached
  or freshly read copy. Otherwise open through the authoritative load that initializes save revisions.
- Work for a selection in another project without the ALL view; report a failed load without changing the current
  tab or selection; keep the action reachable and operable by keyboard, without a panel's own keybindings taking
  its keys.

### Task-driven asset invalidation

Deferred while the task functionality is being rewritten. Once the rewrite lands, audit its destination changes,
completion, failure and cancellation paths and its notification transport before proposing implementation.
The route through user-assets remains a proposal, not an approved integration contract.
Asset evidence already takes known mutations from the session
(`assets.mutation`), with follow-up reads for Earth Engine's propagation delay.

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
