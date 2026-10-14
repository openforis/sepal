# Regression

Predicts a continuous value at every pixel of its input images - biomass, canopy height, a measured index - from a
classifier trained in regression mode on points of known value.

## Inputs

`inputImagery.images` lists the input images, each a selected recipe or asset with the band sets chosen from it, in
the editor Classification shares. `auxiliaryImagery` adds fixed covariates (latitude, terrain, surface water) that
are not references. `classifier` configures the classifier: random forest, gradient tree boost or CART.

## Training data

`trainingData.dataSets` holds the data sets, each of one type:

| Type | Points | Read when it runs |
| --- | --- | --- |
| `EE_TABLE` | the table's rows, read into `referenceData` (`x`, `y`, `value`) when the data set is applied | no |
| `SAMPLE_IMAGE` | samples of an image or recipe, taken in the editor and stored in `referenceData` | no |
| `RECIPE` | none stored: execution reads another Regression's training data (`getTrainingData$`) | yes |

A table or sampled image is not read again when the recipe runs: what `referenceData` stores is what is trained on, and
a data set storing none contributes none. A `RECIPE` data set's points are unknown until execution reads them.

## Configuration checks

Execution (`lib/js/ee/src/regression/regression.js`) trains the configured classifier on every data set's points, so a
Regression whose data sets store no point, and read none from another recipe, cannot run. That is a shared configuration
requirement (`NO_TRAINING_DATA`, `lib/js/shared/src/recipe/trainingData.js`), judged by the output read like every
readiness finding ([Execution readiness](../design/recipes/source-resolution.md#execution-readiness)):

- the TRN button is marked "Add training data" - while the recipe is being set up, once its wizard reaches Training
  data;
- the layer is not drawn, here or on another map, and Retrieve is held and refused at submission;
- a recipe whose image builds the Regression - a Remapping or Masking of its predictions - is held the same way, naming
  the Regression, though its own description reads nothing of it;
- the asset export refuses it: `Recipe X cannot run: NO_TRAINING_DATA`.

Applying a data set that stores points, or reads them from another recipe, clears all of these. Input imagery is
judged the same way: a Regression listing no input image cannot run, and its IMG button says "Please add at least one
image." once its wizard has moved on from it, or at once for a Regression already set up. The Regression stays
described meanwhile: its single band is known from its declaration.

The data set editor keeps its own draft rules - a name, a table and value column or an image to sample, and reference
data - and holds Apply until they are met. A data set being edited changes nothing applied until it is applied, and
Cancel leaves the recipe as saved. The data set list holds Apply while it lists none.

Not checked: whether training succeeds - how many points there are, whether their values vary, whether they survive the
inputs' masks or lie within the imagery's footprint - and what a `RECIPE` data set reads.

## Output

Declared in `lib/js/shared/src/recipe/type/regression.js`: one scalar band, `regression`, averaged into coarser pyramid
levels. No encoding is declared: the prediction measures whatever the training values measure. It is described once
the input images are, and refused where a band set selects what an input does not provide (`bandSets.js`).

## Open issues

- **A supplied decision tree is offered but not built.** The classifier panel offers `DECISION_TREE`, which execution's
  `createClassifier` does not handle, so such a Regression fails in Earth Engine. It still needs training data like any
  other.
- **What a `RECIPE` data set reads is not judged.** It counts as training data whatever the recipe it names holds, until
  a `TRAINING_DATA` operation judges training sources
  ([Execution readiness](../design/recipes/source-resolution.md#execution-readiness)).

## Verification

- `lib/js/shared/test/recipe/output/type/regression.test.js` - absent and known-empty training data refused for every
  classifier, stored points and a `RECIPE` data set accepted, and a Remapping of the predictions held and restored.
- `modules/gui/src/app/home/body/process/recipe/regression/trainingDataReadiness.test.jsx` - the TRN button, layer and
  Retrieve agreeing for the Regression and a Remapping of it; an empty plots table reloaded in its editor, cancelled and
  applied.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js` - the asset export refused for the Regression and a
  Remapping of it, and exported once a data set stores points.
