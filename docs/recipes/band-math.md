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

Output bands follow the bands they were copied from by id, an output band's identity being its id within its output
image. Deliberately unselecting an input band removes every output taken from it: the one copied under its id, and any
a saved recipe copied under an id no band of that image has, matched by the name of the band it was copied from, never
by the name it is output under. By the same match, Output bands neither offers nor adds a band its image already
outputs; two outputs of one band a saved recipe holds are kept as saved. A FUNCTION calculation's band keeps its id when
the calculation is edited, so its output, and any name given to it, follows.

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
- A calculation reading an unmet calculation depends on it, and so does an output taken from one. It names what it
  depends on rather than repeating what is wrong there, and still reports its own problems.

Any unmet calculation holds back the image output, whether or not an output reads it: previews, here and on other
maps, are not requested or are withdrawn, and Retrieve is disabled and refused at submission (`CONFIGURATION_UNMET`,
naming Calculations), whatever its output reads as. Repair restores them. Calculations and Output bands mark their
toolbar buttons and the items concerned, with the reason as their tooltip. An output whose image no longer exists is
listed in Output bands as it was saved, marked, to be removed; it offers no bands to add. Saved `invalid` flags from
earlier versions are ignored.

These checks do not bind the panels: a panel's Apply is decided by its own validation, as before - an expression by
its editor's lint, over the inputs and the calculations before it.

After a change, the sync derives each expression's bands again, in order, from the calculations before it as just
derived, but only where everything it reads is met. One that is not keeps the bands it was derived with, and with them
the names its outputs were given. Renamed inputs, calculations and bands are still renamed in expressions, used bands,
outputs and visualizations.

Whether an input's bands exist in the asset or recipe it is taken from is judged by its output description
([Output](#output)), not by these checks. Not checked yet: anything here at the execution boundary - Task and Earth
Engine build what is submitted, and recipes reading Band Math as a source learn of an unmet configuration only when
Earth Engine refuses its image. Describing such a recipe still asks Earth Engine to observe it. Its sections are not
yet marked for an input band found missing.

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
| no output bands | no bands, observing nothing |
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

- **A recipe with no output bands cannot run.** Execution selects `.*` from an empty image, which Earth Engine refuses.
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
- `modules/gui/src/app/home/body/process/sourceRuntime/assetFreshness.test.js` - a missing input band found, then
  recovered on a changed token or an explicit refresh, and an answer about an edited configuration ignored.
- `modules/gee/test/jobs/ee/bandMath/bandMathBands.test.js` - the catalogue, whatever is selected.
- `modules/gee/test/jobs/ee/image/inputBandReads.node.test.mjs` - the bands read from a CCDC input.
- `modules/gui/src/app/home/body/process/recipe/bandMath/bandMathOutput.test.js` - the common read, Retrieve's
  policies and destinations, Retrieve refused and allowed by the configuration checks, and Masking over Band Math.
- `modules/gui/src/app/home/body/process/recipe/bandMath/chainRequirements.test.js` - the configuration checks.
- `modules/gui/src/app/home/body/process/recipe/bandMath/bandMathLayer.test.jsx` - a layer on another map refused,
  withdrawn and drawn again.
- `modules/gui/src/app/home/body/process/recipe/bandMath/panels/calculations/calculationRequirements.test.jsx` - the
  calculations' marks, and their panel's Apply left as it was.
- `modules/gui/src/app/home/body/process/recipe/bandMath/sync/` - derivation through failure, recovery and renames.
