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

A normalized visualization contains presentation intent only:

```js
{
    id: 'stable-id',
    type: 'continuous', // continuous, categorical, rgb or hsv
    bands: ['ndvi'],
    min: [0],
    max: [1],
    palette: ['#000000', '#FFFFFF'],
    origin: 'SOURCE_PRESET' // SOURCE_PRESET, DERIVED_PRESET or USER_DEFINED
}
```

Established parameters such as values, labels, gamma and inversion remain supported. Normalization and
applicability are separate: a syntactically valid style can still refer to a missing band or carry categories that
no longer describe its values.

Band existence, types and grids come from the resolved output schema. Generic `valueSemantics` and `categories`
are provisional fields owned by [source-resolution.md](source-resolution.md) until migrated consumers establish
their minimal contract. A visualization is never evidence that a band or category exists.

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

## Applicability

Every referenced band must exist in the current output schema. Additional rules depend on visualization type:

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

No positional remapping is allowed. Reordering an upstream image must not change a saved style's meaning.

## Selection behavior

A selected visualization is saved presentation intent. When it becomes invalid:

- keep the selection and its configuration visible;
- explain the missing band or incompatible semantics;
- do not silently select the first available preset or mutate the saved bands;
- either stop rendering the layer or use an explicitly temporary fallback without persisting it.

The final fallback UX remains a product decision. Regardless of UX, Preview, map rendering and Retrieve must agree
on validity.

New and changed source presets update the available choices. A changed palette or label refreshes the map even when
pixels and band names are unchanged.

## Map and Retrieve

Map layers consume the current resolved output description, current source presets and locally owned styles. They
must not derive source validity from saved visualization snapshots.

Retrieve exports only visualizations valid for the bands actually selected for export. This filter belongs at the
shared output-description boundary, not behind recipe-specific opt-in flags. Source presets are resolved from the
submitted execution bundle. User-defined styles come from the submitted outer recipe or layer state.

Drive and SEPAL outputs need the same selection semantics even when their metadata representation differs from an
Earth Engine asset.

## Provenance and trust

Asset visualization properties are presentation evidence, not physical schema. Parse them only after Earth Engine
has verified the referenced bands. Versioned SEPAL provenance can explain how a preset was produced, but mutable or
legacy properties cannot make a missing band exist or prove categorical meaning by themselves.

Unversioned `visualization_*` and `recipe_*` properties are legacy hints. They may provide an initial choice while
validation runs, but do not bypass output-schema or capability checks.

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

## Implementation order

1. Reserve `sourceVisualizations` and ownership in the common source description.
2. Stabilize Apply mask by preserving compatible source styles and preventing stale copied snapshots from becoming
   authoritative.
3. Define constant Fill invalidation rules, especially for categorical values, without waiting for a catalogue or
   execution bundle.
4. After caller-authorized loading and catalogue infrastructure exist, derive CCDC Slice presets from current
   source capabilities and Slice output bands, then migrate CCDC map selection and Retrieve filtering together.
5. Apply the same ownership rules to direct asset Fill and, after the Node server replacement, recipe Fill.
6. Migrate Stack, Band Math and generic image layers one family at a time.
7. Remove copied source snapshots and superseded recipe-specific filtering only after each consumer is accepted.

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

Pure tests own normalization, ownership, schema applicability, categorical alignment, name-based transformations,
local clone behavior and export filtering.

Focused integration tests prove a migrated map and Retrieve path consume the same validated style set. Earth Engine
verification checks representative asset metadata parsing against actual output bands.

Manual acceptance covers visible selection behavior, temporary fallback UX, source-preset refresh and preservation
of deliberate user styles.

## Open decisions

- Invalid-layer UX: unrendered layer versus visible temporary fallback.
- Whether referenced recipes expose all user-defined styles as live source choices by default.
- Stable IDs for source presets that are regenerated from mutable metadata.
- How legacy copied visualizations are distinguished from deliberate local edits.
- Which generic categorical fields belong in band schema versus richer domain capabilities.
