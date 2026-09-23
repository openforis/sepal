# Recipe output products and band schemas

Technical design and research record for replacing recipe-specific `bands.js` and `visualizations.js` derivation
with shared output declarations. Dependency traversal and runtime observation belong to
[source-resolution.md](source-resolution.md), refresh and replay belong to
[source-freshness.md](source-freshness.md), and presentation ownership belongs to
[visualizations.md](visualizations.md).

This document is intentionally a design constraint rather than a finished JavaScript API. The existing helpers are
an evidence corpus and a compatibility boundary. Moving their current signatures into shared recipe definitions
would centralize several incompatible meanings without simplifying them.

## Problem

The GUI currently registers one `getAvailableBands()` and one `getPreSetVisualizations()` function per recipe type.
Those names conceal several different questions:

- which bands the recipe can export;
- which bands one map-layer mode happens to display;
- which bands an internal optical, radar or Planet collection provides to an algorithm;
- which bands were copied from a selected recipe or asset at an earlier time;
- which labels, tooltips and grouping a form should display;
- which presentation presets are currently applicable.

The same physical rules are sometimes derived independently in GUI and Earth Engine code. Other consumers reuse a
helper by constructing an object that resembles another recipe's model. CCDC Slice and Change Alerts manually load
dependent recipes and copy reconstructed descriptions into their own models. These patterns create stale snapshots,
type switches and output rules that can drift from execution.

The objective is not to produce a more elaborate band registry. It is to make each question have one owner and to
let recipe implementations declare only behavior specific to that recipe.

## Decision summary

- Products are concrete logical results; capabilities describe additional consumer-relevant interpretation.
- Modality is presentation metadata, not an execution or compatibility discriminator.
- Catalogue entries, source instances and adapters are distinct roles.
- Adapters own small versioned source commands; they do not participate in a universal matching language.
- One closed temporal collection composer owns shared derivation, Classification augmentation, selection and
  encoding above source adapters.
- Command discovery declares named direct references; the shared graph alone completes the authorized closure; the
  product resolver then evaluates declarations bottom-up through scoped child bindings.
- Plan validity is separate from operation-specific requirement validation and runtime availability.
- An image output describes the bands available from the configured recipe. An operation selects from them by
  name, and execution produces that selection; how a requested band is built is the producer's responsibility.
- Product compatibility follows physical and structured semantic guarantees, never modality or matching names
  alone.
- Browser plans are preflight evidence; trusted execution rebuilds or validates commands from an authorized bundle.
- Contract versions describe deliberate durable evolution. Known defects are fixed before contracts are declared
  and never become supported legacy algorithms.

## Terminology

### Source contract roles

The current Optical, Radar and Planet branches mix several orthogonal roles. The replacement model keeps them
separate:

- **modality** is non-authoritative grouping metadata such as optical or radar;
- a **catalogue entry** is a stable persisted selection ID with pure catalogue facts such as declared availability;
- a **source instance** is the concrete assets, references and parameters selected for one operation;
- a **source adapter** owns pure planning and runtime execution for one stable adapter identity and contract;
- a **source command** is the adapter-owned, versioned and JSON-safe instruction produced from persisted input;
- a **temporal collection composer** applies SEPAL's closed set of collection-level derivations, classification
  augmentation, selection and encoding above a normalized source collection;
- a **recipe requirement** states what one consumer operation needs from the configured product.

These roles are not identity levels in a hierarchy. Optical and Radar are physical modalities, while Planet is
primarily a provider and execution path whose imagery is optical. The existing `OPTICAL`, `RADAR` and `PLANET`
values classify legacy executor branches; they are not scientific compatibility contracts. Modality may group UI
choices, but it never selects an executor or proves compatibility.

A catalogue entry and adapter are also different. Several Landsat entries can share implementation while differing
in collection ID, tier, native mapping and availability. A custom asset can bypass catalogue selection, but it never
bypasses adapter binding: arbitrary metadata is not enough to guess Planet Daily, Sentinel-1 or another processing
contract.

### Product

A product is a concrete logical result with a coherent schema and meaning: an image, image collection, feature
collection, chart series or another established result kind. A recipe can expose more than one:

- the canonical image output consumed by downstream image recipes and Retrieve where supported;
- a named map product used by one layer mode;
- an internal collection product consumed by an algorithm;
- an AOI geometry product exposed when another recipe uses this recipe as its area of interest;
- a non-image product, such as Sampling Design's sample FeatureCollection.

CCDC Segments is an image product. `CCDC_SEGMENTS` is a capability describing how that product can be interpreted;
it is not a second product. Likewise, the absence of an image output is not represented by a synthetic product. A
recipe can simply have products of other kinds or no declared product of that kind.

A union of all bands that any layer mode might display is not a product.

An AOI recipe reference is resolved through that named geometry product, not by allowing the consumer to inspect the
referenced recipe's model. The provider defines whether the geometry comes from configured AOI intent, image-output
bounds or another declared source and which transitive evidence affects it. The current `RECIPE` AOI behavior obtains
geometry through the referenced image product; migration must make that behavior explicit rather than silently
redefine a recipe AOI as `model.aoi`. The rule differs per recipe type — some expose their configured AOI, others
delegate to a source or to one of several input images — so each declaration is derived from that type's actual
behavior and shared by GUI resolution and executor execution rather than reimplemented on either side.

Recipe types are migrated to an explicit AOI-product declaration one at a time. Until a type has one, a consumer
depending on its geometry falls back to conservative whole persisted-source evidence: correct, but it treats
unrelated edits as potentially geometry-affecting. Narrower invalidation is a property a migrated provider earns,
not a guarantee available before the projection exists.

### Declaration and description

A declaration states how a product is derived. A resolved description is the result for one recipe graph and
runtime evidence. A declaration can provide useful guarantees before exact band names are known; a description owns
the final ordered bands.

A recipe type's image-output provider answers one consumer-facing question: which bands does this configured recipe
provide, and what is established about them? The type owns how that answer is obtained:

- the optical mosaic describes its bands from its configuration;
- CCDC asks the producer which bands it can be asked for;
- an Asset recipe reads its asset's description and states what its configured composite leaves of it;
- Masking preserves its primary source's band facts;
- CCDC Slice transforms its source's description.

A provider receives narrow access - its own observation, the source filling its declared role, or every
role-bearing source - and asks only for what its answer needs. A provider also names WHICH question about its own
image an observation answers: the running image the producer builds when asked for nothing, with the physical facts
of its pixels, or the catalogue the producer says it can be asked for, whose physical facts the provider then
supplies from its own declarations. Shared resolution owns graph traversal, role
validation, acquisition and its deduplication, cancellation, supersession, diagnostics and description validation;
an answer that depended on anything unavailable is discarded. Declared roles and preservation effects stay data,
because capability resolution reads them without resolving anything. A consumer cannot tell how a description was
acquired.

Observation is one way to establish availability, not its definition. An unselected running image is not
universally the available-band catalogue: the optical mosaic's composite for an empty selection includes its
tasseled-cap components but computes no indexes, and CCDC fits only the measures it is asked for, so the image it
builds for an empty request holds its breakpoint measures alone. Discovering a catalogue must not mean running the
producer once per candidate output.

Where a catalogue depends on imagery rather than configuration, it is established from the imagery that actually
contributes. A Planet Daily collection carries four bands or eight depending on its members, and its recipe states
only what every contributing image carries: the configured assets merged and filtered exactly as execution filters
them, then read for the schemas the Daily branch recognises, stopping short of the processing itself. Merging
branches is not a union - a branch no imagery matched contributes nothing - and processing narrows further, since
histogram matching returns the four bands it matches whatever it was given. No contributing imagery at all is a
third outcome again: the collection carries nothing, rather than the bands it would have carried had there been
imagery, so its recipe offers no measure built from it. A collection that cannot be read has an unknown schema,
and that failure reaches the consumer rather than becoming a narrower catalogue no evidence supports.

Four things stay separate:

| Stage | Carries |
| --- | --- |
| Recipe description | available bands and their facts |
| Operation request | selected physical output names |
| Producer internals | the inputs needed to construct those outputs |
| Returned image | exactly the requested output bands, in the requested order |

A consumer projects the selected schema from the available band records by name, and uses those records for
destination compatibility, export policies and encoding. "All bands" names every available band, ignoring a manual
selection retained beside it; an explicitly empty manual selection names none and cannot run. A request that states
no selection at all predates that option and is normalized to all bands where the consumer interprets it. A recipe's
own configured restrictions define what downstream consumers may request.

Image exports to Earth Engine assets, Drive and SEPAL hand the image factory the selected names twice: as the
producer's usual `selection`, and as `outputBands`, the bands to return. A producer whose selection already names
its outputs builds from it as before. One that builds from other inputs translates the request: CCDC fits the
measures its `_coefs`, `_rmse` and `_magnitude` bands come from and returns exactly the named bands. One that would
return more projects it, as a directly selected asset does. Masking forwards the request to its primary image and
still applies its mask. Internal callers whose selection means something producer-specific - Slice, Change Alerts,
the segment chart and the dedicated CCDC export, all naming CCDC measures - send no `outputBands`, and preview
selects the bands of the visualization it draws.

### Output-band description

The ordered band record contains several classes of established fact:

```js
{
    name: 'ndvi',
    dataType: {
        arrayDimensions: 0
    },
    pyramidingPolicy: 'mean',
    encoding: {scale: 0.0001, offset: 0, unit: '1'}
}
```

`name` is the stable identity within the product. `dataType.arrayDimensions` is physical schema.
`pyramidingPolicy` is an export requirement, not a physical fact. Physical observation can establish dimensionality
without establishing the correct scalar policy, and temporary fallback policy remains migration configuration rather
than observed evidence.

`encoding` states what a stored value means: `physical = stored * scale + offset`, in `unit` where one is
established (`'1'` for dimensionless quantities). It is numeric encoding, not pixel size. An absent encoding is
unknown — never 1, never inferred from a name, data type or producer configuration. A producer states the encoding
of its actual output bands; a reader of a stored asset takes it from the asset's persisted metadata; a preserving
transformation carries it with the band. Stated encodings are compared as facts: an omitted offset is zero. See
[Band encoding](data-sources.md#band-encoding) for the persisted form and export rules.

Fields remain optional when evidence is absent. Precision, numeric range, grid, categorical value semantics
and other candidates enter the shared contract only when a migrated consumer establishes their source, ownership and
validation rules. Physical schema, export requirements and semantic evidence may remain fields in one compatible
band record, but their ownership and completion rules stay distinct. The current GUI `precision` vocabulary is not
automatically an Earth Engine PixelType contract. Translation keys, labels, tooltips and form grouping are GUI
decoration rather than output schema.

## Normative separation

### Canonical image output

`IMAGE_OUTPUT` describes the bands available from the recipe's canonical executable image product. Downstream image
consumers resolve it, and Retrieve uses it where that consumer supports the product. The existing shared
`imageOutput` declaration is this product. Consumer support is separate: CCDC can declare its image output while
continuing to export through its custom task path. The declaration must not absorb map-only bands merely because the
GUI registry currently asks one function to describe both.

### Named map products

A map mode that renders a different image has a separate product. Examples include LandTrendr annual mosaics,
Change Alerts monitoring and calibration mosaics, BAYTS first and last radar observations, and the scalar CCDC count
layer. Product identity is explicit input to schema and visualization resolution.

Named products are not automatically exportable. Export eligibility is a consumer policy applied to one resolved
product, not a consequence of the product appearing on a map.

Some products require explicit parameters that are layer state rather than persisted recipe configuration:

- LandTrendr annual mosaic: `{year}`;
- Change Alerts collection mosaic: `{period: 'monitoring' | 'calibration', mosaicType}`;
- BAYTS radar observation: `{position: 'first' | 'last'}`.

The eventual request therefore identifies a product and validated parameters. It must not read ambient layer state
or accept an unstructured `visualizationType` bag. Parameters affect the product description and its presets, but do
not alter the canonical image output declaration.

### Domain capabilities

Some downstream operations need more than a flat image description. CCDC Slice needs segment measures, base bands
and date interpretation. Those facts belong to a `CCDC_SEGMENTS` capability describing the CCDC Segments image
product, not to a special interpretation of generic CCDC band names and not to copied fields in the Slice recipe.

Capabilities can refer to an image product without becoming another source of its physical bands.

### Presentation

Presentation definitions remain separate from product schema. A direct product preset is expressed in one named
product's band namespace, while a downstream transformation template refers to potential output of one closed,
named transformation. A CCDC Slice template is therefore not a visualization of the CCDC Segments product.

A direct preset becomes a candidate only after binding it to a concrete product instance and parameters. It becomes
an active visualization only after separate definition validation and direct-rendering requirement validation.
Every referenced band must exist and direct visualization requires scalar bands. A visualization is never evidence
that a band exists, is scalar or has categorical semantics.

User-defined visualizations remain owned by the recipe or layer where the user edited them. Requested selection is
distinct from an active product binding, so unavailable evidence or a temporarily missing candidate never requires
rewriting saved intent. Exact presentation ownership, template and selection contracts belong in
[visualizations.md](visualizations.md).

Preset versus template is an interpretation distinction, not necessarily a storage-format distinction. Existing
Earth Engine assets use `visualization_*` properties for both. An ordinary image adapter can interpret one as a
direct product preset, while the CCDC Segments asset adapter interprets logical base-band references as templates
owned by `CCDC_SEGMENT_SLICE`. The property record never decides its own product or transformation.

### Form metadata

Band labels, translated tooltips and option groups are projections of a product description plus GUI metadata. They
may live near a recipe's UI while the physical declaration is shared. A form group cannot determine execution
order, physical type or export policy.

### Band choices in Retrieve

Where a Retrieve panel owns an output resolution, that resolution is the only authority for what may be
selected. The same resolved description supplies the choices offered, the destination-compatibility check, the
submitted band names, the pyramiding policies and the encoding, so those cannot describe different bands. The
band options a recipe type supplies are then presentation alone - labels and tooltips matched by name - and can
neither add a band nor withhold one.

Until that resolution settles the panel offers no choices at all, and retrieval stays disabled. The band names
copied into a recipe when its source was selected are a snapshot nothing has verified since, and offering them
would let a user select, and submit, a band the recipe may no longer provide. A failed acquisition or an invalid
description is reported where the choices would be, and likewise offers nothing. That snapshot remains what a
map layer draws from, which has no resolution of its own.

A panel opens on a loading view rather than on a form that fills in as answers arrive. The view is held for a
minimum once shown, so a resolution answering almost at once cannot make it flicker past; the minimum overlaps
the acquisition rather than following it, so a slower read reveals the form as soon as it answers. The complete
form appears at once when it does. A failure is shown without waiting. This applies to opening only: a panel
already open withholds its choices and blocks retrieval while a later resolution runs, but is never hidden
behind that view again.

What identifies a resolution is everything its answer depends on, and nothing else: the recipe's own execution
configuration, and the current evidence about the source it inherits from. The producer behind a wrapper can be
reconfigured, or become unreadable, while the wrapper's own model is untouched, so evidence bears on whether a
displayed answer is still valid. That evidence is runtime state rather than saved content, which is a statement
about where it is kept, not about what it affects. A recipe record is also replaced for reasons the answer does
not depend on - panel state, a rename, a new server revision - and restarting for those would discard a settled
answer only to re-acquire the same one. A change to either half invalidates the displayed result at once and
starts a new resolution, whose predecessor can no longer describe anything; a failed refresh withholds the
choices and blocks retrieval rather than leaving the previous description in force.

A saved selection survives loading and failure untouched. Once the catalogue is known, a selected name it does
not hold is named to the user and blocks retrieval until the selection is corrected, rather than being dropped
from the submission unannounced.

A panel with no output resolution keeps offering exactly what its recipe type supplies.

### Structured band selection (deferred)

Sharing band selection between a producer and a preserving wrapper requires more than copying group labels. The
current Retrieve panels expose different selection semantics:

| Panel | Selection |
| --- | --- |
| CCDC | Base bands; execution includes their coefficients, RMSE and magnitude, the configured breakpoint measures, and shared segment bands. |
| CCDC Slice | Base bands and result types, with segment bands selected separately; choices are limited to the configured slice's output. |
| Masking | Individual physical band names from a flat list. |

The proposed consolidation uses Slice's selection approach: choose base bands, result types and independent
segment bands, then resolve the choices to explicit physical names. For CCDC, choosing `nir`, coefficients and
RMSE, plus `tStart`, would select `nir_coefs`, `nir_rmse` and `tStart`. Slice has different result types because
it produces scalar results rather than segment arrays.

Ownership and constraints for this follow-up:

- The producer supplies relationships between its available physical bands, such as base band and result type.
  These describe the existing catalogue; they must not introduce a second authority for availability.
- A shared GUI band picker projects those relationships into controls. Producer and wrapper Retrieve panels use
  the same picker, while labels, translations and tooltips remain GUI metadata.
- Masking carries the structure through because it preserves bands. A transformation such as Slice describes the
  structure of its own output. Band-name suffixes alone do not establish that structure.
- Without established structure, including for an asset with no such description, the ordinary physical-band
  picker remains available.
- Selection resolves to explicit output names before submission. Destination checks, pyramiding policies and
  encoding use those same selected band records.
- Defaults and automatic inclusion of segment or breakpoint bands are separate export-policy decisions. Sharing
  the picker does not automatically inherit a source panel's destinations, validation or other export behavior.

This work is deferred from the band-encoding and catalogue-correctness delivery. The metadata representation and
default-selection policy remain to be designed against both CCDC and Slice. The implementation should replace
their duplicated selection logic, rather than add recipe-type branches to Masking or delegate whole panels.

## Output guarantees and early compatibility

Do not add an independent `SCALAR_ONLY` or `ARRAY_ONLY` recipe flag. Scalar versus array is a per-band physical fact,
and a second boolean authority can disagree with the resolved schema.

A configured product declaration may nevertheless prove an output-wide invariant before exact names are available:

- the current Optical Mosaic, Sentinel-1 Radar Mosaic and Planet Mosaic image products emit scalar bands;
- every CCDC Segments output band is array-valued;
- Masking preserves the primary product's invariant;
- Stack composes the selected input bands and may be mixed;
- an arbitrary Earth Engine asset remains unknown until observed.

These guarantees belong to the named configured products, not to optical, radar or Planet as broad categories. A
future radar adapter, heterogeneous collection or different operation inherits none of them automatically.

Consumers derive aggregate answers such as `all selected bands are scalar` from the strongest available declaration
or exact description. The representation of partial schema constraints remains open until the audit is complete.
It must be capable of expressing inheritance and composition rather than adding recipe-type flags.

This allows a Retrieve panel to disable incompatible destinations immediately for a statically known product while
retaining conservative pending behavior for an asset or dynamic transformation. Runtime observation verifies or
completes the exact schema; it is not required merely to rediscover a declared invariant.

## Source planning and collection composition

The replacement for the Optical, Radar and Planet switches is deliberately not a universal offer/matcher framework.
It is a small set of named, versioned commands owned by the executors that understand them.

The current processing naturally separates into three layers:

1. A source adapter acquires and normalizes source observations.
2. A closed temporal collection composer applies requested derivations, optional Classification augmentation,
   selected bands, temporal metadata and SEPAL encoding.
3. A recipe operation such as CCDC, Phenology, LandTrendr or Change Alerts consumes that configured collection and
   declares its own result.

The middle layer is required because the existing `timeSeries/collection.js` already owns behavior shared across
Optical, Sentinel-1 and Planet paths. Copying classification, derivation, selection, casting and temporal rules into
each adapter would make source extensibility worse. Conversely, the composer is not a generic remote-sensing
workflow language. It has one named executor, a closed parameter contract and nested adapter-owned source commands.

Implementation reuse and product compatibility are independent. Sentinel-1, ALOS PALSAR and NISAR may reuse
substantial Earth Engine mechanics after small generalizations while exposing distinct adapter and product
contracts. Planet may share little implementation with Landsat or Sentinel-2 while still satisfying an explicitly
declared consumer requirement. Reuse code by mechanics; establish compatibility only through declared guarantees.

### Current extension cost

The current reuse boundary is incomplete. Adding or changing a source can require coordinated edits to:

- the GUI data-set catalogue and date availability;
- GUI source grouping and selection rules;
- GUI band metadata and grouped options;
- GUI visualization presets;
- the generic `modules/gui/src/sources.js` dispatcher;
- Earth Engine collection construction and source-specific options;
- dependency extraction for recipe or asset-backed sources;
- every recipe that fabricates a Mosaic-shaped model to call the GUI helpers.

The branch is also represented differently at different layers. `collectionType()` is shared by dependency extraction
and Earth Engine execution, which is a useful first step, but `modules/gui/src/sources.js` still repeats the decision
with Optical/Radar/Planet conditionals and constructs partial recipe objects solely to satisfy recipe-local helper
signatures. `lib/js/ee/src/timeSeries/collection.js` owns another family switch and destructures the union of all
family options. This makes a new family a cross-cutting change and lets catalogues, schemas and execution drift.

### Adapter commands, discovery and binding

Treat planning and resolution as distinct pure phases around the existing recipe graph:

```text
source model in persisted shape, whether saved or an unsaved draft
    -> discover command skeletons and named direct references
    -> shared graph completes the authorized closure
    -> resolve declarations bottom-up through role-scoped child bindings
    -> PLANNED command, declarations and evidence requirements
    -> preliminary operation-requirement validation
    -> acquire only relevant authorized evidence
    -> re-resolve affected declarations bottom-up
    -> runtime READY | UNAVAILABLE | INVALID
    -> final operation-requirement validation
```

Discovery returns `DISCOVERED` or `INVALID`. It normalizes legacy input, selects only adapter-owned parameters and
records every direct reference once. Graph edges are a projection of those named references; callers never provide a
second dependency list that can disagree with the command.

The graph owns loading, authorization, edges, cycles, diamonds and traversal order. It does not resolve products.
After closure, the product resolver evaluates declarations bottom-up. A binder receives only the role-scoped child
declarations corresponding to the skeleton's named bindings, not raw foreign recipe records or the complete graph
catalogue. The definition that owns a recipe may inspect its own model while resolving that node; cross-recipe
consumers never reconstruct another type's output from its model.

Binding returns `PLANNED` or `INVALID`. A planned command may have partial product and capability declarations plus
explicit evidence requirements. That does not make the command invalid or unexecutable.

For example, a temporal composer receives a declaration binding rather than a Classification recipe model:

```js
{
    classification: {
        reference,
        productDeclarations,
        capabilityDeclarations,
        evidenceRequirements
    }
}
```

After authorized evidence is resolved, products and capability instances carry their evidence and provider paths.
A provisional capability declaration is not treated as an established capability instance.

Consumer validation is a separate tri-state operation:

```text
validateRequirement({declarations, requirement})
    -> SUPPORTED | UNSUPPORTED | NEEDS_EVIDENCE
```

Before acquisition, `SUPPORTED` means declarations suffice and observation is skipped. `UNSUPPORTED` means no
allowed evidence can make the operation admissible, so resolution stops. `NEEDS_EVIDENCE` is returned only when a
specific authorized acquisition path could decide the requirement.

After acquisition, successful evidence produces `SUPPORTED` or `UNSUPPORTED`; transport or authorization failure is
runtime `UNAVAILABLE`; contradictory or malformed evidence is runtime `INVALID`; and permanently absent semantic
provenance is `UNSUPPORTED` with `INSUFFICIENT_PROVENANCE`. Final validation cannot remain `NEEDS_EVIDENCE` after all
declared acquisition paths are exhausted. Here `UNSUPPORTED` means not admissible under the current operation
contract, whether contradicted or insufficiently evidenced. Runtime availability remains separate: an executable
collection command may still find no observations for one AOI and date interval.

A command and bound plan are deterministic, immutable and JSON-safe. They contain no functions, Earth Engine
objects, credentials, GUI labels or Redux state. They are scoped to their owning adapter or composer, suitable for
fingerprinting and validated again by the trusted executor. They are derived state and are never persisted back into
recipe JSON.

Named operations are interpreted only by the adapter or composer that owns their namespace and contract version.
Do not introduce a generic `operations` language whose vocabulary every adapter must understand.

### Intended extension boundary

Keep four implementation surfaces separate:

1. **Shared planner**: catalogue identities, legacy normalization, command validation, named references, selection
   domain and declared product guarantees.
2. **Earth Engine executor**: revalidates and executes only commands in its adapter or composer namespace.
3. **GUI presentation adapter**: labels, translated tooltips, grouping, availability hints and source-specific
   controls.
4. **Recipe operation**: declares the requirement for one operation and transforms the resulting product; it does
   not reconstruct source rules.

The shared planner owns pure facts used by more than one runtime. Earth Engine objects remain in EE, while translated
labels and widgets remain in the GUI. A large cross-runtime descriptor would couple environments that intentionally
have different dependencies.

One configured command must distinguish what a form may select from what execution will emit:

```js
{
    status: 'PLANNED',
    executionPlan,
    selectionDomain: {
        bands: [/* validated measurements accepted by this composer */]
    },
    productDeclaration: {
        bands: [/* exact bands requested by this configured command */]
    },
    evidenceRequirements: []
}
```

`selectionDomain` is the configured command's available bands, with their facts. Classification binding can extend it
before the user chooses output bands. `productDeclaration` is the projection of one configured selection by name. GUI
option groups are a presentation projection of the available bands and cannot become another band authority.

A discovered skeleton records scoped references explicitly:

```js
{
    source: {
        adapter: {id: 'SENTINEL1_GRD', adapterContractVersion: 1},
        command: {/* adapter-owned parameters */}
    },
    references: {
        classification: {
            role: 'CLASSIFICATION_SOURCE',
            reference: {type: 'RECIPE_REF', id: '...'}
        }
    },
    composer: {
        id: 'SEPAL_TEMPORAL_COLLECTION',
        composerContractVersion: 1,
        parameters: {
            requestedBands: ['VV'],
            classificationBinding: 'classification'
        }
    }
}
```

This shape is illustrative. Planner-owned encoding and executor choices are not arbitrary recipe or browser input.
The final contract should retain only fields justified by the proof packets.

For the first proof, `SEPAL_OPTICAL` is one adapter over its supported Landsat and Sentinel-2 catalogue entries.
Per-dataset collection IDs, native mappings and readers remain internal modules rather than independently contracted
adapters. Its command owns ordered multi-entry normalization. Input order is preserved unless the adapter proves it
irrelevant, while output band order comes from the product declaration rather than incidentally from the first entry.

Introduce a named source-composition boundary only when a real operation must combine independently contracted
adapters. That boundary is distinct from the temporal composer and must not be implied by overloading “source
command” in the first proof.

### Collection products

An image collection is a product, not a capability. Its declaration needs more than a flat image band list:

```js
{
    kind: 'IMAGE_COLLECTION',
    members: {
        requiredBands: [/* present with compatible schema on every member */],
        optionalBands: [/* permitted but not guaranteed on every member */],
        homogeneity: 'HETEROGENEOUS'
    },
    temporal: {
        coordinate: 'system:time_start',
        representation: 'MILLISECONDS_SINCE_EPOCH',
        ordering: 'UNSPECIFIED',
        duplicates: 'ALLOWED'
    }
}
```

Unknown evidence is not silently converted to optional. A trusted constructor may establish guarantees by
construction; resolution does not require exhaustive inspection of every member when authoritative construction
evidence is sufficient for the consumer. A selection transform can produce a homogeneous collection only when it
establishes the requested compatible band on every retained member. An aggregation declares the exact image product
it creates rather than inheriting the member schema automatically.

Planet Daily is the first required heterogeneous witness: RGB and NIR are common, while PSB.SD-only bands are not
present on every member before an explicit selection, filter or missing-band policy.

### Requirements, adapter restrictions and capabilities

Requirements belong to a consumer operation, not to an entire recipe type. Counting images, charting a scalar band,
running CCDC, annualizing LandTrendr input and comparing Change Alerts observations make different assumptions about
the same source collection.

One requirement object may constrain both the product and additional capabilities while preserving their different
roles:

```js
{
    product: {
        id: 'IMAGE_OUTPUT',
        kind: 'IMAGE',
        requiredBands: ['ndvi']
    },
    capabilities: [{
        id: 'CCDC_SEGMENTS',
        version: 1,
        cardinality: 'EXACTLY_ONE',
        baseBand: 'ndvi'
    }]
}
```

Validation returns one operation-level result. Product lookup and transformation remain separate from capability
cardinality, provider lineage and interpretation.

Start with direct structural constraints and adapter restrictions. Current Sentinel-1-specific processing should
say that it requires `SENTINEL1_GRD` at an exact adapter contract version rather than disguising that dependency as a
generic dual-polarization capability.

A capability is admitted only when it expresses consumer-relevant interpretation or behavior that product schema
and adapter identity cannot express. It is granted only by its producer or an explicit transformation. Capabilities
have no inferred inheritance from modality, names or similar fields, and supported adapter options do not become
capabilities automatically. Exact version matching is sufficient initially.

Band names identify bands within one product; they do not establish cross-product semantics. Encoding describes
representation only; matching encodings do not establish that two bands measure the same thing. A future semantic
band description may add measurement identity beside the established encoding:

```js
{
    name: 'ndvi',
    dataType: {/* established physical facts */},
    encoding: {scale: 0.0001, offset: 0, unit: '1'},
    measurement: {id: 'SEPAL_OPTICAL_NDVI', version: 1}
}
```

Use namespaced identifiers only after a migrated consumer proves their contract. Do not turn familiar output names
into informal universal semantic IDs.

Some compatibility is relational. Change Alerts must compare new observations with the measurement represented by
its CCDC Segments source. Keep the authoritative evidence structured and let each operation compare only the
projection it needs:

- value semantics: formula, units, scale, offset and value-changing corrections;
- observation protocol: sensor selection, orbit, masking, filtering and resampling;
- operation scope: AOI and dates, which affect execution but not measurement identity.

Change Alerts may require matching value and substantial observation-protocol evidence, while a chart may need only
one scalar interpretable measurement. Derive fingerprints from canonical normalized projections for efficient
comparison and provenance. A fingerprint is not a substitute for the structured contract. Keep the full execution
fingerprint separate from narrower value or observation-protocol fingerprints.

Authenticated principal and linked Earth Engine identity scope authorization, observations and caches. They are not
scientific measurement compatibility or export provenance and do not enter a measurement contract fingerprint.

### Contract versioning

Version only durable contracts whose interpretation may intentionally evolve:

- `bundleSchemaVersion` identifies execution-bundle serialization;
- `commandSchemaVersion` appears only when a command crosses a runtime or persistence boundary;
- `adapterContractVersion` identifies intentional adapter command semantics and guarantees;
- `composerContractVersion` identifies intentional temporal-composer semantics and guarantees;
- `measurement.version` identifies a scientific measurement definition used across durable boundaries.

Internal refactoring that preserves behavior does not change these versions. Known implementation defects are not
versioned into supported contracts: corrections land before contract activation. Do not add legacy formula branches,
creation-date checks or asset-specific compatibility workarounds for outputs produced by old bugs. Existing affected
assets remain existing data and may need to be recreated when correctness matters.

Schema versioning becomes useful only when a value crosses a durable or runtime boundary such as an authorized
execution bundle. Contract and measurement versions become useful when an actual consumer compares or persists
their semantics. Do not add version fields to transient objects merely to appear future-proof. Existing assets
without trustworthy semantic provenance cannot have their formulas or preprocessing recovered from band names and
physical metadata; observation establishes physical structure, not historical scientific correctness.

### Expected extension workflow

There are several materially different changes:

- **Another catalogue entry using an existing adapter** adds persisted catalogue facts and adapter-owned parameters,
  without changing consumers.
- **Another adapter using shared EE mechanics** may reuse acquisition, correction or normalization functions while
  declaring a distinct contract. PALSAR or NISAR does not inherit Sentinel-1 VV/VH, orbit or correction assumptions
  merely because implementation is reusable.
- **Another adapter satisfying an existing requirement** must do so through an audited declaration or explicit
  transformation. Matching band names or modality is insufficient.
- **Another source composition** adds a named planner/executor only when existing commands cannot express it. It
  declares intended runtime surfaces: shared planning always, EE execution when executable, and GUI presentation
  only when directly selectable or requiring source-specific controls.
- **Another recipe operation** states its own requirement and consumes the configured product without adding a
  source-adapter switch.

Indexes, classification augmentation, selection and temporal encoding belong to the closed temporal composer or a
recipe operation, not to modality. Normalization maps native encoding to logical measurements. Calibration and
correction change representation. Reserve *harmonization* for an explicit transformation that establishes a named
comparability guarantee; common names and numeric encoding alone do not prove harmonization.

Catalogue availability is a GUI hint, not evidence that imagery exists for the current AOI, dates and identity.
Authorization and runtime availability remain separate evidence.

### Bands and visualizations during migration

Current `bands.js` modules commonly combine physical schema, numeric display hints, translated tooltips and option
grouping. Split those responsibilities incrementally:

- shared product declarations own ordered band identity and established physical facts;
- a GUI band-presentation catalogue owns labels, tooltips, ranges and groups;
- visualization templates name the product and required band identities, then applicability is checked against the
  resolved or declared product;
- user-edited visualization state remains owned by the recipe or layer, never by an adapter or composer contract.

Existing `bands.js`, `visualizations.js` and `modules/gui/src/sources.js` exports remain compatibility adapters while
callers migrate. The first goal is to project their answers from one planned product or selection domain, not to
rewrite every panel.

### Source-planning verification

Before adopting the boundary, tests must prove:

- shared planning and EE execution consume the same normalized command;
- every adapter validates its own command namespace and intended runtime surfaces;
- a modality label or matching band names never makes incompatible products interchangeable;
- dependency edges are projected from exactly the named references the selected EE branch reads;
- a binder cannot inspect an undeclared graph record;
- representative declarations agree with the actual `getImage$()` result, not another helper projection;
- adding a synthetic catalogue entry for an existing adapter does not require a recipe-type change;
- same-name but semantically incompatible synthetic adapters are rejected;
- an explicit audited transformation can establish a requirement an adapter does not natively satisfy;
- missing EE or GUI implementations fail only when the adapter declares that surface;
- source presentation changes cannot alter physical output schema;
- recipes consuming a collection product do not branch on Optical, Radar or Planet;
- equivalent input has deterministic canonical serialization, while order-significant input changes the plan;
- the trusted executor rebuilds or revalidates the command from the authorized recipe bundle and never trusts a
  browser-supplied plan as execution authority.

## Transformation vocabulary under investigation

The audit must determine the smallest vocabulary that covers real recipes. Current evidence requires at least:

- **intrinsic static**: exact schema fixed by the implementation, such as Regression;
- **intrinsic model-derived**: exact schema derived from the recipe model, such as Classification;
- **intrinsic observed**: exact names or types require runtime evidence, such as a direct asset;
- **preserving**: ordered schema and relevant semantics pass through one role, such as Masking;
- **selecting and renaming**: an explicit name-based input-to-output mapping;
- **n-ary composition**: ordered bands are selected and renamed from several roles, such as Stack;
- **arbitrary derivation**: output names are declared by expressions while physical types may need observation, as
  in Band Math;
- **capability-informed projection**: a capability interprets an array-valued product so CCDC Slice can derive its
  scalar image product;
- **non-image result**: a recipe may declare another result kind without declaring `IMAGE_OUTPUT`, as in Sampling
  Design.

The declaration says what can be derived without Earth Engine and what evidence is still required. Unknown evidence
stays unknown; no transformation guesses a default physical type.

### Transformation effects and capability projection

A transformation declares facts about its output rather than enumerating every capability it might preserve. The
initial vocabulary stays deliberately small:

```js
{
    bandMapping: {kind: 'IDENTITY'},
    values: 'PRESERVED_WHERE_VALID',
    validity: 'NARROWED'
}
```

An identity mapping is complete without listing every band. A subset or rename carries the actual, ordered mapping:

```js
{
    bandMapping: {
        kind: 'SUBSET',
        mappings: [
            {input: 'tStart', output: 'tStart'},
            {input: 'ndvi_coefs', output: 'ndvi_coefs'}
        ]
    },
    values: 'PRESERVED_WHERE_VALID',
    validity: 'PRESERVED'
}
```

Generic infrastructure validates that mappings are unique and refer to the stated input and output products. It
does not interpret CCDC completeness or infer semantic preservation. The capability definition owns that decision:

```text
transformCapability({capability, inputProduct, outputProduct, effects})
    -> PRESERVED | REDUCED | DROPPED
```

The result carries the preserved or reduced capability description and diagnostics where relevant. This means a
future capability can pass through Masking without adding its name to Masking, while a capability whose semantics
depend on unchanged validity can reject the same effects.

Export-band selection is another product transformation. It projects the resolved product through an explicit
subset mapping, recalculates capabilities, and only then validates direct presets and durable transformation
templates. A Masking export that omits required CCDC timing or measure bands must not retain `CCDC_SEGMENTS` or
advertise a Slice template merely because the pre-selection source carried them.

Named presentation transformations remain closed contracts. `CCDC_SEGMENT_SLICE@1` owns its required
`CCDC_SEGMENTS` input, validates its template body, derives physical source-evidence requirements from logical band
references and Slice parameters, and materializes a concrete target-product visualization. The template does not
repeat the transformation's accepted input contract or source requirements.

### Current provider limitation

Providers answer from configuration, from an observation of their running image, from the catalogue their producer
declares, or from their sources' descriptions.
Regression, Phenology, Classification and several alert products could describe their ordered names and scalar shape
from configuration, but have no provider yet. No provider combines declared constraints with an observation that
supplies exact bands. The eventual contract must support all three outcomes:

1. an exact description from configuration requiring no observation;
2. useful declared constraints followed by observation that supplies exact bands;
3. an entirely observed description for assets and arbitrary runtime output.

Do not implement the second by letting each provider guess when an optional observation is complete. The evidence
requirement must stay explicit in what a provider asks for. An observation that contradicts a declared invariant is a
controlled invalid result, not a reason to silently prefer either side.

The current resolved contract retains, per band, ordered names, physical array dimensionality, optional export
policy and optional [encoding](data-sources.md#band-encoding). Expanding it to precision, range, grid or semantics
is a separate contract change backed by consumers; it is not required for the scalar/array destination fast path.

### Current execution-request limitation

Only a producer that translates or projects `outputBands`, or whose selection already names its outputs, returns
exactly the requested bands. The export adapters supply `outputBands` alongside the selection for every recipe,
declared or not; the limitation is whether the producer honors it.

## Preliminary recipe audit

This table records the registered GUI types. It is a first classification, not proof that every listed GUI band
matches execution. The execution comparison is a research gate below.

| Recipe | Canonical output | Additional products or capabilities | Current schema source | Initial shape knowledge |
| --- | --- | --- | --- | --- |
| Asset | selected Earth Engine image | asset source presets | copied `assetDetails`, runtime metadata | observed; scalar, array or mixed |
| Band Math | expression outputs with configured names | rewritten input presets | output expression model and copied inputs | names known; physical type incomplete |
| BAYTS Alerts | alert result | first/last radar map products | fixed alert bands plus reused Radar helpers | scalar |
| BAYTS Historical | orbit-selected historical metrics | none identified | fixed vocabulary filtered by model orbits | scalar |
| CCDC | CCDC Segments image | scalar count map product; `CCDC_SEGMENTS` | runtime image for segments, fixed GUI count | segments array; count scalar |
| CCDC Slice | selected segment projection | `CCDC_SEGMENTS` consumer | copied source snapshot and manual reconstruction | derived scalar, names source/model-dependent |
| Change Alerts | scalar alert result | monitoring/calibration collection mosaics | fixed change bands plus fabricated family recipes | scalar |
| Class Change | transition and optional confidence | classification semantics | legend and input configuration | scalar |
| Classification | class, optional regression and probabilities | classification categories | classifier capability and legend | scalar |
| Index Change | change metrics and optional error/confidence | none identified | fixed schema plus model condition | scalar |
| LandTrendr | change result | annual optical mosaic map product | fixed change bands plus fabricated mosaic recipe | scalar |
| Masking | primary image with changed validity mask | compatible inherited presets/capabilities | copied primary snapshot today; shared preservation declared | inherited; may be mixed |
| Optical Mosaic | selected composite | internal optical collection | dataset/intersection/index/compose helpers | scalar |
| Phenology | seasonality metrics | internal source collection | fixed grouped vocabulary | scalar |
| Planet Mosaic | selected composite | internal Planet collection | fixed GUI vocabulary | scalar |
| PyEO Alerts | alert result | internal classified monitoring collection | fixed vocabulary | scalar |
| Radar Mosaic | point-in-time or time-scan composite | internal radar collection | date-dependent fixed families | scalar |
| Regression | regression image | none identified | fixed vocabulary | scalar |
| Remapping | remapped class image | categorical semantics | fixed band plus legend | scalar |
| Sampling Design | sample FeatureCollection; no `IMAGE_OUTPUT` | stratification evidence | empty GUI band helper | not applicable |
| Stack | selected and renamed input bands | mapped source presets | copied input snapshots and output mapping | inherited composition; may be mixed |
| Time Series | no generic image export established | scalar count map product and chart series | fixed count plus collection helpers | count scalar |
| Unsupervised Classification | cluster class image | cluster value semantics | fixed band with model-derived range | scalar |

## Detailed findings

### One helper currently describes incompatible products

LandTrendr returns change bands for one map mode, optical mosaic bands for another, and their union when no mode is
provided. Retrieve offers only the change bands. Change Alerts and BAYTS similarly switch between algorithm output
and source-collection mosaic products. CCDC's GUI helper exposes scalar `count`, while its custom asset export is the
array-valued Segments image.

The shared definition therefore keeps one canonical `imageOutput`; additional map products require explicit names.
Callers must not ask for an unqualified union.

### Reuse currently depends on fabricated recipe models

The generic GUI source helper and Change Alerts construct partial recipe objects to call Optical, Radar or Planet
helpers. Those objects encode undocumented assumptions about another recipe's persisted model. Adapter and composer
commands remove both the fake model and the legacy branch switch from consumers.

Earth Engine contains related delegation: LandTrendr constructs an ephemeral Optical Mosaic for its annual context,
and Change Alerts constructs Optical, Radar or Planet mosaics around monitoring dates. Reusing an execution module is
reasonable; treating the ephemeral adapter as if it were a persisted recipe contract is not. Product, adapter and
composer APIs should make the required model projection explicit and test it in one place.

### Copied descriptions are persisted as configuration

Masking stores copied bands and visualizations beside each selected reference. Stack and Band Math store source
snapshots and rewrite their visualizations. CCDC Slice loads a selected CCDC recipe and its Classification dependency,
reconstructs segment metadata and stores it under `model.source`. Change Alerts performs related CCDC reconstruction.

Only source reference, user selections and explicit output mappings are durable intent. Current bands,
visualizations and capabilities are runtime descriptions keyed by source versions. Migration must preserve legacy
JSON while ceasing to treat those snapshots as authoritative.

### Physical schema and GUI decoration are mixed

Optical band entries combine precision and range with translated tooltips. Classification combines physical range,
category-derived labels and form text. The shared output-band description should distinguish physical facts, export
requirements and established semantic evidence; the GUI builds labels and grouped options from stable band names or
semantics.

### GUI and Earth Engine can drift

Collection and algorithm implementations independently select, add and rename bands in Earth Engine. A shared pure
declaration can own deterministic model-derived output, but Earth Engine remains the execution boundary. Each
migrated type needs a focused comparison against the image returned by its real `getImage$()` path, evaluating
`bandNames()` and `bandTypes()` of the image returned for representative selections as the oracle; where a producer
computes bands only on request, the image built for an empty selection is not. Comparing a declaration only with
`getBands$()` is insufficient because
that helper is one of the independently maintained projections already shown to drift. Runtime observation remains
necessary where the EE graph determines the answer.

### Early execution-comparison findings

The source comparison found helper drift and production defects. They must be fixed before the first adapter or
temporal-composer contract is declared:

- Radar Mosaic's point-in-time `getBands$()` does not report every band its composite carries. The quality mosaic
  keeps each collection band, so the image also holds `angle`, `quality` and `unixTimeDays`. An empty selection makes
  both polarisations harmonic dependents, which adds the per-observation `VV_t`, `VV_constant`, `VV_cos` and
  `VV_sin` bands and their VH counterparts, and then the harmonics summary. Its `VV_t` and `VH_t` repeat names the
  composite already holds, and Earth Engine renames them `VV_t_1` and `VH_t_1` rather than refusing them. Whether a
  point-in-time composite should carry these bands at all needs a product decision.
  `modules/gee/verify/declaredOutputBands.mjs` reports the difference against live Earth Engine.
- Optical GUI and EE code maintain separate data-set band catalogues. EE also exposes `unixTimeDays` for a MEDOID
  output while the GUI metadata group currently offers only `dayOfYear` and `daysFromTarget`. Whether
  `unixTimeDays` is intentionally hidden or accidentally omitted needs a product-level decision.
- Change Alerts' GUI change-band dictionary lists the same nine bands as Earth Engine in a different order, and that
  order drives the option list.
- Temporal Sentinel-1 derives `ratio_VV_VH` by dividing values after the source adapter converted VV and VH to dB,
  while Radar Mosaic subtracts VH from VV. The shared name therefore currently identifies different measurements.
- Several temporal defaults contain `DECENDING`, while the executor expects `DESCENDING`; the effective selection
  does not match the apparent both-orbits intent.
- Those defaults set the unused `speckleFilter: 'NONE'` while execution reads the inherited
  `spatialSpeckleFilter`, which can leave `LEE_SIGMA` active unexpectedly.
- Optical explicitly scales Classification regression and probability outputs before temporal casting, while Radar
  and Planet do not use the same encoding path. One temporal classification-band contract cannot be claimed until
  this is corrected deliberately.
- Empty and unknown legacy data-set selections fall through to Planet, while mixed Sentinel-1 and Landsat selections
  can be classified as Optical. That permissive classifier is not a safe extension boundary.
- Planet Daily combines four-band and eight-band members. Its GUI vocabulary is fixed, but the underlying collection
  is heterogeneous until a selection, filter or explicit missing-band policy establishes a homogeneous product.
- Optical common-band order follows the first selected data set and collection merge order follows input order.
  Neither order may be canonicalized away until execution consequences are understood.
- CCDC proves that GUI `noImageOutput` and GUI `getAvailableBands()` are not output contracts: the former only
  removes CCDC from recipe-selection lists offering a generic image input, and the latter describes scalar `count`,
  while the custom CCDC task exports the array-valued Segments product. `noImageOutput` controls no export path;
  its name asserts an output fact it does not own.

Do not encode these defects as compatibility profiles, legacy measurement contracts or accepted composer behavior.
For each defect, reproduce the failure, define the intended behavior in a red regression test, fix it on `master`,
and merge the correction into this branch. The first contract describes only the corrected behavior. Investigation
may use temporary characterization or read-only inventories, but committed product-contract tests must not bless a
known scientific defect.

Persisted recipe normalization may need a focused migration decision when a typo or obsolete option is stored. That
is input migration, not a product guarantee. Assets already produced by defective algorithms receive no special
formula branch, timestamp test or compatibility workaround in the new architecture; users recreate them when their
scientific correctness matters.

Backward-compatible reading of an established output format is different from preserving a defective algorithm.
Existing CCDC Segments assets remain valid Slice inputs when the CCDC asset adapter can establish their structural
contract from observed bands and required metadata. Their legacy `visualization_*` properties continue to carry
Slice templates. This does not version or reproduce an old computation, and it does not make those mutable
properties generic capability authority.

These findings still prove that a product-qualified declaration must replace both helper implementations as the
authority. Choosing either current side wholesale would preserve a different set of errors.

### Representative agreement findings

The comparison also found useful stable declarations rather than only defects:

- LandTrendr uses the same seven fixed change bands in GUI and EE; its annual mosaic branch is explicitly map-only.
- Phenology's fixed base and month band lists agree with the EE product construction.
- The Classification recipe derives the same optional regression and probability band names from classifier
  capability and legend values on both sides. This does not settle the inconsistent temporal-composer encoding
  paths identified above. Its categorical labels and palette remain presentation and semantic concerns.
- Regression and Unsupervised Classification each have one fixed scalar output band.
- PyEO Alerts has one fixed change-report vocabulary shared in intent by GUI and EE.
- Masking's EE `getBands$()` delegates to the primary image exactly as the shared preserving transformation states.
- Stack's execution selects and renames by the persisted name mapping in input order. Its physical types must be
  inherited from the selected source bands rather than recovered from output names.
- Band Math's output names and explicit casts come from its expression model, while calculations configured as
  `auto` still require runtime physical evidence.

These are the first candidates for exact/model-derived declarations and transformation tests. They also show that
the migration does not require one mechanism for every recipe: static, derived, inherited and observed outputs can
share a result contract while retaining different evidence requirements.

## Provisional declaration shape

The following illustrates responsibilities only. Names and nesting are not accepted API:

```js
defineRecipeType({
    type: 'EXAMPLE',
    directSources,
    imageOutput: preservingProvider({role: PRIMARY_IMAGE}),
    products: {
        annualMosaic: derivedProduct({/* declaration */})
    },
    capabilities: {
        /* capability derivations */
    },
    presentation: {
        /* direct product presets and closed transformation templates */
    }
})
```

Do not add `products`, presentation or capabilities to `defineRecipeType()` until at least two migrated witnesses
need each field and the audit has established validation rules. The existing `imageOutput` contract remains the
canonical output seam and should evolve compatibly.

The shown top-level `directSources` is the current recipe-definition seam. For a future adapter or composer command,
named references belong in the discovered command skeleton and direct edges are projected from them. Do not require
callers to maintain both a command reference and an independent matching edge declaration.

Presentation may be declared beside products and capabilities in one recipe specification, but its definitions,
applicability and active bindings remain separately owned. It must not introduce GUI translation dependencies into
`lib/js/shared` or become evidence for product schema.

## Research plan

### Phase A: correct known production defects

Address the ratio formula, orbit spelling, speckle authority, classification encoding and unsafe unknown-source
fallback on `master`, with intended-behavior regression tests. Merge those fixes into this branch before defining
the first source or temporal-composer contract. Inventory impact where useful, but do not create supported legacy
contracts for defective outputs.

Continue the product matrix for every registered recipe type:

- canonical output and every map-only or internal product;
- the exact EE function constructing each product;
- declared, model-derived and runtime-observed band facts;
- per-band physical shape and separately owned export requirements;
- source-adapter, composer and domain-capability dependencies;
- source presets and user-owned visualization inputs;
- copied model fields and their original authority;
- consumers of `getAvailableBands()` and `getPreSetVisualizations()`.

### Phase B: discovery and pure planning proof

Introduce no real source migration. Prove with current fixtures and synthetic adapters:

- legacy selection normalization and explicit unknown or unsupported-combination diagnostics;
- adapter-owned parameter extraction that ignores irrelevant fields from today's union-shaped models;
- command validation, deterministic serialization and order preservation by default;
- named reference discovery with dependency edges projected from the same skeleton;
- scoped binding that cannot inspect undeclared dependencies;
- one statically complete declaration and one valid plan with explicit unresolved evidence;
- no graph traversal, loading, EE object or GUI presentation dependency inside planning;
- missing runtime implementations fail only for surfaces the adapter declares.

### Phase C: collection composition and requirements proof

Add the closed temporal composer and representative hard cases:

1. Optical alone and Landsat plus Sentinel-2, including deterministic declared band order and observed input-order
   effects.
2. Current Sentinel-1 command with exact adapter restrictions and supported options.
3. Two incompatible synthetic radar adapters: one with different polarizations and one with matching VV/VH names
   but incompatible semantics.
4. An explicit audited transformation that establishes a requirement the source does not natively satisfy.
5. Classification dependency binding, selection-domain expansion and corrected cross-adapter output encoding.
6. Planet Daily heterogeneous members and a transform that genuinely establishes homogeneous selected output.
7. CCDC, chart, Phenology and LandTrendr requirements that demonstrate operation-specific validation.
8. Change Alerts relational comparison using structured value and observation-protocol evidence.
9. A declared source that needs no EE observation and a custom asset whose exact description requires evidence.
10. CCDC Slice templates whose logical references are resolved by the named transformation rather than compared
    directly with CCDC Segments physical band names.
11. Identity Masking and explicit export-subset mappings that preserve, reduce or drop `CCDC_SEGMENTS` correctly.

### Phase D: trusted boundary integration

- Complete dependencies through the shared graph; planners declare direct references but never load or traverse.
- Rebuild or validate commands from the authorized recipe bundle at the trusted task boundary.
- Revalidate adapter and composer contracts in EE before execution.
- Compare declarations with the actual `getImage$()` result, including band names and types.
- Treat the browser plan as preflight evidence only.
- Prove GUI compatibility adapters no longer fabricate recipe-shaped models.

### Phase E: migrate incrementally

Begin with one output described from configuration, one preserving provider and one collection consumer. Keep old
`bands.js` and `visualizations.js` exports as thin projections until their callers migrate. Do not migrate all recipe
types in one commit, persist resolved descriptions or plans into recipe JSON, or add a generic matching registry in
anticipation of future adapters.

## Performance constraints

- Statically or model-derived schemas resolve synchronously without `/bands` observation.
- A declaration-level physical guarantee can drive conservative UI compatibility before exact names resolve.
- Unknown assets and genuinely runtime-derived outputs use the source runtime and future versioned resource cache.
- One consumer changing band selection recomputes compatibility from a resolved description without re-observing.
- Planning and collection-description derivation are pure and proportional to selected entries, references and
  bands.
- No recipe-type registry lookup, graph traversal or Earth Engine request runs on unrelated Redux actions.

## Verification

Pure shared tests own declaration validation, deterministic band order, physical guarantees, preservation, name-based
selection and renaming, explicit subset mapping, capability projection, product separation, presentation-definition
validation and direct visualization applicability.

Boundary tests prove:

- GUI adapters preserve existing grouped options and applicable presets during migration;
- EE outputs for representative selections agree with declared names and array dimensionality;
- map-only products never enter canonical Retrieve output;
- copied legacy snapshots cannot override current resolved evidence;
- malformed presentation remains distinct from an unsupported product;
- active visualization bindings name the concrete product instance and parameters they preview;
- export selection drops capabilities and transformation templates whose source requirements no longer hold;
- statically known scalar or array compatibility requires no metadata request;
- unknown and mixed outputs remain conservative until exact evidence is available.

## Open decisions

- Minimal representation for partial band-schema guarantees and their composition.
- Whether output name is sufficient band identity for every transformation.
- Product identity and parameterization for map modes.
- Minimum structured value and observation-protocol evidence required by the first relational consumer.
- Shared data-set catalogue ownership, including availability and logical-band mappings, without exposing EE objects
  or GUI translations across runtime boundaries.
- Which categorical fields belong in generic band schema versus a Classification capability.
- How much deterministic schema is shared directly with EE versus verified at the runtime boundary.
- Whether a later operation needs a named boundary for composing independently contracted source adapters.
- Product identity and temporal guarantees required beyond the first collection-composer proof.
- Migration treatment for legacy user-edited visualizations that originated as copied source presets.
