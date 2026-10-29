# Mask and Fill

The persisted recipe type remains `MASKING`. Apply mask is implemented; Fill modes below are target design.
This recipe consumes [output products](output-products.md), [source resolution](source-resolution.md),
[freshness](source-freshness.md) and [visualization ownership](visualizations.md), rather than owning another
lineage resolver or copied-source synchronization mechanism. The [roadmap](data-sources.md#mask-and-fill) tracks
remaining work; the user guide belongs in `sepal-doc`.

## Current design: Apply mask

The primary image and mask may each be an asset or recipe. Execution is equivalent to:

```js
primary.updateMask(mask.select(0))
```

The first mask band applies to all primary bands. Output bands/geometry follow the primary image. Mask selection
is not explicit for a multi-band mask. The shared primary/mask edges participate in dependency/readiness checks;
the primary role alone supplies inherited capabilities.

The outer Masking reference remains execution identity. Segment facts may come from its CCDC producer, but a
consumer must not substitute that producer ID and bypass the mask. Discovery and asset-content suitability are
separate. CCDC Slice and Change Alerts can follow declared segment-provider chains; wrapping a Classification does
not automatically make its classifier reusable.

Masking preserves primary band facts, including ordered names, array dimensions and export encoding/policy.
Retrieve derives destinations from selected band shape. Array bands export only to Earth Engine with `sample`;
Masking's `changeBased('change')` fallback applies only to verified scalars lacking a stronger policy. No CCDC type
check belongs in Masking. Display labels and presets remain presentation.

Current bands come from the shared output read, not saved input snapshots. Primary-source presets are observed by
the live evidence lifecycle; some displays outside the recipe still have an unobserved saved-preset fallback.
Retiring it requires shared presentation interest at that consumer, not another saved copy.

Missing/invalid required references hold affected layers and Retrieve through the shared rules. Opening an input
panel establishes an unedited baseline; late responses for a replaced selection do not overwrite it. Incomplete
wizard fields stay neutral until interaction without permitting an invalid forward submission.

## Target design

Evolve Masking into two visible modes: **Apply mask** and **Fill masked pixels**. No saved operation discriminator
continues to mean Apply mask. Do not duplicate Fill in Asset, Band Math or Stack: masking/replacement is this
recipe's responsibility. A future shortcut may create a preconfigured recipe without another implementation.

### Stabilize Apply mask

- Save an explicit selected mask band when the user edits it; old recipes continue to select their first band.
- Preserve resolved date range and source-style ownership through the common product contract.
- Verify values, independent band masks, geometry/footprint, preview and exported metadata on direct and wrapped
  sources. Keep capability facts separate from the actual outer pixels.

### Fill semantics

Use `Image.unmask` with `sameFootprint: true`. A constant is valid globally, so footprint union would unexpectedly
expand bounded inputs. Preserve primary metadata, output band set/order/names and untouched-band masks. No explicit
reprojection should be added merely to combine inputs; cross-projection behavior needs live verification.

Targets are named primary bands. A single-band source can preselect its only band; the multi-band default needs an
explicit product choice. No position-based matching is allowed.

**Constant Fill** adds a finite numeric replacement for selected bands, with no new dependency. Verify integer
range/casting so a nodata value cannot silently clamp or wrap. A shared constant can precede an optional per-band
mode; it needs no catalogue, bundle, domain capability or recursive loading feature.

**Asset Fill** adds an explicit target-to-replacement mapping through the linked Earth Engine identity. Equal names
may prefill the map, but persist the actual mapping. A replacement band may serve several targets only explicitly.
A masked replacement remains masked; do not automatically unmask it. Verify same/cross-CRS inputs and footprints.

**Recipe Fill** uses the same mapping and shared authorized graph/acquisition boundary. Define its declared needs
and execution checks before enabling it. Retain its selected outer replacement recipe, and reject malformed,
missing, inaccessible or cyclic references. A batch endpoint is a transport choice, never permission to use
administrator credentials or evidence that the graph is coherent.

### Capability preservation

Apply mask preserves values where valid while narrowing validity. Fill changes values and may lose a capability
or introduce a class absent from a legend. Express transformation guarantees once; capability-owned rules decide
preservation/reduction, using explicit mappings for subsets/renames. Do not enumerate every capability in Masking
or teach every consumer every wrapper type.

Primary, mask and fill references affect execution, but only the primary supplies inherited capabilities. The
shared graph owns cycles, closure and all-source invalidation. A source type or provenance ID does not prove the
product's capability. When the required contract is preserved, direct and nested wrappers should work; when it is
not, consumers must receive a controlled explanation before algorithm-specific property access.

Classifier output pixels, reusable classifiers and reusable training data remain distinct contracts. Their mask
semantics need a consumer-specific decision before broadening eligibility. Generic categorical metadata is not a
substitute for those capabilities.

### Validation and acceptance

Forms and backend construction must reject missing primary/mask/replacement, absent target/mask bands, incomplete
mappings, non-finite constants and broken dependencies under the same shared rules. Pending evidence is not proof
that a band is absent. Preserve invalid saved choices for repair.

Shared tests own graph/capability mechanisms; Masking tests own its edge roles, legacy discriminator, target
mapping and preservation. Live EE checks establish multi-band masks, replacement masks, integer values,
cross-projection combination, output order and primary-footprint retention. GUI checks cover draft isolation,
source replacement, stale responses and real preview/export recovery, without repeating the whole shared graph
matrix in this recipe.

## Open decisions and exclusions

Decide the visible recipe name, default multi-band targets, whether per-band constants are needed initially and
how a newly introduced class value is represented. User documentation/screenshots follow stable behavior.
Footprint union, ordered fallback lists, positional mapping and automatic unmasking of replacements are excluded.
No application-wide source migration is a prerequisite for constant Fill.
