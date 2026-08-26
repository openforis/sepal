# Mask and Fill - developer notes and roadmap

Technical notes for evolving the existing Masking recipe into a general Mask and Fill recipe. The user-facing
guide belongs in the separate `sepal-doc` repository.

The internal recipe type is `MASKING`. Keeping that identifier is a compatibility constraint even if the visible
name changes.

## Status

The existing recipe can apply one image as a mask to another image. Adding unmasking is still in design. Before
that work starts, the recipe's pass-through behavior must be made explicit and reliable. A wrapper remains usable
wherever it preserves the capability a consumer actually requires; sharing a source's nominal recipe type is not
enough.

This pass-through correction is a release gate for unmasking, not a separate cleanup. Adding another recipe input
for a fill image would otherwise expand dependency chains whose type resolution and cycle handling are already
unsafe.

The common architecture is defined in [Recipe data sources](data-sources.md), [Source resolution, dependencies and
execution](source-resolution.md), [Source freshness, caching and invalidation](source-freshness.md), and
[Visualization ownership and validity](visualizations.md). Masking is the first production consumer of the shared
dependency graph. It must not ship a local lineage resolver or another copied-source snapshot model, but it also
must not wait for CCDC capabilities, caller-authorized recursive loading or execution bundles before its existing
behavior is made safe.

Constant Fill adds no dependency edge and can ship after Apply mask is stable. Asset Fill can follow through the
existing linked Earth Engine identity. Recipe Fill is blocked until the Node replacement for `sepal-server`
provides caller-authorized recipe reads; no temporary Groovy endpoint should be built for it.

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
    terminalType: 'CLASSIFICATION',
    chain: [maskingRecipe, classificationRecipe]
}
```

### Capabilities

Source lineage and capability inheritance are different concepts. The mere presence of a source reference is not
proof that a recipe can satisfy every source-specific consumer.

Apply mask preserves generic image output and band schema. Whether it preserves a source-specific capability must
be declared from that capability's actual contract. Fill masked pixels may preserve fewer capabilities because a
replacement can introduce values that need domain validation, such as a class absent from a Classification legend.
Other recipes with a source reference must not inherit capabilities unless they make the same explicit guarantee.

Consumers should request a capability rather than testing the outer recipe type or accepting every recipe that
happens to have a source. At minimum this applies to Classification, CCDC, BAYTS and other source-specific recipe
inputs.

Those recipe types are examples, not an exhaustive capability list. The vocabulary must come from a repository-
wide audit of consumers. In particular, consuming a recipe's output image is different from consuming its
behavior. A caller may need an already-produced Classification image, a classifier that can classify another
image, reusable training data, a CCDC result image, source configuration, or some other contract. A decorator can
preserve one without preserving the others.

Compatibility must therefore be based on explicit capabilities rather than terminal type alone. Each decorator
states whether it preserves, decorates or drops every source capability it encounters. Apply mask clearly preserves
generic image output and band schema, but algorithmic capabilities must be decided from their actual contract. Fill
masked pixels may preserve fewer domain-specific capabilities when replacement values can violate their
invariants.

Recipe-list summaries currently expose only the direct recipe type. During migration, a consumer can list explicit
decorators as candidates, resolve the selection through the shared source contract, and reject an incompatible
capability before reading source-specific state. Do not add a denormalized effective type to recipe summaries:
nested wrappers can change their source and make such a value stale. More selective option filtering is a later
usability improvement.

### Output metadata

Three kinds of information have different owners:

- The actual outer image owns output bands, geometry and pixel values.
- The semantic recipe owns type-specific configuration such as legends, dates, source definitions and algorithm
  options.
- The Mask and Fill model owns the operation and its inputs.

Band names and visualizations copied when an upstream recipe was selected can become stale if that recipe changes.
Opening or consuming the wrapper must refresh them or detect the mismatch; stale snapshots must not silently
override the actual output.

### Dependencies and lineage

Every source-lineage edge is a recipe dependency, but not every dependency defines lineage. Mask and Fill has
different edge roles:

- The **primary image** affects output and supplies the capabilities that the wrapper may preserve.
- The **mask image** affects output but never supplies the wrapper's semantic identity.
- A future **fill image** affects output but never supplies the wrapper's semantic identity.

The pass-through resolver must follow only the primary-image edge. Map invalidation, existence validation and cycle
detection must inspect every edge. Inferring either behavior from an unstructured list of recipe IDs would conflate
two different contracts and force another redesign when the general dependency work starts.

The shared dependency model exposes structured edges with at least a referenced recipe ID and role, and makes one
graph owner responsible for:

- validated transitive closure;
- missing-recipe diagnostics with the path from the open recipe;
- cycle detection across every edge role;
- map invalidation when any transitive dependency changes;
- application of the deletion and movement policy owned by [source-resolution.md](source-resolution.md);
- a stable dependency revision or fingerprint for preview requests.

The current recipe-type ID lists and ad hoc traversal do not provide that contract. In particular, image-layer
dependency traversal does not reliably retain each direct dependency while descending into its children, and it
has no cycle guard. Map reload behavior is therefore a known dependency-system gap, not evidence that pass-through
resolution works.

The common source-resolution work owns the dependency graph. Mask and Fill declares its primary, mask and fill
edges to that graph rather than introducing a local resolver. Before unmasking ships, the shared resolver must:

- reject direct self-reference;
- reject indirect cycles across every nested dependency role;
- report missing, deleted and incomplete sources as controlled validation errors;
- keep a visited set and provide the dependency chain in diagnostics;
- handle nested pass-through recipes without losing the outer execution reference.

The initial Masking activation may harden traversal and existing execution without adding a new backend recipe
loader. Any feature that introduces additional live recipe reads remains blocked on the caller-authorized Node
server boundary.

## Consumer inventory

Recorded during the Phase 1 pass-through audit against commit
`75cfcc8c1f69d7871607006ad3beef95a270ff3d`. Classification, CCDC, BAYTS and PyEO are witnesses, not the scope
boundary: the point of the inventory is the distinction between the three things a consumer can want. File names,
identifiers and call-site counts in this section are revision-specific and must be re-audited before migration.

### Primary-edge declarations

Only two recipe types declare a source edge, through `sourceRecipe` on the recipe descriptor:

| Type | Primary edge | Terminal |
|------|--------------|----------|
| `MASKING` | `model.imageToMask`, an `ASSET` or `RECIPE_REF` | another recipe or an asset |
| `ASSET_MOSAIC` | `model.assetDetails.assetId` | always an asset |

`ASSET_MOSAIC` is therefore a pass-through recipe in exactly the same sense, and every `type.sourceRecipe`
filter admits it. Its terminal is an asset, which carries no recipe semantics at all.

### What consumers actually require

Three different requirements, which a wrapper can satisfy independently:

**The transformed output image.** Everything selecting through `!type.noImageOutput` needs bands and pixels
and nothing else: map layers (`mapLayout/selectRecipe`), the shared input-imagery panels
(`panels/inputImagery`, `panels/inputImageryWithDerived`), Band Math, Class Change, Index Change, Masking's own
input image, the Mosaic AOI source, the Classification and Regression *sample* sections, and both Sampling
Design image inputs - twelve call sites. `noImageOutput` is declared by `CCDC`, `TIME_SERIES` and
`SAMPLING_DESIGN`, so the filter is a genuine output-image capability check rather than a type test. Apply mask
preserves this; a wrapper is legitimate everywhere here.

**Source-specific metadata.** Change Alerts reads a CCDC recipe's `ccdcOptions.dateFormat`, `dates`, `sources`
and `options`, and derives band names from its data sets and corrections. BAYTS Alerts reads a
`BAYTS_HISTORICAL` recipe's `dates` and `options`. PyEO reads a Classification's `legend` and `inputImagery`,
then the input mosaic's `sources.dataSets`, `sceneSelectionOptions`, `compositeOptions`/`options` and date
range. These are the three consumers that attempt semantic lineage through separate synchronization paths. They
are acceptance cases for keeping the execution reference while reading a named capability from its semantic
source.

**Source-specific behavior or model reuse.** Classification's training-data recipe section reuses another
`CLASSIFICATION` recipe's training data, and Regression's reuses another `REGRESSION` recipe's reference data;
both filter on terminal type alone and neither accepts a wrapper today. CCDC Slice requires actual CCDC
segments and filters on `['CCDC', 'ASSET_MOSAIC']`, so a Masking recipe wrapping a CCDC recipe is not
selectable there even though its output would very likely be usable. These are the sites a capability vocabulary
has to describe.

### Recipe-input filters

Thirteen `RecipeInput` filters exist. Twelve of them ask for generic image output; the remaining ones are the
type tests listed above, plus the two that combine a terminal type with a blanket source check:
`type.id === 'CCDC' || type.sourceRecipe` in Change Alerts and `type.id === 'BAYTS_HISTORICAL' ||
type.sourceRecipe` in BAYTS Alerts. Those two admit any recipe with a source edge, including an
`ASSET_MOSAIC`, whose terminal has no CCDC or BAYTS semantics whatsoever. Selection is therefore permissive by
design and incompatibility surfaces only after loading or through an eventual crash. The shared resolver must turn
that into a controlled capability diagnosis.

### Earth Engine consumers

`lib/js/ee/src/imageFactory.js` dispatches on `recipe.type` alone and reaches every recipe through the common
`getImage$`/`getBands$`/`getGeometry$`/`getVisParams$` interface. Lineage on that side is implicit and
dynamic: `recipeRef.js` loads the referenced recipe and hands it back to the factory.

Two properties matter for pass-through. `masking.js` forwards its caller's `args` - the band selection a
consumer such as Change Alerts passes down - to the primary image only, and constructs the mask image without
them; the primary edge is already the one that carries source-specific requests. And there is no cycle guard
anywhere in that recursion, so a self-referencing or mutually referencing chain that reaches the backend
recurses until it fails. The GUI resolver does not protect it: persisted and programmatically submitted
recipes never pass through the form.

### Acceptance defects found

The exploratory audit exposed these current behaviors. They are acceptance cases for the common foundation, not
reasons to retain recipe-specific synchronization fixes:

- Change Alerts can replace the selected wrapper ID with its terminal source ID in persisted `model.reference`,
  causing a Masking recipe around CCDC to execute the unmasked source. The migrated path must keep the execution
  reference and obtain CCDC semantics separately.
- `MASKING` has no reliable date-range contract, so Retrieve can throw before submission. Returning `undefined`
  would merely hide the crash and lose preserved source semantics. Date range must come from the resolved output or
  an explicitly preserved capability when one exists.
- `ASSET_MOSAIC` can expose an incomplete primary asset reference while its form is unfinished. Resolution must
  report `INCOMPLETE_SOURCE`; it must not create `{type: 'ASSET', id: undefined}` or throw while reading the model.
- PyEO can read recipe-model fields from an asset terminal and crash. The migrated consumer must request the
  required classification capability and report that an asset is non-derivable when it cannot provide it.

- Change Alerts and BAYTS Alerts still degrade a wrapper whose terminal is an *asset* to a plain `ASSET`
  reference, dropping the wrapper from the persisted model exactly as before. Keeping it as a `RECIPE_REF`
  needs a decision about where a wrapped asset's band list and date format come from - the reference panel
  only collects a date format for the `ASSET` section - so it belongs with the capability work rather than
  here.
- Masking's `model.imageToMask.bands` and `visualizations` are a snapshot taken when the input panel loads a
  dirty form. Opening the recipe does not refresh them, so they go stale when the source recipe's bands
  change. This is the "stale snapshots must not silently override the actual output" problem in the Output
  metadata section.
- `recipeImageLayer.jsx` builds its dependent-recipe list with
  `getDependentRecipeIds(recipe).map(load).map(getDependentRecipes).flat()`, which returns each dependency's
  *children* and drops the dependency itself, so only the deepest generation is watched for map invalidation.
  It also has no visited set, so a dependency cycle recurses without bound. Both belong to the dependency
  graph work.

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

### Phase 1 - establish dependency safety through Masking

- Declare Mask and Fill's primary, mask and fill dependency roles through that shared contract.
- Make semantic lineage follow only the primary edge while every edge participates in cycle and output validity.
- Keep the outer recipe ID in every downstream execution reference.
- Add pure cycle-safe traversal, including direct dependencies, diagnostics and a visited set.
- Correct direct and transitive map invalidation and add cycle protection to existing backend execution.
- Reject incomplete, incompatible, missing and cyclic chains without crashing.
- Keep CCDC, CCDC Slice and AOI-bearing definitions as inactive contract witnesses rather than runtime migrations.

### Phase 2 - stabilize Apply mask

- Capture the current operation in focused Earth Engine tests before changing it.
- Add explicit mask-band selection while preserving legacy first-band behavior.
- Validate missing and cyclic primary/mask references without relying on map-layer traversal.
- Verify preview, band selection, geometry, retrieval and exported metadata.
- Correct any stale upstream-band or visualization behavior found during the pass-through audit.
- Correct Retrieve capability handling without replacing the outer execution reference.

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

Recipe Fill waits for the Node replacement for `sepal-server` to expose caller-authorized recipe reads. Do not add
an interim Groovy implementation and do not route it through ambient administrator credentials. Once that boundary
exists:

- add a recipe replacement through the shared dependency graph;
- apply the same explicit name-based band mapping as asset Fill;
- reject missing, forbidden and cyclic fill dependencies with stable diagnostics;
- keep the selected outer fill recipe as its execution identity.

### Phase 5 - capability and compatibility acceptance

- Declare which capabilities Apply mask and each Fill mode preserve, decorate or drop.
- Obtain date range, bands, visualizations, legends and other semantics from resolved capabilities rather than
  copied methods or terminal-type assumptions.
- Replace direct type checks and broad "has a source" checks only as each affected consumer migrates.
- Exercise direct and nested Mask and Fill recipes in generic image inputs.
- Exercise masked and filled results in every consumer whose required capability is preserved, and verify controlled
  rejection wherever it is not.
- Confirm that downstream calculations execute the outer wrapper rather than its semantic source.
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
