# Band Math

Evaluates calculations over its input images - expressions, and reducers across chosen bands - and outputs a
configured selection of input and calculated bands under names of the user's choosing.

## Inputs

`inputImagery.images` lists the input images, each a selected recipe or asset (`type`, `id`) with the bands Band Math
reads from it (`includedBands`) and a variable name. `calculations.calculations` holds expressions and reducers in
order; each names its bands (`includedBands`) and an optional cast (`dataType`, `auto` for none), and may read the
inputs and earlier calculations. `outputBands.outputImages` selects the output: per input or calculation, the bands
it contributes, each with a generated `defaultOutputName` and an optional `outputName`. A calculation no output band
is taken from is intermediate. The band lists, styles and legends copied from a source when it was selected are
editing aids and presets, never evidence of what the source holds.

Inputs are told apart by their `imageId`, never by their source. A source - its type and id - can be taken by one
input only: one another input uses is not offered, or refused where it is typed. A saved recipe whose inputs already
share a source keeps them, each edited and removed alone.

The input editor learns what a source holds by reading it, and nothing it learns is an edit: opening a saved input
leaves it unchanged, offering no Apply. A read of the source the input was saved with keeps every selected band as
saved, with its id. One that read finds absent stays selected, marked on its row and band selector, and refuses Apply
until it is replaced - keeping its id - or removed. Absence is judged from that read alone: never from the band list
saved with the input, nor while the read is pending or after it fails. Choosing another source reconciles the selection
once that source answers: bands it holds are kept, the others dropped, and its first band selected when none remains, as
a new input is given its source's first band. An answer about a source no longer selected changes nothing.

Output bands follow the bands they were copied from by id, an output band's identity being its id within its output
image. Deliberately unselecting an input band removes every output taken from it: the one copied under its id, and any a
saved recipe copied under an id no band of that image has, matched by the name of the band it was copied from, never by
the name it is output under. Output bands offers and adds only bands the input or calculation includes now, found by its
`imageId` - never the copy of its bands an output image was saved with, which can still list a band since removed - and,
by the same match, none its image already outputs; the ids that copy knows stay known, so a band replaced by a
same-named one is still offered. A choice is checked again when it is added, alone or by Add all, and added as its image
includes it then. Two outputs of one band a saved recipe holds are kept as saved. A FUNCTION calculation's band keeps
its id when the calculation is edited, so its output, and any name given to it, follows.

The forms generate unique default output names - two inputs' `red` become `red` and `red_1`. A custom name is optional;
when given it must start with a letter or underscore, continue with letters, digits and underscores, and be at most 30
characters long. No two final names may be alike. Output bands checks both rules over every configured output, a saved
configuration included, and Apply stays unavailable while any fails; each row shows the same rules as its own feedback.

## Configuration checks

Band Math judges its configuration as applied through the shared requirement reader (`bandMathRequirements.js`, pure
rules in `chainRequirements.js`), one read per calculation and per output image. Execution builds every calculation in
order, over the inputs and the calculations before it, so:

- An expression may read only those, by variable name and physical band name. It is analysed as its editor analyses
  it (`expressionAnalysis.js`): the same syntax, functions, argument counts and band-count rule. A function reads them
  by image id and physical band name, as execution selects them. A missing variable or band, a removed calculation, a
  later calculation and the calculation itself are each diagnosed.
- An output band must be a band of the image it is taken from, by physical name, and that image must exist.
- At least one image is output, each outputting at least one band, under names that are valid and that no other output
  band has - the rules Output bands applies to its own Apply (`outputImages.js`), so its fields, rows and toolbar
  button agree. An empty section is judged once, for the section; the rest per output image.
- A calculation reading an unmet calculation depends on it, and so does an output taken from one. It names what it
  depends on rather than repeating what is wrong there, and still reports its own problems. Its section is marked all
  the same, its button saying only which item depends on which: a section holding an item that cannot be used is not
  shown as sound.

Any unmet calculation holds back the image output, whether or not an output reads it: previews, here and on other
maps, are not requested or are withdrawn, and Retrieve is disabled and refused at submission (`CONFIGURATION_UNMET`,
naming Calculations), whatever its output reads as. Repair restores them. Calculations and Output bands mark their
toolbar buttons and the items concerned, with the reason as their tooltip. An output whose image no longer exists is
listed in Output bands as it was saved, marked, to be removed; it offers no bands to add. Deliberately unselecting an
input band, or removing an input or calculation, removes its outputs ([Inputs](#inputs)); an output image that leaves
without bands is kept, marked on its row and on Output bands, until it is given a band or removed. Saved `invalid`
flags from earlier versions are ignored.

These checks do not bind the panels: a panel's Apply is decided by its own validation, as before - an expression by
its editor's lint, over the inputs and the calculations before it.

After a change, the sync derives each expression's bands again, in order, from the calculations before it as just
derived, but only where everything it reads is met. One that is not keeps the bands it was derived with, and with them
the names its outputs were given. Renamed inputs, calculations and bands are still renamed in expressions, used bands,
outputs and visualizations.

Whether an input's bands exist in the asset or recipe it is taken from is judged by its output description
([Output](#output)), not by these checks. Not checked yet: anything here at the execution boundary - Task and Earth
Engine build what is submitted, and recipes reading Band Math as a source learn of an unmet configuration only when
Earth Engine refuses its image. Describing such a recipe still asks Earth Engine to observe it.

The editor marks an input found to lack a band it includes: its row in Input imagery, and the Input imagery toolbar
button, naming the bands, with the reason as their tooltip (`inputBandProblems.js`). The marks come from the output
read as it stands - the `MISSING_INPUT_BAND` diagnoses this recipe owns, never an upstream recipe's - located in the
configuration as it is now and shown on the input with that `imageId`. While the read is pending or unavailable,
nothing is marked, and a later read establishing it again marks it again. The marks change nothing: selections,
expressions, derived bands, output names and visualizations stay as configured, and previews and Retrieve are held by
the description as before. A band an input's source no longer has is not replaced or removed: upstream disappearance
keeps the selection, the outputs passed through from it, the expressions reading it and their output names, marked
until the source has the band again or the user repairs it. The editor watches its output for as long as it is open
(`withOutputProblems.jsx`), the loading shared with its map layer and Retrieve, so with its layer hidden it still
describes the output - observing its running image and its inputs - where nothing else would. The input editor marks
the band itself, from its own read of the source ([Inputs](#inputs)).

Not marked by this: an input's other description failures, an edit before it is applied - the panels keep their own
validation - and anything the execution boundary would recheck. Where the description refuses the configuration
itself - output names repeated, or nothing output - before reading any input, that refusal is what every consumer has,
at once. The editor alone also reads the inputs it names, once, loading any recipe it reads that the session does not
hold (`EXPLAIN`, `recipeOutput.js`), and marks the inputs that reading finds lacking a band. While that reading is
pending, or where it fails, only the refusal is marked; it never delays the refusal, and nothing it could not read is a
diagnosis. Where no input could be read, the reading is retried like any failed read and not kept once the editor
closes. A layer, Retrieve or Task export reads nothing to explain it.

## Output

Declared in `lib/js/shared/src/recipe/type/bandMath.js` (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)): the configured output
bands in configured order, each under its final name, `outputName` or else `defaultOutputName`.

Whether a band is an array is not configured. A cast sets only the element type and keeps an array an array; an
expression over an array band yields one; `max`, `min`, `first` and `last` keep arrays, `count` and
`countDistinctNonNull` return scalars, and the other reducers refuse arrays. So the running image is observed, for
its dimensionality alone, and must carry exactly the configured names in order. Until it has been observed nothing is
offered. A scalar is averaged at coarser pyramid levels, as Earth Engine's default always exported it, and an array
is sampled; a running image that does not report a band's dimensionality is refused as `INCOMPLETE_IMAGE_OUTPUT`. No
encoding is stated, even for a band passed through from an input.

| Configuration or evidence | Answer |
| --- | --- |
| no output bands | refused, `NO_OUTPUT_BANDS`, observing nothing |
| two final names alike | refused, `DUPLICATE_BAND_NAME`, observing nothing |
| running image not yet observed, or its observation failed | nothing offered: needs evidence, or unavailable |
| running image carrying other names, or another order | refused, `CONFLICTING_OBSERVATION` |
| running image not reporting a band's dimensionality | refused, `INCOMPLETE_IMAGE_OUTPUT` |
| an included band its input's description does not hold | refused, `MISSING_INPUT_BAND` where it is included, whether or not a calculation reads it and though the running image cannot be observed |
| an input that cannot be described | refused or unavailable as that input is, never `MISSING_INPUT_BAND` |
| an input not yet read, or whose read failed | nothing offered: needs evidence, or unavailable |

Execution selects every band an input includes, so Earth Engine fails to build an image including one its input lacks,
and observing that image fails with it. So the inputs are described too, both readings asked for before either is
tested, and a band an input's current description does not hold is refused where it is included, its recipe and field
path kept through nested recipes - never judged against the band list copied when the input was selected. Each input is
held to its whole description, as Stack and Masking hold theirs: Band Math is not described while an input is not, even
where Earth Engine would build what it selects. That refuses what used to export:

- an input reporting no dimensionality for any of its bands, included or not (`INCOMPLETE_IMAGE_OUTPUT`) - every band
  of the assets `bandMathOutputBands.mjs` reads reports it, which shows the usual case, not that it cannot happen;
- an input refused for its own configuration, such as a Band Math naming two output bands alike, which Earth Engine
  would build with the second renamed (`DUPLICATE_BAND_NAME`), or a Stack or BAYTS recipe its declaration refuses.

The refusal reaches every route that reads the description: Retrieve, whatever the destination, Task's asset export,
previews on every map, and recipes reading Band Math as a source. Task's Drive and SEPAL exports describe nothing, so a
model submitted to them directly is not checked: Earth Engine still refuses a missing band there, and still builds what
the description refuses.

Each input is asked for the bands it includes as the physical bands it should return (`withOutputBands`), so an
input whose own selection means something else - CCDC's names the measures to fit - still returns those bands. Asked
for no bands or an empty selection, Earth Engine builds every configured output band; a selection returns exactly
the bands selected, in the order selected. The catalogue answers the configured names without building anything.

## Open issues

- **Earth Engine renames a repeated output name.** Output images are concatenated, so a second `x` is built as `x_1`.
  The declaration refuses such a configuration; execution still builds it.
- **Renaming a calculation's bands can repeat another output band's default name.** The sync that follows a rename
  (`modules/gui/src/app/home/body/process/recipe/bandMath/sync/updateOutputBands.js`) writes the new name as
  `defaultOutputName` without the uniqueness the form applies.
- **Uniquifying repeated calculation band names can repeat itself.** `makeUnique` in
  `modules/gui/src/app/home/body/process/recipe/bandMath/panels/calculations/calculation.jsx` matches its pattern
  against band objects rather than names, so a third repetition is named like the second.

## Verification

- `modules/gee/verify/bandMathOutputBands.mjs` - on live Earth Engine: the catalogue, the running image asked for
  nothing, an empty selection and a subset out of order, the description from an observed running image, an
  expression cast over CCDC's coefficients and its segment starts passed through, observed as arrays and sampled,
  the dimensionality of casts, expressions and reducers over arrays, repeated names and no output bands as the
  declaration and Earth Engine each answer them, an input band the asset lacks as Earth Engine refuses it, the
  dimensionality of every band of representative input assets, and one pixel value.
- `lib/js/shared/test/recipe/output/type/bandMath.test.js` - the declaration's outcomes, through the read and the
  observer, over asset, declared-recipe, Masking and nested Band Math inputs.
- `modules/task/src/tasks/imageAssetExport.test.js` - Band Math's asset export, refused for a missing input band, an
  input that cannot be described or read, and an input Band Math naming two outputs alike.
- `modules/gui/src/app/home/body/process/recipe/bandMath/inputBandProblems.test.jsx` - the inputs and toolbar button
  marked for a missing band, and not for pending, failed, upstream or superseded reads, the output read shared.
- `modules/gui/src/app/home/body/process/recipe/bandMath/panels/inputImagery/inputImageBands.test.jsx` - an input
  opened unchanged, a band its source no longer has kept, marked and refused until replaced or removed, never judged
  from saved bands, pending or failed reads, edits kept while reading, and source switches reconciled, over asset and
  recipe inputs.
- `modules/gui/src/app/home/body/process/sourceRuntime/outputExplanation.test.js` - a refusal explained for the editor
  alone: immediate, adding a missing input band once read, keeping one input's evidence when another fails, retried
  and checking the assets named when none could be read, a cold editor loading what it reads, cancellation once closed,
  reuse of a read that completed but never of one that failed, withdrawal on a new token, credentials or refresh.
- `modules/gui/src/app/home/body/process/sourceRuntime/assetFreshness.test.js` - a missing input band found, then
  recovered on a changed token or an explicit refresh, and an answer about an edited configuration ignored.
- `modules/gee/test/jobs/ee/bandMath/bandMathBands.test.js` - the catalogue, whatever is selected.
- `modules/gee/test/jobs/ee/image/inputBandReads.node.test.mjs` - the bands read from a CCDC input.
- `modules/gui/src/app/home/body/process/recipe/bandMath/bandMathOutput.test.js` - the common read, Retrieve's
  policies and destinations, Retrieve refused and allowed by the configuration checks, and Masking over Band Math.
- `modules/gui/src/app/home/body/process/recipe/bandMath/chainRequirements.test.js` - the configuration checks.
- `modules/gui/src/app/home/body/process/recipe/bandMath/panels/outputBands/outputBandRows.test.jsx` - Output bands:
  copies of one band, output names, orphaned outputs, and the bands offered and added - those the input includes now,
  never a band removed from it, a same-named replacement offered.
- `modules/gui/src/app/home/body/process/recipe/bandMath/bandMathLayer.test.jsx` - a layer on another map refused,
  withdrawn and drawn again.
- `modules/gui/src/app/home/body/process/recipe/bandMath/panels/calculations/calculationRequirements.test.jsx` - the
  calculations' marks, and their panel's Apply left as it was.
- `modules/gui/src/app/home/body/process/recipe/bandMath/sectionMarks.test.jsx` - the toolbar buttons and Output bands
  rows marked for an output image left without bands by unselecting its band, and cleared once it has one; a section
  without any output image; an output
  of an unmet calculation marking Output bands by naming it alone; duplicate and invalid output names; an input
  lacking a band beside an output problem.
- `modules/gui/src/app/home/body/process/recipe/bandMath/sync/` - derivation through failure, recovery and renames.
