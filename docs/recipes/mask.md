# Mask and Fill - developer notes and roadmap

Technical notes for evolving the existing Masking recipe into a general Mask and Fill recipe. The user-facing
guide belongs in the separate `sepal-doc` repository.

The internal recipe type is `MASKING`. Keeping that identifier is a compatibility constraint even if the visible
name changes.

## Product scope and constraints

The existing recipe can apply one image as a mask to another image. Adding unmasking is still in design. Before
that work starts, the recipe's pass-through behavior must be made explicit and reliable. A wrapper remains usable
wherever it preserves the capability a consumer actually requires; sharing a source's nominal recipe type is not
enough.

The pass-through contract is a release gate for unmasking, not a separate cleanup. Adding another recipe input for
a fill image must not create a local dependency, output-description or capability model.

The common architecture is defined in [Recipe data sources](data-sources.md), [Source resolution, dependencies and
execution](source-resolution.md), [Source freshness, caching and invalidation](source-freshness.md), and
[Visualization ownership and validity](visualizations.md). Masking consumes these contracts and must not ship a
local lineage resolver or another copied-source snapshot model. It also must not make constant Fill depend on CCDC
capabilities, caller-authorized recursive loading or execution bundles.

Constant Fill adds no dependency edge and can ship after Apply mask is stable. Asset Fill can follow through the
existing linked Earth Engine identity. Recipe Fill is blocked until the Node `recipe` module exposes a
caller-authorized closure or batch read; its per-recipe read is not that boundary, and ambient administrator
access is not a substitute for it.

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

A pass-through recipe must keep its execution identity separate from every capability provider.

### Execution identity

The selected outer recipe is the image operation that must run. If a Masking recipe wraps a Classification, any
downstream reference must retain the Masking recipe ID. Replacing it with the Classification recipe ID silently
bypasses the mask or fill.

### Capability providers

There is no single semantic type inherited from the terminal recipe. A resolved Masking output can preserve or
drop different capabilities independently, and each capability records the source or outer transformation that
provides it. Consumers read the requested capability contract rather than fields from a terminal recipe.

A resolver therefore retains the execution identity and capability-specific providers, for example:

```js
{
    executionReference: {type: 'RECIPE_REF', id: 'masking-recipe'},
    chain: [maskingRecipe, ccdcRecipe],
    capabilities: {
        CCDC_SEGMENTS: [{
            providerReference: {type: 'RECIPE_REF', id: 'ccdc-recipe'}
        }]
    }
}
```

### Capabilities

Source lineage and capability inheritance are different concepts. The mere presence of a source reference is not
proof that a recipe can satisfy every source-specific consumer.

Apply mask declares transformation guarantees: it preserves generic image output, ordered band schema and values
where pixels remain valid, while changing the mask and possibly the effective footprint. Capability contracts use
those guarantees to decide preservation. Fill masked pixels provides different guarantees and may preserve fewer
capabilities because a replacement can introduce values that need domain validation, such as a class absent from a
Classification legend. Other recipes with a source reference inherit nothing merely by having that edge.

Consumers should request a capability rather than testing the outer recipe type or accepting every recipe that
happens to have a source. At minimum this applies to Classification, CCDC, BAYTS and other source-specific recipe
inputs.

Those recipe types are examples, not an exhaustive capability list. The vocabulary must come from a repository-
wide audit of consumers. In particular, consuming a recipe's output image is different from consuming its
behavior. A caller may need an already-produced Classification image, a classifier that can classify another
image, reusable training data, a CCDC result image, source configuration, or some other contract. A decorator can
preserve one without preserving the others.

Compatibility must therefore be based on an explicit product requirement and any additional capabilities rather
than terminal type alone. The resolver combines each recipe's transformation guarantees with each capability's
invariants, using an explicit recipe- or capability-specific rule only where those generic contracts cannot decide
the result.

Recipe selectors query current recipe instances for the product and capabilities they require. They distinguish
supported, `UNSUPPORTED` and `NEEDS_EVIDENCE` candidates, and never use direct recipe type, a blanket `sourceRecipe`
check or a denormalized effective type. Change Alerts asks for `CCDC_SEGMENTS`; it does not know that Masking or any
future pass-through type exists. Nested wrappers can change their source or operation, so catalogue refresh must
re-evaluate capability support rather than persist the answer in recipe summaries.

### Output metadata

Three kinds of information have different owners:

- The actual outer image owns output bands, geometry and pixel values.
- Capability providers own the type-specific evidence required to interpret their contract, such as CCDC date
  format, dates, source definitions and algorithm options.
- The Mask and Fill model owns the operation and its inputs.

Output bands also carry export requirements. Apply mask preserves those requirements from the primary image because
it does not change band representation. The current Masking Retrieve path instead hard-codes a change-image policy:
CCDC array bands therefore receive `mean` rather than their required `sample` policy, and Earth Engine rejects the
export when array shapes differ. Fix this through the resolved output description, not a CCDC check in Masking or a
global `sample` fallback.

Band names and visualizations copied when an upstream recipe was selected can become stale if that recipe changes.
Opening or consuming the wrapper must refresh them or detect the mismatch; stale snapshots must not silently
override the actual output.

### Dependencies and lineage

Every source-lineage edge is a recipe dependency, but not every dependency defines lineage. Mask and Fill has
different edge roles:

- The **primary image** affects output and supplies the capabilities that the wrapper may preserve.
- The **mask image** affects output but never supplies inherited capabilities.
- A future **fill image** affects output but never supplies inherited capabilities.

The pass-through resolver follows only the primary-image edge for capability inheritance. Map invalidation,
existence validation and cycle detection inspect every edge. Inferring either behavior from an unstructured list
of recipe IDs would conflate two different contracts and force another redesign when the general dependency work
starts.

The shared dependency model exposes structured edges with at least a referenced recipe ID and role, and makes one
graph owner responsible for:

- validated transitive closure;
- missing-recipe diagnostics with the path from the open recipe;
- cycle detection across every edge role;
- map invalidation when any transitive dependency changes;
- application of the deletion and movement policy owned by [source-resolution.md](source-resolution.md);
- a stable dependency revision or fingerprint for preview requests.

The common source-resolution work owns the dependency graph. Mask and Fill declares its primary, mask and fill
edges to that graph rather than introducing a local resolver. The shared resolver must:

- reject direct self-reference;
- reject indirect cycles across every nested dependency role;
- report missing, deleted and incomplete sources as controlled validation errors;
- keep a visited set and provide the dependency chain in diagnostics;
- handle nested pass-through recipes without losing the outer execution reference.

Any feature that introduces additional live recipe reads remains blocked on the caller-authorized Node server
boundary.

## Consumer requirements

Three different requirements, which a wrapper can satisfy independently:

**The transformed output image.** Generic map, image-input and Retrieve consumers need executable pixels, ordered
bands and export requirements. They require the `IMAGE_OUTPUT` product, not a nominal recipe type. Apply mask
preserves this
contract.

**Source-specific metadata.** Change Alerts reads a CCDC recipe's `ccdcOptions.dateFormat`, `dates`, `sources`
and `options`, and derives band names from its data sets and corrections. BAYTS Alerts reads a
`BAYTS_HISTORICAL` recipe's `dates` and `options`. PyEO reads a Classification's `legend` and `inputImagery`,
then the input mosaic's `sources.dataSets`, `sceneSelectionOptions`, `compositeOptions`/`options` and date
range. These are the three consumers that attempt capability-provider resolution through separate synchronization
paths. They are acceptance cases for keeping the execution reference while reading a named capability from its
provider.

**Source-specific behavior or model reuse.** Classification's training-data recipe section reuses another
`CLASSIFICATION` recipe's training data, and Regression's reuses another `REGRESSION` recipe's reference data;
both filter on terminal type alone and neither accepts a wrapper today. CCDC Slice requires actual CCDC
segments and filters on `['CCDC', 'ASSET_MOSAIC']`, so a Masking recipe wrapping a CCDC recipe is not
selectable there even though its output would very likely be usable. These are the sites a capability vocabulary
has to describe.

Recipe-input filters use these requirements through capability discovery. They must not enumerate direct recipe
types or admit every recipe with a source edge.

### Earth Engine consumers

`lib/js/ee/src/imageFactory.js` dispatches on `recipe.type` alone and reaches every recipe through the common
`getImage$`/`getBands$`/`getGeometry$`/`getVisParams$` interface. Lineage on that side is implicit and
dynamic: `recipeRef.js` loads the referenced recipe and hands it back to the factory.

Source-specific arguments and capabilities follow only the roles declared by the recipe definition. Persisted and
programmatically submitted recipes can bypass GUI validation, so backend execution repeats structural and
capability checks without introducing another resolver.

## Compatibility acceptance cases

- Change Alerts can replace the selected wrapper ID with its terminal source ID in persisted `model.reference`,
  causing a Masking recipe around CCDC to execute the unmasked source. The migrated path must keep the execution
  reference and obtain CCDC semantics separately.
- Masking Retrieve hard-codes `changeBased('change')` pyramiding. A masked CCDC output has no `change` band, so its
  array bands fall back to `mean` and Earth Engine rejects differing array shapes. CCDC's native exporter correctly
  uses `sample`; the migrated output description must preserve that per-band requirement through Apply mask.
- Recipe and asset wrappers must keep the selected outer execution reference. Asset-backed capabilities require
  verified metadata evidence; a terminal asset ID or arbitrary property is not sufficient.
- Masking's `model.imageToMask.bands` and `visualizations` were a snapshot taken when the input panel loaded a
  dirty form, and opening the recipe did not refresh them. They are no longer authoritative: an open recipe
  observes its primary source and holds the result in runtime state, which every band and preset consumer reads
  in preference to the snapshot. It observes again whenever the selection, the loaded source record or the Earth
  Engine identity changes. A source that cannot be reached is recorded as unavailable and offers nothing, rather
  than authorizing the bands the recipe remembers. The snapshot remains in saved recipes, and remains what
  consumers fall back to only while nothing has been observed - which is still the case wherever a Masking layer
  is opened outside its own recipe. Removing it needs evidence available without an open recipe.
- Consumers requiring CCDC, Classification, BAYTS or another domain contract query the named capability and reject
  absent or ambiguous matches before reading source-specific state.

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

### Phase 1 - adopt generic runtime image output contracts

The generic architecture and implementation order are owned by `data-sources.md` and `source-resolution.md`.
Masking is an acceptance case, not the owner of this phase:

- observe Masking's actual ordered output bands while retaining its outer execution reference;
- preserve the primary output's per-band export requirements through Apply mask;
- prove a masked CCDC output exports with `sample` without Masking knowing what CCDC is;
- keep all output descriptions in runtime state and leave persisted Masking JSON unchanged.

Do not schedule a standalone Change Alerts date-format patch in this phase. Its later capability migration must
include typed backend validation for legacy, incomplete and directly submitted models, but that validation is a
safety boundary rather than capability discovery or Masking support.

### Phase 2 - stabilize Apply mask

- ~~Stop treating copied primary bands and visualizations as authoritative source state.~~ Done: a recipe
  declaring that it preserves an input's band mapping and values inherits that input's current bands and
  presets, observed while the recipe is open. Masking is the first consumer of that declaration.
- Add explicitly preserved date range and source-visualization ownership through the generic description.
- Capture current Earth Engine behavior, add explicit mask-band selection with legacy first-band compatibility, and
  validate missing primary and mask inputs without relying on map-layer traversal.
- Verify preview, band selection, geometry, retrieval and exported metadata against the same resolved output.

### Phase 3 - ship constant Fill

- Add the persisted operation discriminator with legacy Apply mask as its default.
- Add one finite constant replacement and target-band selection.
- Implement selected-band replacement without changing output order or untouched bands.
- Keep the primary footprint and metadata.
- Add backend validation for malformed saved models.

Constant Fill has no new source edge. It does not require caller-authorized recipe loading, execution bundles, a
source catalogue, provenance or CCDC capability derivation.

### Phase 4 - add direct asset Fill

- Add an Earth Engine asset replacement through the user's linked Earth Engine identity.
- Persist deterministic target-to-replacement mapping by band name.
- Verify same-CRS and cross-CRS replacement images, replacement masks and footprint retention.
- Do not introduce recipe loading through this path.

### Blocked milestone - add recipe Fill

Recipe Fill waits for the Node `recipe` module to expose a caller-authorized closure or batch read. Do not route
it through ambient administrator credentials in the meantime. Once that boundary exists:

- add a recipe replacement through the shared dependency graph;
- apply the same explicit name-based band mapping as asset Fill;
- reject missing, forbidden and cyclic fill dependencies with stable diagnostics;
- keep the selected outer fill recipe as its execution identity.

### Phase 5 - capability and compatibility acceptance

- Declare which capabilities Apply mask and each Fill mode preserve, decorate or drop.
- Obtain date range, bands, visualizations, legends and other semantics from resolved capabilities rather than
  copied methods or terminal-type assumptions.
- Migrate Change Alerts to `CCDC_SEGMENTS` by retaining the outer execution reference and obtaining CCDC semantics
  through the primary lineage; remove its terminal-reference replacement only when that path is complete.
- Replace direct type checks and broad "has a source" checks only as each affected consumer migrates.
- Exercise direct and nested Mask and Fill recipes in generic image inputs.
- Exercise masked and filled results in every consumer whose required capability is preserved, and verify controlled
  rejection wherever it is not.
- Confirm that downstream calculations execute the outer wrapper rather than a capability provider.
- Confirm source edits, deletion, missing bands and dependency cycles fail predictably.
- Verify differing masks and differing footprints.
- Retrieve to each supported destination and inspect bands, values, masks, metadata and footprint.

### Phase 6 - user-facing work

- Update the visible recipe name and concise panel text.
- Add a shortcut from an EE Asset or recipe only if creating the utility recipe remains unnecessarily cumbersome.
- Add the user guide and screenshots in `sepal-doc` after behavior is stable.

## Permanent verification

The shared source tests own graph resolution, cycle detection, capability matching and common legacy evidence.
Mask and Fill's pure tests own its edge declarations, capability preservation, legacy operation interpretation,
target-band reconciliation and mapping validation. Together they include direct and nested wrappers, incompatible
sources, incomplete inputs and cycles without duplicating the shared traversal matrix.

Lineage tests must prove that only the primary edge supplies capabilities. Dependency tests must separately prove
that primary, mask and fill edges all affect output validity and participate in cycle detection.

The capability inventory must include both GUI and Earth Engine consumers. Tests should distinguish callers that
need only the transformed image from callers that invoke source-specific operations or reuse source-specific model
state; proving one must not be treated as evidence for the other.

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
- Migration of unrelated recipe consumers merely because they also reference sources. The common graph and
  freshness contracts are shared foundations, but adoption remains incremental.
