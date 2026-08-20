# Mask and Fill - developer notes and roadmap

Technical notes for evolving the existing Masking recipe into a general Mask and Fill recipe. The user-facing
guide belongs in the separate `sepal-doc` repository.

The internal recipe type is `MASKING`. Keeping that identifier is a compatibility constraint even if the visible
name changes.

## Status

The existing recipe can apply one image as a mask to another image. Adding unmasking is still in design. Before
that work starts, the recipe's pass-through behavior must be made explicit and reliable: a masked Classification
must remain usable wherever a Classification is required, a masked CCDC result must remain usable wherever CCDC
is required, and so on.

This pass-through correction is a release gate for unmasking, not a separate cleanup. Adding another recipe input
for a fill image would otherwise expand dependency chains whose type resolution and cycle handling are already
unsafe.

## Current behavior

The recipe has two image inputs, each of which can be an Earth Engine asset or another SEPAL recipe:

- the primary image;
- the image used as its mask.

The Earth Engine operation is equivalent to:

```js
primary.updateMask(mask.select(0))
```

The first mask band is applied to every primary-image band. The output reports the primary image's bands and
geometry. The GUI does not currently make the selected mask band explicit when a multi-band mask source is used.

The recipe also declares its primary image as a source recipe. Several GUI consumers use that declaration as an
informal indication that the recipe can stand in for its source type. That convention is incomplete and is used
in incompatible ways across the application.

## Product direction

Evolve the existing recipe rather than adding unmasking independently to EE Asset, Band Math or Stack.

- **EE Asset** is asset-specific and already has a different Mask panel that creates masks from value constraints.
  It cannot own behavior that must also apply to arbitrary recipes.
- **Band Math** owns arithmetic expressions and reducers. Pixel validity and replacement masks are not ordinary
  arithmetic.
- **Stack** concatenates bands. Filling invalid pixels combines corresponding bands and does not append them.
- **Masking** already owns mask-changing operations, accepts assets and recipes, and participates in the normal
  preview and retrieval workflow.

An EE Asset or recipe context action may eventually create a preconfigured Mask and Fill recipe, but the operation
must still have one implementation and one persisted contract.

The proposed visible modes are:

1. **Apply mask** - retain the existing operation.
2. **Fill masked pixels** - use a constant, an EE asset or another recipe as the replacement.

An existing recipe with no saved operation mode continues to mean Apply mask.

## Earth Engine semantics

`Image.updateMask` updates valid pixels using a new mask while retaining the input metadata and footprint. A
single mask band applies to every input band; otherwise the mask must have the same number of bands as the input.
See [Image.updateMask](https://developers.google.com/earth-engine/apidocs/ee-image-updatemask).

`Image.unmask` replaces both value and mask where the input mask is zero. Its replacement can be a constant or an
image. The input metadata is retained. The input footprint is retained by default; disabling that behavior unions
it with the replacement image footprint. See
[Image.unmask](https://developers.google.com/earth-engine/apidocs/ee-image-unmask).

Mask and Fill should keep `sameFootprint: true`. A constant replacement is valid everywhere, so allowing footprint
union could unexpectedly turn a bounded input into a global image. There is no established use case that justifies
exposing that risk.

No explicit reprojection should be introduced merely to fill pixels. Cross-projection asset and recipe fills must
be verified against normal Earth Engine image-combination behavior before release.

## Pass-through contract

A pass-through recipe has two identities that must never be conflated.

### Execution identity

The selected outer recipe is the image operation that must run. If a Masking recipe wraps a Classification, any
downstream reference must retain the Masking recipe ID. Replacing it with the Classification recipe ID silently
bypasses the mask or fill.

### Semantic identity

The terminal source recipe supplies the semantic type and source-specific metadata. A Masking recipe wrapping a
Classification has Classification semantics; one wrapping CCDC has CCDC semantics. A consumer may read the
terminal recipe's legend, date range, source configuration or algorithm options, but that does not make the
terminal recipe the image to execute.

A resolver therefore needs to return both identities, for example:

```js
{
    recipe: maskingRecipe,
    semanticRecipe: classificationRecipe,
    semanticType: 'CLASSIFICATION',
    chain: [maskingRecipe, classificationRecipe]
}
```

### Capabilities

Source lineage and capability inheritance are different concepts. The mere presence of a source reference is not
proof that a recipe can satisfy every source-specific consumer.

Mask and Fill explicitly preserves the primary source's structural semantic capabilities because it preserves its
band schema and source-specific structure. A replacement can still introduce values that need domain validation,
such as a class absent from a Classification legend. Other recipes with a source reference must not inherit those
capabilities unless they make the same explicit guarantee.

Consumers should request a capability or effective semantic type rather than testing the outer recipe type or
accepting every recipe that happens to have a source. At minimum this applies to Classification, CCDC, BAYTS and
other source-specific recipe inputs.

Recipe-list summaries currently expose only the direct recipe type. The first implementation should list explicit
pass-through recipes as possible candidates, resolve the selected recipe's loaded chain, and reject an incompatible
semantic type before a consumer reads its model. It should not add a denormalized effective type to recipe summaries:
nested wrappers can change their source and make such a value stale. Loaded resolution can be cached for the GUI
session; more selective option filtering is a later usability improvement.

### Output metadata

Three kinds of information have different owners:

- The actual outer image owns output bands, geometry and pixel values.
- The semantic recipe owns type-specific configuration such as legends, dates, source definitions and algorithm
  options.
- The Mask and Fill model owns the operation and its inputs.

Band names and visualizations copied when an upstream recipe was selected can become stale if that recipe changes.
Opening or consuming the wrapper must refresh them or detect the mismatch; stale snapshots must not silently
override the actual output.

### Dependency safety

Both the primary source and an image replacement are recipe dependencies. Resolution and layer traversal must:

- reject direct self-reference;
- reject indirect cycles across nested pass-through recipes;
- report missing, deleted and incomplete sources as controlled validation errors;
- keep a visited set and provide the dependency chain in diagnostics;
- handle nested pass-through recipes without losing the outer execution reference.

## Multi-band fill contract

The output band set, names and order remain those of the primary image. A fill source contributes values but never
adds output bands.

Band correspondence must be explicit and keyed by name. Positional matching is not acceptable because reordering
an upstream image would change the result without changing the model.

### Target bands

Users select which primary-image bands to fill. Non-target bands pass through unchanged, including their masks.
For a single-band input, the only band can be selected automatically. The default behavior for a multi-band input
is still a product decision; it must be visible rather than inferred silently.

### Constant replacement

The common case is one numeric value for every selected target band, such as zero for Hansen `lossyear`. An
advanced per-band mode can store a value keyed by target band name.

Before release, verify how constants outside an integer band's range are represented. The recipe must not silently
clamp, wrap or otherwise change a requested nodata value.

### Image or recipe replacement

Each target band maps to one replacement band. The GUI may prepopulate equal names, but the saved model contains
the explicit mapping. One replacement band may be reused for several target bands only when that mapping is
visible and explicit.

If the replacement pixel is also masked, the output remains masked there. The recipe must not automatically
unmask the replacement image. Additional fallbacks can be expressed by chaining Mask and Fill recipes rather than
adding an ordered list of replacement sources in the first version.

### Existing mask mode

Apply mask retains its current single-band-to-all-bands behavior. Newly edited recipes should save the selected
mask band explicitly. A legacy recipe with no selection must continue to use the first stored mask band, matching
its current result.

## Validation boundaries

The GUI should prevent Apply or Retrieve when:

- the primary image is missing;
- the selected operation has no valid mask or replacement;
- a selected target or mask band no longer exists;
- a target-to-replacement mapping is incomplete;
- a constant is blank or not finite;
- a recipe dependency is missing, incompatible or cyclic.

Backend construction must validate the same structural assumptions. Persisted and programmatically submitted
recipes can bypass the form.

Using a fill value outside a Classification legend does not change the structural recipe type, but it can create
an unlabelled class. Whether the UI warns, requires a legend entry or permits it without intervention remains an
open product decision.

## Roadmap

### Phase 1 - pass-through foundation

- Introduce one cycle-safe resolver that returns the execution recipe, semantic recipe, semantic type and chain.
- Separate source lineage from explicit capability inheritance.
- Replace direct type checks and broad "has a source" checks in source-specific recipe inputs.
- Resolve compatibility from the loaded chain after selection; do not add derived semantic type to recipe summaries.
- Keep the outer recipe ID in downstream image references while reading metadata from the semantic recipe.
- Audit Classification, CCDC and Change Alerts, BAYTS, PyEO and every other consumer of source-specific recipes.
- Make date-range, band, visualization and legend delegation controlled and null-safe.
- Reject incompatible and cyclic chains without crashing.

### Phase 2 - stabilize Apply mask

- Capture the current operation in focused Earth Engine tests before changing it.
- Add explicit mask-band selection while preserving legacy first-band behavior.
- Verify preview, band selection, geometry, retrieval and exported metadata.
- Correct any stale upstream-band or visualization behavior found during the pass-through audit.

### Phase 3 - add Fill masked pixels

- Add the persisted operation discriminator with legacy Apply mask as its default.
- Add constant and image/recipe replacement models.
- Add target-band selection and deterministic target-to-replacement mapping.
- Implement selected-band replacement without changing output order or untouched bands.
- Keep the primary footprint and metadata.
- Add backend validation for malformed saved models.

### Phase 4 - compatibility acceptance

- Exercise direct and nested Mask and Fill recipes in generic image inputs.
- Exercise masked and filled Classification, CCDC and BAYTS results in their type-specific consumers.
- Confirm that downstream calculations execute the outer wrapper rather than its semantic source.
- Confirm source edits, deletion, missing bands and dependency cycles fail predictably.
- Verify same-CRS and cross-CRS replacement images, differing masks and differing footprints.
- Retrieve to each supported destination and inspect bands, values, masks, metadata and footprint.

### Phase 5 - user-facing work

- Update the visible recipe name and concise panel text.
- Add a shortcut from an EE Asset or recipe only if creating the utility recipe remains unnecessarily cumbersome.
- Add the user guide and screenshots in `sepal-doc` after behavior is stable.

## Permanent verification

Pure tests should own source-chain resolution, cycle detection, capability matching, legacy-model interpretation,
target-band reconciliation and mapping validation. They should include direct and nested wrappers, incompatible
terminal types, incomplete sources and cycles.

Earth Engine tests should own mask and fill semantics: single and multi-band images, independently masked bands,
constant and image fills, replacement masks, output band order, footprint retention and cross-projection inputs.

GUI component tests are justified only where they protect a decision that cannot be moved into a pure model. The
manual acceptance pass remains necessary for recipe filtering, panel transitions, preview, stale upstream inputs
and downstream type-specific workflows.

## Open decisions

- Visible name: **Mask and Fill**, **Masking**, or another short label.
- Whether multi-band inputs initially select all target bands or require explicit selection.
- Whether per-band constants ship in the first version or follow the common single-value case.
- How a new Classification fill value is represented in legends and visualizations.

## Deliberately not in the first version

- Independent unmask implementations in EE Asset, Band Math or Stack.
- Footprint union through `sameFootprint: false`.
- Ordered lists of fallback images.
- Positional multi-band matching.
- Automatic unmasking of the replacement image.
- Broad refactoring of unrelated recipe types merely because they also reference a source image.
