# Recipe output products and band schemas

The current contract separates canonical output, named map products, physical band facts, export requirements,
encoding and GUI decoration. Every image-producing recipe type declares an `IMAGE_OUTPUT` provider; Sampling
Design declares `NO_IMAGE_OUTPUT`. Map and Retrieve read through the shared output boundary.

[Source resolution](source-resolution.md) owns traversal and readiness; [the GUI runtime](gui-source-runtime.md)
owns acquisition; [freshness](source-freshness.md) owns currency; [visualizations](visualizations.md) owns styles.
The source-planning and transformation-projection sections below are explicitly target design, not a second
implemented planning API. The [roadmap](data-sources.md#remaining-work) lists remaining adoption work.

## Product roles

A product is a concrete logical result: a canonical image, one map mode, an internal temporal collection, a future
AOI geometry product or a non-image result. A union of every band any mode could display is not a product.
CCDC Segments is an image product; `CCDC_SEGMENTS` is an interpretation capability, not another physical schema.

A declaration states derivation; a resolved description gives one configured graph's ordered bands and evidence.
Schema, structural dependency validity, operation readiness and current acquisition authority answer different
questions. A description of available bands is not permission to compute.

GUI labels/tooltips/groups/preset ranges decorate names. They do not decide whether bands exist, their execution
order, dimensionality or export policy. Raw names remain request/selection identities.

## Declaration and description

Every image-producing type declares its output. Every band in a READY description has an established
`dataType.arrayDimensions` (0 for scalar, a positive integer for array). Declaration, inheritance or observation
must establish it; waiting for or failing to obtain that evidence must not publish an unknown-dimensionality READY
answer. A names-only catalogue observation remains useful internally when the provider supplies the physical shape.
An empty output is still valid. This requirement does not make encoding, units or semantic meaning mandatory.

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
an answer that depended on anything unavailable is discarded. A provider that finds its recipe cannot be described -
its configuration contradicts itself, or what it read contradicts its configuration - refuses with stated diagnoses
instead of a candidate. A refusal is definitive: it is kept beside evidence still missing, and it never states what
only evidence settles. Declared roles and preservation effects stay data,
because capability resolution reads them without resolving anything. A consumer cannot tell how a description was
acquired.

The public bands available to request, the image built with no selection, and the result of one explicit selection
are distinct contracts. A description answers the first; it does not promise that every available band is already
present in an unselected image. Each producer states its default-selection behavior, and verification covers both
default and explicit requests. Internal working bands are not public output merely because an unselected image
carries them. Consumers must not substitute that image's schema for the public catalogue unless the producer's
contract establishes that they agree.

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
destination compatibility, export policies and encoding. A selection is a set of choices, not a sequence: Retrieve
requests the chosen bands in the output's order, whatever order they were chosen in, and CCDC's measures in the order
it offers them. "All bands" names every available band, ignoring a manual
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

### Band discovery without image construction

Band questions are answered without building an image where configuration or metadata can answer them, and
without computing an aggregate extent merely to answer them.

**Implemented acquisition** (`lib/js/ee/src/bandEvidence.js`, used by gee's `/bands` and task-export jobs).
Task export authority in this document means the server job in gee; the task container calls it through the gateway.


- An asset's schema is read directly: an image's own bands, or a raw collection's first image. Its stored encoding
  is the image's or the collection's own metadata, read in the same evaluation; a collection's member properties
  are not encoding authority. A collection holding no images is a failure, not an asset without bands. No mosaic
  is constructed and no collection geometry is aggregated.
- A recipe's running image is read through its producer's optional `getSchemaImage$()` where it has one, and
  otherwise through `getImage$()`. The hook guarantees a schema, not an execution: the band names, order and array
  dimensionality `getImage$()` builds, under the first-contributing-image assumption. It reports configuration
  errors on its own path, such as no contributing image, but cannot detect every failure of full execution - a
  later member with incompatible bands, for example. A failed schema read is a failure; it never falls back to
  building the image. The hook stays inside the Earth Engine implementations: providers still ask only for their
  output description.
- An Asset recipe over a collection implements the hook with execution's own AOI, date and property filters,
  one contributing image, and its masking, selection and composite; it neither clips nor copies properties, so an
  `ASSET_BOUNDS` recipe computes no collection geometry here. Filtering is an intentional workaround for
  heterogeneous collections: the unfiltered first image never decides a filtered recipe's schema. Its name-only
  `getBands$()` reads the same image, so typed and name-only requests answer the same question. A one-image
  composite reproduces the full composite's schema for every supported composite; Earth Engine refuses median,
  mean, mode and standard deviation over array bands, on either path (`modules/gee/verify/assetCollectionSchema.mjs`).

Trusting the first image is a collection-schema assumption, not verification that every member agrees. Do not
replace that assumption with a collection-wide schema scan.

**Acquisition rule:**

- Return names and physical dimensionality directly when configuration establishes them. Asking for types must
  not automatically turn a known schema into an observation of the running image.
- When the answer depends on a referenced source, use the provider's existing `input()` or `inputs()` access and
  preserve or transform its description. Resolution owns reference traversal and acquisition.
- Observe a constructed output only when its schema cannot be established by these means. Such observation is an
  explicit provider requirement, not a generic fallback for a caller requesting dimensionality.
- An `ASSET_BOUNDS` Asset recipe still previews and exports within its whole collection's bounds, which for a
  global collection is computed from every member's footprint. Changing that extent is a separate decision from
  schema discovery.

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
[Band encoding](#band-encoding) for the persisted form and export rules.

Dimensionality is required for a READY band; other fields may remain absent when evidence is unknown. Precision, numeric range, grid, categorical value semantics
and other candidates enter the shared contract only when a migrated consumer establishes their source, ownership and
validation rules. Physical schema, export requirements and semantic evidence share a compatible band record, but their ownership
and completion rules stay distinct. The current GUI `precision` vocabulary is not
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

A product request identifies its product and validated parameters. It must not read ambient layer state
or accept an unstructured `visualizationType` bag. Parameters affect the product description and its presets, but do
not alter the canonical image output declaration.

### Map-product identity

The shared map-product contract covers the types whose map layers display different products.

In the GUI a layer names its product from its type's vocabulary over its `layerConfig`, and a value the type does
not know is refused ([reading a recipe's own output](gui-source-runtime.md#reading-a-recipes-own-output)).

On the wire the product still travels as that layer config, spread whole into the image factory's arguments beside
the band selection. Every other axis a mode needs - LandTrendr's `year`, Change Alerts' `mosaicType`, BAYTS'
`previouslyConfirmed` and `minConfidence` - rides in the same bag. The preview and the visualization editor's
histogram and distinct-value requests all send that same bag, so they concern one product. Export passes neither a
mode nor a parameter, so it always builds the canonical product, with whatever each producer does for a parameter it
was not given. The canonical observation (`/bands`) is asked with no product arguments on the current wire protocol.

A layer therefore names a product and supplies that product's declared parameters. Every product a type exposes is
named, including its canonical image output: absence is not an identity, and a request carrying an unknown product
or an unvalidated parameter is refused rather than silently resolved as the canonical one. A type declares its map
products beside its canonical output, and a product declares its parameters. Product names are local to their
recipe type, because nothing compares them across types and a shared vocabulary would invite exactly the
matching-by-name that product compatibility refuses.

A product whose image is another recipe's declares that, rather than restating bands: LandTrendr's annual mosaic,
BAYTS' radar observation and Change Alerts' collection mosaic are described by the declaration of the mosaic they
build, from a projection execution builds the same mosaic from, so the bands described are the image's by
construction.

| Type | Canonical output | Map products | Parameters |
| --- | --- | --- | --- |
| LandTrendr | change map | annual mosaic, delegating to an Optical Mosaic | `{year}` |
| BAYTS Alerts | alerts | radar observation, delegating to a Radar Mosaic | `{position: first \| last}`; alerts takes `{previouslyConfirmed, minConfidence}` |
| Change Alerts | changes | collection mosaic, delegating to the configured mosaic | `{period: monitoring \| calibration, mosaicType: latest \| median}` |
| CCDC | segments | count | none |

**Declared products.** A shared type declares its products beside its canonical output, as
`mapProducts: {NAME: mapProduct({describe, parameters, delegatesTo})}` (`lib/js/shared/src/recipe/output/product.js`).
Only the root of a read is described as a named product; every recipe it reads is still described by its canonical
output. A product is described from its recipe's configuration alone: its provider is given the recipe and its
normalized parameters, and one that reads an observation or a source is refused. The resolver attaches its identity as
`output.product` after its bands pass the ordinary description validation; a canonical description has no such field.
Export stays canonical: the GUI's export submission refuses a description naming a product.

- **Parameters.** A product declaring `parameters({recipe, parameters})` normalizes what it is given, or refuses it by
  path; a refusal is `INVALID_PRODUCT_PARAMETERS` at `['parameters', ...path]`, and nothing is described. A parameter
  given as `undefined` is omitted, as it is on the wire. A product declaring none takes none. Its identity carries the
  normalized parameters: `{name, parameters}`, or `{name}` for a product taking none.
- **Delegation.** A product whose image is another type's declares `delegatesTo` that type, or a list of distinct types
  it chooses among - Change Alerts' collection mosaic lists `MOSAIC`, `RADAR_MOSAIC` and `PLANET_MOSAIC` - and hands
  `delegate` a recipe it builds. That recipe is described by the delegate type's canonical declaration, on the same
  terms as the product: a read of an observation or a source is refused, and a recipe of a type it does not list, or a
  type whose declaration is missing or reads its role, is `UNSUPPORTED_DELEGATE`. The built recipe is no graph node and
  has no identity: its answer is the product's candidate, validated once under the product's own recipe. The registry
  checks each `delegatesTo` once all types are registered - the type exists and declares an output without a role -
  without running any provider; a list must be nonempty, of non-blank names, each once.

CCDC's `COUNT` takes no parameters. LandTrendr's `ANNUAL_MOSAIC` takes `{year}` - any integer, the recipe's `endYear`
when omitted or null - and delegates to Optical Mosaic over the calendar-year median mosaic that execution builds from
the same function (`annualMosaicRecipe`). It describes the bands a layer may ask for, not whether imagery exists for
that year; Optical Mosaic built with no selection computes no indexes and keeps its `qa` and date bands, and no layer
asks for it so. The product accepts any integer year, as execution does; the GUI's layer keeps the year it selects
within the recipe's fitted period ([products and presentation](gui-source-runtime.md#reading-a-recipes-own-output)).

CCDC is the case that shows why absence is not an identity: `COUNT` is the only mode string it has, and its segments
product is simply what it builds when no mode is present. Naming both makes the canonical product something a
consumer asks for rather than something it gets by omission.

### Domain capabilities

Some downstream operations need more than a flat image description. CCDC Slice needs segment measures, base bands
and date interpretation. Those facts belong to a `CCDC_SEGMENTS` capability describing the CCDC Segments image
product, not to a special interpretation of generic CCDC band names and not to copied fields in the Slice recipe.

Capabilities can refer to an image product without becoming another source of its physical bands.

### Presentation

[Visualization ownership](visualizations.md) owns preset/template binding, local styles and applicability.
A direct style uses concrete scalar bands; a CCDC Slice template names logical outputs of its transformation,
not the source's physical arrays. Neither establishes schema or capabilities.

Legacy assets store both forms as `visualization_*` properties. The owning image/segment adapter interprets
them; the metadata does not choose its own product or transformation.

### Form metadata

Band labels, translated tooltips and option groups are projections of a product description plus GUI metadata. They
may live near a recipe's UI while the physical declaration is shared. A form group cannot determine execution
order, physical type or export policy.

### Band choices in Retrieve

The [GUI Retrieve contract](gui-source-runtime.md#retrieve-integration) owns watching, current-state acceptance,
readiness, source currency, destination checks and reconciliation. One output read supplies physical choices,
submitted names and policies. GUI labels/groups decorate names; ungrouped physical bands remain available.

Pending/failed/invalid reads offer no authoritative choices and never rewrite saved selections. After success,
remove unavailable saved choices without substituting another band. An empty manual selection means none.
Derived selectors translate choices to physical names before validation; CCDC breakpoint and Slice-combination
requests can still fail even when their base choices were offered. Time Series indicators retain type-owned
choices and use the shared read for readiness/authority without treating them as count-image bands.

### Structured band selection (deferred)

Sharing band selection between a producer and a preserving wrapper requires more than copying group labels. Each
Retrieve panel translates its own selection into the physical names it exports, and those names are checked against
the answer like any other selection: CCDC by the bands its own fitting rule exports for the measures chosen, breakpoint
bands included; Slice by every base band and measure combination asked for, an unknown measure refused. What remains
deferred is sharing the picker itself. The panels expose different selection semantics:

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

## Band encoding

Each band of an image output may state what its stored values mean: `physical = stored * scale + offset`, in
`unit` where established. The field is part of the shared output-band record described in
[output products](output-products.md#output-band-description); it describes representation, not measurement
identity, and it is numeric encoding, not pixel size. Absent is unknown — never 1, and never inferred from band
names, data types or a producer's current configuration.

**Producers.** A producer states the encoding of the bands it actually emits. The optical mosaic declares
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

## Target design

The following planning and capability-projection contracts are not yet implemented as a general API. Current
recipe providers and consumer-specific capability declarations remain the execution path. Introduce the target
only through a bounded consumer that replaces existing duplicated logic.

## Source planning and collection composition

**Target design; no general adapter/composer API exists.** Replace family switches and fabricated foreign-recipe
models through a bounded consumer that removes existing duplication. The independent
[collection-output correctness assessment](data-sources.md#collection-output-correctness) does not depend on this
refactor and must establish actual behavior before new contracts adopt it.

### Ownership boundaries

Keep three execution responsibilities separate:

1. A source adapter acquires observations and normalizes native encoding.
2. A closed temporal composer owns shared derivations, Classification augmentation, band selection, temporal
   metadata and SEPAL storage encoding, as the current `timeSeries/collection.js` partly does.
3. A recipe operation consumes the configured collection under its own requirements and declares its result.

Modality groups presentation; catalogue entries identify saved selections. Neither `OPTICAL`, `RADAR`, `PLANET`
nor a matching band name proves scientific compatibility. Custom assets still need an explicit processing contract.
Reuse EE mechanics where they fit: Sentinel-1, PALSAR and NISAR can share implementation without inheriting each
other's measurement, orbit or correction assumptions. Planet can satisfy a consumer requirement without sharing
Optical implementation. No universal matcher or workflow language is proposed.

Current extension cost spans GUI catalogues/date hints, band options, presets, `modules/gui/src/sources.js`, EE
construction/options and dependency extraction. GUI helpers fabricate Mosaic-shaped models; EE collection building
has its own family switch. A replacement should give shared pure planning ownership of normalization, named
references and product guarantees, EE ownership of execution, and GUI ownership of labels and controls. Recipes
state operation requirements instead of reconstructing source rules.

### Planning, evidence and execution

Discover adapter-owned parameters and named direct references from persisted input or a draft. Project graph edges
from those references once; the shared graph retains loading, authorization, cycles, diamonds and traversal. Resolve
product declarations bottom-up using only role-scoped child declarations. A type may inspect its own model, but a
cross-recipe binder must not inspect foreign records or an undeclared graph catalogue.

A planned command can have partial guarantees and explicit evidence requirements; a provisional capability is not
an established instance. Judge the consumer's requirement before acquisition: `SUPPORTED` needs no observation,
`UNSUPPORTED` stops, and `NEEDS_EVIDENCE` names an authorized
acquisition that can decide it. Re-resolve after acquisition. Transport/authorization failure is `UNAVAILABLE`;
malformed or contradictory evidence is `INVALID`; permanently insufficient semantic provenance is `UNSUPPORTED`
with `INSUFFICIENT_PROVENANCE`. Exhausted acquisition cannot leave a requirement pending forever. Even an admissible
command can find no observations for the requested AOI/dates.

Commands are deterministic, immutable, JSON-safe derived state, never written back into recipe JSON. They carry no
EE objects, functions, credentials, translated labels or Redux state. Each executor validates its own named command;
a trusted execution boundary rebuilds or revalidates it from authorized inputs rather than trusting a browser plan.

Distinguish available selections from the exact ordered output of one configured request. Classification binding
may extend the available domain before selection; GUI groups only decorate it. Preserve order-significant input,
while deriving output order from the declaration. For an initial Optical proof, Landsat and Sentinel-2 catalogue
entries can share one adapter with internal dataset readers. Add a separate source-composition boundary only when a
real consumer must combine independently contracted adapters; that is distinct from temporal derivation.

### Hard cases and unresolved contracts

- **Collection schema.** Declare required versus optional member bands, homogeneity, time coordinate/representation,
  ordering and duplicate policy. Unknown evidence is not optional. Construction can establish guarantees without a
  full member scan; selection/filtering must establish compatibility on every retained member it promises to cover.
  Aggregation declares its own image schema. Planet Daily's common RGB/NIR versus PSB.SD-only bands is the required
  heterogeneous case; an explicit selection, filter or missing-band policy must establish homogeneity.
- **Operation requirements.** Counting, scalar charts, CCDC, annualized LandTrendr and Change Alerts require different
  guarantees. Start with structural constraints and explicit adapter restrictions: Sentinel-1-specific processing
  should name that dependency rather than claim a generic dual-polarization capability. Product schema and capability
  cardinality/provider lineage remain separate; a multi-instance requirement needs selection or cardinality rules.
- **Measurement meaning.** Encoding states representation, not scientific equivalence. Add measurement identities only
  when a consumer needs and can establish them. Change Alerts is relational: compare value semantics (formula, units,
  encoding and value-changing corrections) and relevant observation protocol (sensor, orbit, masking, filtering,
  resampling). Keep AOI/dates as execution scope. Structured evidence is authoritative; narrower fingerprints support
  comparison without replacing it. Principal/linked-account identity scopes access and caches, not measurement meaning.
- **Capabilities.** Admit one only for interpretation or behavior not expressed by product schema and explicit adapter
  restrictions. Only a producer or audited transformation grants it; modality, similar names and supported options
  do not. Normalization and correction alone must not be described as harmonization: that needs an explicit
  comparability guarantee. Existing assets without trustworthy provenance cannot recover formulas from band names.
- **Versioning.** Introduce versions only for contracts a real consumer compares or carries across a runtime/durable
  boundary. Internal refactoring needs none. Do not preserve confirmed algorithm defects as legacy profiles or invent
  creation-date/asset-specific branches. Existing affected data may require recreation when correctness matters.
- **Presentation migration.** Keep shared ordered schema separate from GUI labels, tooltips, ranges and groups.
  Presets/templates identify their product and required bands; local styles keep their owner. Existing helper exports
  can adapt migrated answers while callers move. This does not schedule the broader band-presentation review.

An added catalogue entry under an existing adapter should need no consumer change. A new adapter may reuse mechanics
but must establish its own guarantees; a new operation declares requirements rather than adding family switches.
Catalogue date availability remains a hint, separate from actual AOI/date/identity availability.

### Source-planning verification

Before adopting the boundary, establish:

- planning and EE execution use the same normalized command, with deterministic serialization and meaningful order;
- named references match the selected executable branch, and binders cannot read undeclared records;
- representative declarations match actual `getImage$()` output for default and explicit requests, including
  encoding, classification, derivation and heterogeneous members;
- a synthetic catalogue entry needs no recipe change, and same-name incompatible adapters are refused;
- an audited transformation can establish a requirement its source cannot natively satisfy;
- each adapter validates its command and declared runtime surfaces; an absent implementation fails only on a
  surface it claims to support;
- GUI presentation cannot change physical schema, and collection consumers need no Optical/Radar/Planet switch;
- trusted execution validates authorized inputs independently of browser plans.

## Transformation and capability projection

The target must cover these demonstrated derivation patterns without another recipe-type switch:

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

### Partial schema and evidence

Current providers establish output from configuration, running-image/catalogue observation or source descriptions.
All image-producing types have providers. The target additionally needs partial guarantees before exact schema:
for example, a configured mosaic can guarantee scalar output, Masking can preserve that guarantee, Stack can mix
inputs, and an arbitrary asset remains unknown until observed. This is not a second `SCALAR_ONLY` type flag.

A provider must explicitly name evidence needed to complete its declaration; each caller must not decide whether
an optional observation is complete. Contradictory observation is a controlled refusal. Precision, numeric range,
grid and semantic facts need their own consumer-backed contracts; they are not mandatory merely to know shape.

### Current execution-request limitation

Only a producer that translates or projects `outputBands`, or whose selection already names its outputs, returns
exactly the requested bands. Classification builds its bands in one fixed order and projects `outputBands` at the end of
`getImage$()`; a caller passing a selection without `outputBands` receives that fixed order. The export adapters supply `outputBands` alongside the selection for every recipe,
declared or not; the limitation is whether the producer honors it.

## Verification and open decisions

Current provider tests cover declarations, deterministic band order, physical shape, exact requested output and
scalar/array destination rules. Compare real `getImage$()` output for both default and explicit selections where
Earth Engine decides schema; a catalogue helper agreeing with another helper does not prove the pixels' schema.
Masks, projection, index encoding and heterogeneous collections need representative live checks.

The target requires pure tests of command normalization, named-reference discovery, role-scoped binding, explicit
unresolved evidence, capability/template reduction and trusted executor validation. Browser plans never authorize
a task by themselves. Do not add a universal matcher, rule language or legacy algorithm profile.

Open questions are partial-schema representation, stable band identity through transformations, minimum value and
observation-protocol evidence for relational consumers, shared catalogue ownership, generic category facts versus
domain capabilities, explicit AOI product projections, and the treatment of intentionally edited old source presets.
