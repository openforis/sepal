# Class Change

Compares two classified images, each a recipe or an asset, and labels every pixel with the transition between its
class in the first and its class in the second.

## Inputs

Each image is configured with its class band and a legend of its classes (`fromImage`, `toImage`). The legend
entries start from the categorical style of the selected band and may be edited, including their order. The source
band list saved at selection is a snapshot and is not evidence of what the source holds now.

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

- `modules/gee/test/jobs/ee/image/classChangeNumbering.node.test.mjs` - execution gives every transition the code
  `classTransitions` gives it, for ascending, text-ordered-differently, reordered and mixed legends.
- `modules/gee/test/jobs/ee/image/modelDerivedOutputBands.node.test.mjs` - both execution branches build the declared
  bands.
- `modules/gee/verify/classChangeConfidence.mjs` - on live Earth Engine: both bands' values and masks for every way
  the images can carry probabilities, and the pixel code of every transition between reordered legends.
