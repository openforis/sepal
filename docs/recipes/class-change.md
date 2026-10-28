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
taken up: its bands become the snapshot; the selected band stays where the new source provides it, and a band is chosen
only where none was. A band the new source lacks is cleared with its legend, quietly - no missing-band error and no
substitute - for the user to choose; no later source fills it until a band is chosen or the source kind starts over. A legend kept with its band still describes the previous source's classes; it is
not regenerated. Switching between Asset and Recipe clears the source and everything read of it quietly and focuses
the selector now shown. A field the draft leaves empty stays neutral until left or interacted with, and Apply stays
held meanwhile; a legend the draft empties says it lacks entries only once the legend says its own error
(`quietWhileEdited`, `recipeFormPanel.jsx`), while a legend saved without entries says so at once. The panel judges
its values by the same rules before they are applied (`outputCandidate.js`); the applied recipe's marks and gates
follow what was applied, and Cancel writes nothing.

Index Change's editor follows the same policy for its change band and optional error band: either is kept where the
new source provides it and otherwise cleared quietly. Its defaults are unchanged where no band was chosen: the FROM
image's band where the source provides it, else the first band, with `<band>_rmse` as the error band where provided. A
band cleared as one the new source lacks is not refilled by a default, not even the FROM image's band; the user chooses
it, and switching source kind starts over. An error band cleared that way is treated as one the user cleared: no
`<band>_rmse` fills it until a change band is chosen.

Execution codes transitions from both legends, so each image needs one with entries (`MISSING_LEGEND`,
`lib/js/shared/src/recipe/type/classChange.js`). An image without one marks its toolbar button ("This image has no
legend"), disables Retrieve and refuses it at submission and in asset exports, withdraws previews, and holds back every
recipe that builds this one's image; the description stays as it is. Its editor says so beside the legend, and the
legend's own required rule holds Apply. A read of the source never replaces a saved legend; choosing another band
starts its legend from that band's categorical style, as before. While the set-up wizard has the image open as its
step, neither its button nor an untouched legend says it yet. The legend's ten-entry limit is an editor rule only.

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
- `lib/js/shared/test/recipe/output/readiness.test.js` - a Class Change without either legend, or both, described and
  refused at each legend, and a Masking of it held until the legend is configured.
- `modules/gui/src/app/home/body/process/recipe/changeImageRequirements.test.jsx` - both recipes' marks, Retrieve and
  preview gates for a band gone, repair, Cancel, pending and failed reads, the saved band kept in the editor; Index
  Change's error band; a recipe gone or failing to load; one image's recipe gone beside the other's still being read
  or failing otherwise, before or after it; an asset found missing, alone and beside a recipe gone, whichever is
  found last; a missing recipe attributed to the edge that names it; a Class Change image without a legend:
  marked, gated, said beside its legend in the editor, repaired by applying a draft with classes, quiet when the
  set-up wizard arrives at it and beside a legend the draft leaves empty; and, for both recipes, a replaced source
  keeping a band it provides and clearing one it lacks quietly (Index Change's error band too), and a kind switch
  starting the new selector focused and neutral, the saved recipe unchanged until applied.
- `lib/js/shared/test/recipe/source/recipeClosureLoader.test.js` - a failed read naming its record and ending the
  others at once.

- `modules/gee/test/jobs/ee/image/classChangeNumbering.node.test.mjs` - execution gives every transition the code
  `classTransitions` gives it, for ascending, text-ordered-differently, reordered and mixed legends.
- `modules/gee/test/jobs/ee/image/modelDerivedOutputBands.node.test.mjs` - both execution branches build the declared
  bands.
- `modules/gee/verify/classChangeConfidence.mjs` - on live Earth Engine: both bands' values and masks for every way
  the images can carry probabilities, and the pixel code of every transition between reordered legends.
