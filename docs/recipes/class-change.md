# Class Change

Compares two classified images, each a recipe or an asset, and labels every pixel with the transition between its
class in the first and its class in the second.

## Inputs

Each image is configured with its class band and a legend of its classes (`fromImage`, `toImage`). The legend
entries start from the categorical style of the selected band and may be edited, including their order. The source
band list saved at selection is a snapshot and is not evidence of what the source holds now.

The output read judges both images (`changeImageRequirements.js`, shared with Index Change, which also judges a
configured error band): a class band the source's current description no longer provides, a recipe whose own read
storage answers is gone or not the user's (404, 403), or an asset its evidence finds missing, marks that image's
toolbar button in one sentence, disables Retrieve and refuses it at submission (`CONFIGURATION_UNMET`, naming the
image), and withdraws previews, here and on other maps. A failed read names the recipe it was about, so only the image
selecting that recipe is marked; the other image's source, still being read or failing for another reason, refuses
nothing of its own - though the output stays blocked. The first failed read ends the others (`recipeClosureLoader.js`),
so where the other image's recipe fails first for another reason, a recipe gone beside it is not known, and neither
image is marked until a later read finds it. A missing recipe further up stays with the recipe that selects it. An
asset found missing beside a recipe found gone marks both images. Repair restores them.

The panel editing an image keeps what was saved through any read of its source - band, legend and band snapshot,
whether the read is pending, fails or answers without the band. A band no longer provided stays selected, offered
beside the bands the source provides and refused beside its field; a recipe gone stays selected as an unavailable
recipe, refused beside its field, as is an asset found missing; another failure to load a recipe says so there. Only a source the user selects is
taken up: its bands become the snapshot, and a band is chosen only where none is. The panel judges its values by the
same rules before they are applied (`outputCandidate.js`); the applied recipe's marks and gates follow what was
applied, and Cancel writes nothing.

## Output

Class Change always declares two scalar bands (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)):

- `transition`, exported with `mode` pyramiding;
- `confidence`, exported with `mean` pyramiding.

Confidence is measured from both images' `probability_<class>` bands. Where either image has none, `confidence` is
masked and the minimum-confidence option has no effect; `transition` is computed from the classes either way, and
input masks carry through to both bands.

### Transition codes

From-legend entry `i` to to-legend entry `j` has code `i × (to-legend entries) + j + 1`, in each legend's own entry
order. `classTransitions` (`lib/js/shared/src/recipe/type/classChange.js`) defines this; the GUI labels its legend
with it and execution computes the same codes. Class values are not sorted, so a deliberately ordered legend keeps its
order.

**Compatibility.** Execution previously sorted each legend's values as text, which differs from entry order whenever
the values' text order does (`[2, 10]` sorts as `[10, 2]`). Images computed and assets exported before the
correction carry those codes, and the labels attached to them may name other transitions. Stored results are not
rewritten; recompute or re-export to get codes that match their labels.

## Verification

- `lib/js/shared/test/recipe/output/type/changeSelectedBands.test.js` - Class Change and Index Change refused at a
  band, or error band, the source lacks, described once both images are, and from a recipe image's configuration.
- `modules/gui/src/app/home/body/process/recipe/changeImageRequirements.test.jsx` - both recipes' marks, Retrieve and
  preview gates for a band gone, repair, Cancel, pending and failed reads, the saved band kept in the editor; Index
  Change's error band; a recipe gone or failing to load; one image's recipe gone beside the other's still being read
  or failing otherwise, before or after it; an asset found missing, alone and beside a recipe gone, whichever is
  found last; and a missing recipe attributed to the edge that names it.
- `lib/js/shared/test/recipe/source/recipeClosureLoader.test.js` - a failed read naming its record and ending the
  others at once.

- `modules/gee/test/jobs/ee/image/classChangeNumbering.node.test.mjs` - execution gives every transition the code
  `classTransitions` gives it, for ascending, text-ordered-differently, reordered and mixed legends.
- `modules/gee/test/jobs/ee/image/modelDerivedOutputBands.node.test.mjs` - both execution branches build the declared
  bands.
- `modules/gee/verify/classChangeConfidence.mjs` - on live Earth Engine: both bands' values and masks for every way
  the images can carry probabilities, and the pixel code of every transition between reordered legends.
