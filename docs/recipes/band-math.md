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
  declaration and Earth Engine each answer them, and one pixel value.
- `lib/js/shared/test/recipe/output/type/bandMath.test.js` - the declaration's outcomes.
- `modules/gee/test/jobs/ee/bandMath/bandMathBands.test.js` - the catalogue, whatever is selected.
- `modules/gee/test/jobs/ee/image/inputBandReads.node.test.mjs` - the bands read from a CCDC input.
- `modules/gui/src/app/home/body/process/recipe/bandMath/bandMathOutput.test.js` - the common read, Retrieve's
  policies and destinations, and Masking over Band Math.
