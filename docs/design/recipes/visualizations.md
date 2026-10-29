# Visualization ownership and validity

Current style editing/selection behavior and the target contract for presets, transformation templates and
export projection. [Output products](output-products.md) owns band facts;
[source resolution](source-resolution.md) owns capabilities;
[the runtime](gui-source-runtime.md) and [freshness](source-freshness.md) own acquisition and currency.
Remaining adoption work belongs in [the roadmap](data-sources.md#capability-projection-and-visualization-ownership).

## Current design

### Styles and ownership

Recipe types supply presets, assets supply parsed visualization properties, and recipes/layers retain locally
created styles. The normal style vocabulary is continuous, categorical, RGB or HSV, with bands, ranges, palette,
values/labels, gamma and inversion as applicable. Normalization validates rendering structure; it does not prove
that the chosen bands or category semantics exist.

Physical bands come from the common output read. Labels/groups decorate those names. Presets never establish
physical shape, categories or capability authority. A style can be syntactically valid yet inapplicable to the
current product. Direct rendering requires every referenced band to be known scalar; arrays need an explicit
scalar-producing transformation, not an implicit array element. Mixed products can offer scalar-only styles.

User styles keep their stable local identity. Refresh or a selection change never deletes them. Cloning a preset
creates a local style rather than editing the producer's preset. Some input workflows still retain old source
snapshots; these are not proof of current output availability.

### Selection behavior

Recipe map layers reconcile once the output is established over sound dependencies. Candidate order is the
picker's: styles retained for that layer, styles the displayed recipe owns, then presets of the displayed mode.

- Keep a matching selection, using its current definition.
- Otherwise choose the first available candidate.
- If no candidate exists, keep the selection and draw nothing so a returning source can restore it.
- Pending, unavailable or invalid evidence never rewrites selection. Transient rechecking may keep an unchanged
  existing drawing, but it supplies no authority for new work.

Restyling can redraw without loading schema again. Every image question—the preview, histogram and distinct
values—uses the same effective product/parameters. Named map modes never become the canonical Retrieve product.
Standalone asset layers still need the same settled-answer selection reconciliation; that is a roadmap item,
not an implemented guarantee.

### Draft editing and Copy/Paste

Copy and Paste exist only inside the visualization panel, as small controls beside the type selector. Copy takes
the current raw draft, including unsaved/incomplete/invalid values and visible HEX text. It stays enabled when
Apply is held. One in-app clipboard is shared across recipes/map areas until another Copy or page reload; it is
neither persisted nor the system clipboard. Cancel/Close leaves it intact.

Paste replaces only the panel draft. It preserves Add/Edit/Clone mode and destination identity: a new style gets
its own ID when applied, an edited style keeps its ID and destination `dataType`. Source/layer/recipe identity,
ownership, histograms and errors are not copied. A date style pasted into a destination without date `dataType`
therefore displays ordinary numeric values.

RGB/HSV preserve channels in order; continuous preserves band/ranges/palette/inversion and HEX text; categorical
preserves each value/label/color row together in its draft order. Normalization happens only on accepted Apply.
Paste never saves, selects or changes the map by itself. Existing same-band replacement confirmation remains.

A blank/unavailable band stays visible with a repairable error and holds Apply, Enter and final confirmation save.
Do not request histograms/distinct values for unavailable choices. Paste rejects pending answers belonging to the
replaced draft and does not stretch copied ranges; an explicit replacement-band choice keeps its ordinary stretch
behavior. Cancel preserves the destination's prior style and the clipboard.

Invalid HEX tokens are explained and block continuous Apply; closing HEX view cannot silently drop them. Shared
legend rows preserve typed values until save, accept finite numbers including fractions/exponents, reject blanks
and non-finite values, and compare duplicates numerically. Saving converts and sorts values numerically.
The shared CSV value-column detector uses the same whole-value parsing rule; RGB channels retain their own integer
requirements. Category labels are not checked against a destination's actual pixel values merely by pasting them.

A panel stays tied to its destination layer/product. Context changes that invalidate that ownership close it
without saving; navigating between recipe tabs preserves each recipe-owned panel and draft. See
[recipe scope](gui-source-runtime.md#recipe-scoped-panels-and-navigation).

### Map and Retrieve

Map layers filter direct styles against the resolved output. Retrieve attaches styles whose physical band names
are in its export selection. CCDC's dedicated export carries its transformation templates and filters through
its own derivation rule; logical base bands are not stored segment-band names.

Asset `visualization_*` properties are presentation data. Shape comes from observed bands and types. Scalar policy,
encoding and units are separate; matching a style by name proves none of them. Current legacy formats remain
readable. General capability/template projection through arbitrary selected subsets is target work below.

## Target design

### Product presets and transformation templates

Separate a presentation definition from its owner and active binding. A direct preset names one concrete product's
band namespace; a transformation template names possible output of one closed transformation. Stable,
namespace-qualified preset/template IDs persist through presentation edits; user styles retain local IDs.

For example, a CCDC harmonics template uses logical `ndvi` plus phase/amplitude/RMSE measures. It is not a direct
visualization of array-valued Segments. The proposed `CCDC_SEGMENT_SLICE` contract owns accepted source capability,
template-body validation, source-evidence requirements derived from Slice parameters and materialization into
concrete scalar names. Runtime provider paths belong in the resolved binding, never durable template definitions.

An illustrative target binding is:

```js
{
    status: 'ACTIVE',
    requestedId,
    activeBinding: {product: {id, parameters, fingerprint}, candidateId, visualization},
    selectableOptions,
    invalidUserDefinitions,
    diagnostics
}
```

This unified controller/envelope is target design, not the current public API. Definition validity, direct-render
applicability and runtime availability remain separate. Invalid user styles should be exposed for repair/deletion;
unsupported source presets are excluded without deleting local intent. No style can activate its own capability.

### Transformation and export projection

A preserving transformation forwards presentation only when explicit mapping preserves every referenced band's
meaning/values. Identity Masking can preserve styles at remaining valid pixels. Stack uses actual name mappings.
Band Math cannot inherit ranges/categories for arbitrary expressions. Fill may introduce an unlabelled category.

Generic infrastructure validates mapping uniqueness; the capability owner decides preservation/reduction/drop.
A subset or rename needs its actual ordered mapping, not just a `SUBSET` label. Export selection is another such
transformation: project schema and capabilities first, then validate direct presets and transformation templates.
Omitting required timing/measure evidence must drop affected CCDC capabilities/templates.

A template's logical references are resolved by its transformation, not compared directly with the source's
physical array bands. Apply the same ownership rules through wrappers rather than CCDC-specific cases in Masking.
Source presets come from current resolved facts; when coherent bundles exist, export presets come from the
accepted bundle rather than browser snapshots.

### Asset metadata and legacy styles

Existing structurally compatible CCDC assets must remain usable without recreation just to adopt new presentation
metadata. Their recognized `visualization_*`/`baseBands` format configures Slice templates after the owning segment
contract validates the asset. Mutable properties alone cannot establish semantic compatibility.

A new structured envelope needs deterministic bounded serialization, explicit supported versions and stable IDs.
An unsupported declared version fails rather than silently acquiring authority through a legacy parser. Stronger
provenance belongs to the trusted boundary described in
[source resolution](source-resolution.md#earth-engine-assets-and-provenance), not a property prefix.

Before retiring saved source copies, distinguish deliberate local edits from source-derived entries using real
legacy shapes. Preserve edits as locally owned styles and expose current presets separately. Write ownership
normalization deliberately on edited/saved paths, not as an incidental source-refresh mutation.

### Adoption and verification

Introduce shared binding/template ownership for a demonstrated consumer, then explicit transformation mappings and
selection projection. Keep working legacy assets while replacing copied snapshots and duplicated filtering only
after each consumer is accepted. A general registry or provenance scheme is not a prerequisite for draft Copy/Paste.

Tests cover definition validation, scalar applicability, local-style preservation, duplicate identities, template
materialization and selected-band export projection. Browser checks establish the actual draft, keyboard, nested
panel, range and palette interaction. Live metadata/pixel checks establish structure/encoding beyond fixtures.
Measure unexpected style invalidation, fallback use and export exclusion during adoption without IDs as metric
labels; add thresholds from an observed baseline.

## Open decisions

- How to identify intentional edits within old copied source styles and stabilize imported legacy IDs.
- Whether referenced recipes expose all local styles as source choices by default.
- Which category semantics belong in generic band facts versus a domain capability.
- The presentation-envelope version, size limits and oversized-metadata failure policy.
- Physical-unit range/legend presentation and inherited display labels, which remain separate deferred reviews.
