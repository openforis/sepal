# Visualization ownership and validity

Technical design for representing, refreshing, validating and exporting visualizations across recipe and Earth
Engine asset sources. Source resolution exposes the required output schema and ownership information; this
document owns presentation behavior.

## Current problem

Visualizations currently come from several incompatible paths:

- recipe types derive presets from their models;
- asset properties are parsed into continuous, RGB or categorical presets;
- user-defined visualizations are persisted under recipe layer state;
- some source-input models copy visualizations when selected;
- Stack and Band Math rewrite source visualization bands;
- map components and Retrieve filter visualizations differently.

Copied source presets become stale when source bands, properties, categories, labels or palettes change. Positional
band remapping can silently apply a style to the wrong output.

## Representation

A normalized visualization definition contains presentation intent only:

```js
{
    type: 'continuous', // continuous, categorical, rgb or hsv
    bands: ['ndvi'],
    min: [0],
    max: [1],
    palette: ['#000000', '#FFFFFF']
}
```

Established parameters such as values, labels, gamma and inversion remain supported. Normalization and
applicability are separate: a syntactically valid style can still refer to a missing band or carry categories that
no longer describe its values.

Identity, ownership and target product do not belong inside the visualization definition. They are carried by the
record that owns or binds it. This keeps asset serialization and rendering parameters from becoming another source
of product or capability facts.

### Product presets and transformation templates

A direct product preset is expressed in one named product's concrete band namespace. It remains a candidate until
that product instance and its parameters are resolved, the definition is valid, and direct-rendering applicability
is supported:

```js
{
    id: 'sepal.optical.true-color',
    product: {
        id: 'OPTICAL_MOSAIC',
        parameters: {/* configured product parameters */}
    },
    visualization: {/* normalized definition */}
}
```

A downstream transformation template is not yet a visualization. Its band references describe potential output of
one closed, named transformation rather than bands of the source product:

```js
{
    id: 'sepal.ccdc.ndvi-harmonics',
    transformation: {id: 'CCDC_SEGMENT_SLICE', version: 1},
    template: {
        type: 'hsv',
        bandReferences: [
            {logicalBand: 'ndvi', measure: 'phase_1'},
            {logicalBand: 'ndvi', measure: 'amplitude_1'},
            {logicalBand: 'ndvi', measure: 'rmse'}
        ],
        min: [-3.141592653589793, 0, 0],
        max: [3.141592653589793, 3000, 2500]
    }
}
```

The named transformation owns its accepted source capability, template-body validation, parameter-dependent source
evidence requirements, and materialization into concrete target-product bands. The template does not repeat those
requirements. After resolution, a separate binding identifies the particular capability instance and provider; the
declaration never embeds runtime provider paths.

This is a closed CCDC Slice contract, not a generic presentation-transformation language. Another transformation
defines its own template body only when a real consumer requires one.

Band existence, types and grids come from the resolved product schema defined by
[output-products.md](output-products.md). Generic `valueSemantics` and `categories` are provisional fields until
migrated consumers establish their minimal contract. Resolution and evidence ownership remain with
[source-resolution.md](source-resolution.md). A visualization is never evidence that a band or category exists.

## Ownership

### Source presets

Source presets belong to the current source description:

- asset presets are derived from current verified schema plus current metadata evidence;
- recipe presets are derived from the current bundled recipe graph and capabilities;
- a decorator exposes a source preset only when its operation preserves the values and bands that preset
  describes.

Source presets are runtime choices. They are not copied into the consuming recipe merely to keep them available.

### User-defined visualizations

A user-defined visualization belongs to the recipe or layer where the user created it. It survives source refresh
while still applicable. Cloning a source preset creates a new locally owned style with a new stable ID.

Removing or changing a source preset never deletes or rewrites a local clone.

Ownership is carried outside the visualization definition. Source presets and transformation templates use
deterministic, namespace-qualified IDs. A presentation edit can replace the definition without changing its stable
identity. User-defined visualizations retain their locally generated stable IDs.

## Validation and applicability

Malformed presentation and product incompatibility are separate failures:

```text
validateVisualizationDefinition(candidate)
    -> VALID | INVALID

validateRequirement({product, operationRequirement: directRendering(candidate)})
    -> SUPPORTED | UNSUPPORTED | NEEDS_EVIDENCE
```

A malformed RGB definition does not make its product unsupported. A structurally valid definition can still be
unsupported for one product or need physical or semantic evidence before a decision.

Every referenced band must exist in the current output schema. Direct renderers accept scalar-valued bands only.
This is a general physical-schema rule: a known array-valued band is never directly visualizable, regardless of
recipe type, band name or provenance. A visualization that selects an array position, date, coefficient, reduction
or other projection is an explicit array-to-scalar transformation; its derived scalar output is visualized, not the
array band itself.

Additional rules depend on visualization type:

- RGB and HSV require the expected number of usable bands;
- continuous ranges, palettes and gamma must be valid;
- categorical values, labels and palette entries must stay aligned;
- categorical styles require compatible band value semantics;
- domain-derived categories refresh when the capability supplying them changes.

Category labels are semantics, while palettes are presentation. A Classification capability may provide category
meaning; the visualization decides how those categories are rendered.

## Transformation recipes

A transformation can forward a visualization only when it can map every referenced input band to exactly one
output band and preserves the represented values.

- Apply Mask preserves values on retained pixels, so compatible source presets can pass through.
- Fill may invalidate categorical semantics when it introduces a value absent from the categories.
- Stack can rewrite names only through its explicit input-to-output mapping.
- Band Math generally cannot claim that an input range or categorical legend remains valid for an arbitrary
  expression.

An asset may carry templates intended for a downstream transformation rather than presets for its raw array-valued
image. A CCDC Slice template is retained as presentation evidence associated with a `CCDC_SEGMENTS` contract, but it
is not offered as a direct CCDC or Masking visualization. `CCDC_SEGMENT_SLICE` materializes the template only after
resolving the capability, Slice parameters and concrete scalar output. Applicability must not be implemented by
deleting asset metadata, implicitly rendering one array element or recognizing CCDC in Masking.

Transformations declare output effects rather than enumerating every capability they might preserve. Masking, for
example, can state that its band mapping is identity, values are preserved where pixels remain valid, and validity
is narrowed. A capability-owned transformation function decides whether those effects preserve, reduce or drop that
capability. A subset or rename supplies an explicit input-to-output band mapping; `SUBSET` without the actual names
is insufficient evidence.

A visualization referring to both scalar and array bands is not directly applicable. A mixed output may still
offer visualizations whose complete referenced-band set is scalar. Positively observed array dimensionality is
definitive; unknown dimensionality remains an evidence gap during migration and must not be relabelled as scalar.

No positional remapping is allowed. Reordering an upstream image must not change a saved style's meaning.

## Selection behavior

A requested visualization ID is saved presentation intent. It is distinct from the active visualization binding:

```js
{
    status: 'ACTIVE', // ACTIVE, UNSELECTED, INAPPLICABLE or NEEDS_EVIDENCE
    requestedId,
    activeBinding: {
        product: {id, parameters, fingerprint},
        candidateId,
        visualization
    },
    selectableOptions,
    invalidUserDefinitions,
    diagnostics
}
```

Preview consumes the complete active binding. Palette, Legend and Values consume its concrete visualization. A raw
saved definition or requested ID is never treated as an active product binding.

When a requested visualization cannot become active:

- retain the requested ID and any user-owned definition;
- explain the missing band or incompatible semantics;
- exclude an unsupported source preset from selectable options and expose an invalid user definition separately for
  repair or deletion;
- do not silently select the first available preset or mutate the saved definition;
- either stop rendering the layer or use an explicitly temporary fallback without persisting it.

The final fallback UX remains a product decision. Regardless of UX, Preview, map rendering and Retrieve must agree
on validity.

New and changed source presets update the available choices. A changed palette or label refreshes the map even when
pixels and band names are unchanged.

## Map and Retrieve

Map layers consume an active binding to the current resolved product instance, current source presets and locally
owned styles. They must not derive source validity from saved visualization snapshots or ambient layer parameters.

Retrieve treats selected-band projection as a product transformation. It first derives the resulting product and
preserved or reduced capabilities, then validates direct presets and transformation templates against that result.
Direct presets require selected concrete scalar bands. Transformation templates require the source evidence defined
by their named transformation; logical CCDC Slice references must not be tested as if they were physical Segments
band names. This work belongs at the shared output-description boundary, not behind recipe-specific opt-in flags.

Map selection does not decide which metadata is exported. Source presets are resolved from the submitted execution
bundle. User-defined styles come from the submitted outer recipe or layer state and are independently validated.

Drive and SEPAL outputs need the same selection semantics even when their metadata representation differs from an
Earth Engine asset.

## Provenance and trust

Asset visualization properties and structured presentation envelopes are presentation evidence, not physical
schema or capability authority. Parse them only after Earth Engine has verified the referenced bands. Versioned,
trusted SEPAL provenance can explain how a preset or template was produced, but mutable properties cannot make a
missing band exist or prove categorical or transformation semantics by themselves.

Unversioned `visualization_*` and `recipe_*` properties are a legacy presentation encoding. Their interpretation is
owned by the bound product or transformation, not by the property prefix: an ordinary image adapter may decode a
record as a direct preset, while the CCDC Segments asset adapter decodes its logical `baseBands` references as a
`CCDC_SEGMENT_SLICE` template. The properties do not by themselves establish either product schema or capability;
the owning adapter first validates the source contract and observed bands.

New structured metadata uses deterministic, bounded canonical serialization and namespace-qualified stable IDs. An
unsupported declared envelope version is invalid and does not silently fall back to legacy interpretation. Durable
metadata never stores a runtime provider path: after export the asset is the immediate provider, while original
lineage belongs in trusted execution provenance.

## Legacy migration

Existing recipes can contain copied source visualizations. During migration:

- identify whether an entry is source-derived or genuinely user-owned;
- expose the current source preset separately;
- preserve deliberate local edits as user-owned styles;
- do not silently rewrite a missing or incompatible selection;
- write normalized ownership only when the user edits or saves through the migrated path.

Each migrated consumer should record real legacy shapes before defining automatic reconciliation rules. Masking's
copied band and visualization snapshots are the first such evidence; CCDC Slice remains the broader preset and
capability witness.

Existing working CCDC Segments assets remain supported without rewriting or recreating them. The CCDC asset adapter
validates the observed segment schema and required CCDC metadata, then interprets compatible legacy
`visualization_*` records and their logical `baseBands` as Slice transformation templates. This is permanent format
compatibility for a narrowly defined asset contract, not a generic rule that mutable properties grant capabilities.

When Masking preserves the CCDC product structure, it also preserves the admitted `CCDC_SEGMENTS` capability and
its templates. CCDC Slice materializes those templates only against its resolved scalar output. A physical-band
subset that removes required segment evidence reduces or drops the capability and templates. Missing or malformed
metadata fails validation, but the absence of a newer provenance envelope does not make an otherwise valid existing
CCDC asset unsupported.

## Implementation order

1. Stabilize current Preview by withholding stale or unavailable bindings without rewriting requested selection.
2. Characterize scalar presets, current CCDC export metadata, CCDC Slice ingestion and Masking export behavior.
3. Add definition validation, direct applicability, deterministic candidate IDs and a pure binding controller.
4. Define `CCDC_SEGMENT_SLICE`, including its capability requirement, template validator, evidence derivation and
   materializer.
5. Add explicit identity and subset mappings, then prove capability and template projection after export selection.
6. Add the backward-compatible CCDC asset reader and bounded deterministic presentation encoding.
7. Prove direct and Masking-preserved existing CCDC assets through Preview, Slice and Retrieve; dual-write structured
   and legacy metadata if a new envelope is introduced.
8. Move CCDC Slice and Preview to resolved bindings without making new provenance metadata a prerequisite for
   existing structurally valid assets.
9. Add stronger trusted provenance only for consumers whose semantic or relational requirements need it.
10. Apply the same ownership rules to Fill, Stack, Band Math and remaining generic image layers incrementally.
11. Remove copied source snapshots and superseded recipe-specific filtering only after each consumer is accepted.

## Observability

Emit low-cardinality Prometheus metrics and access-controlled structured logs for:

- source presets discovered, normalized, accepted and rejected;
- user-defined styles invalidated by schema changes;
- temporary fallback use;
- map refreshes caused only by presentation changes;
- visualizations excluded from export and the stable reason code;
- legacy visualization shapes encountered during migration.

These signals primarily measure migration regressions and product behavior; they are not operational paging by
default. During each migration, unexpected increases in invalid saved styles, temporary fallback use or exported
style exclusion stop rollout until the affected legacy shape is understood. Thresholds are based on the accepted
pre-migration baseline rather than guessed globally.

## Verification

Pure tests own definition validation, ownership, direct applicability, categorical alignment, explicit band
mappings, template materialization, local clone behavior, active binding and export projection.

Focused integration tests prove a migrated map and Retrieve path consume the same validated style set. Earth Engine
verification checks representative asset metadata parsing against actual output bands.

Manual acceptance covers visible selection behavior, temporary fallback UX, source-preset refresh and preservation
of deliberate user styles.

## Open decisions

- Invalid-layer UX: unrendered layer versus a visibly stale temporary fallback.
- Whether referenced recipes expose all user-defined styles as live source choices by default.
- Exact namespace and derivation rules for stable IDs imported from mutable legacy metadata.
- How legacy copied visualizations are distinguished from deliberate local edits.
- Which generic categorical fields belong in band schema versus richer domain capabilities.
- Bounded asset-property encoding, size limits and failure behavior when presentation metadata exceeds them.
