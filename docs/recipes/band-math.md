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

The forms generate unique default output names - two inputs' `red` become `red` and `red_1` - and refuse an explicit
name that repeats another.

## Output

Declared in `lib/js/shared/src/recipe/type/bandMath.js` (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)): the configured output
bands in configured order, each under its final name, `outputName` or else `defaultOutputName`.

Whether a band is an array is not configured. A cast sets only the element type and keeps an array an array; an
expression over an array band yields one; `max`, `min`, `first` and `last` keep arrays, `count` and
`countDistinctNonNull` return scalars, and the other reducers refuse arrays. So the running image is observed, for
its dimensionality alone, and must carry exactly the configured names in order. Until it has been observed nothing is
offered. A verified scalar is averaged at coarser pyramid levels, as Earth Engine's default always exported it; a
verified array is sampled; a band whose dimensionality was not observed states neither. No encoding is stated, even
for a band passed through from an input.

| Configuration or evidence | Answer |
| --- | --- |
| no output bands | no bands, observing nothing |
| two final names alike | refused, `DUPLICATE_BAND_NAME`, observing nothing |
| running image not yet observed, or its observation failed | nothing offered: needs evidence, or unavailable |
| running image carrying other names, or another order | refused, `CONFLICTING_OBSERVATION` |

Asked for no bands or an empty selection, Earth Engine builds every configured output band; a selection returns
exactly the bands selected, in the order selected. The catalogue answers the configured names without building
anything.

## Open issues

- **An input whose selection means something else is read wrongly.** Band Math asks each input for its included bands
  as a bare `selection`. CCDC reads a selection as the measures to fit, so Band Math over CCDC's `ndvi_coefs` fails;
  asked with `outputBands` beside the selection (`withOutputBands`), as exports ask, CCDC builds those bands. Stack
  reads its inputs the same way.
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
  nothing, an empty selection and a subset out of order, the description from an observed running image, the
  dimensionality of casts, expressions and reducers over arrays, repeated names and no output bands as the
  declaration and Earth Engine each answer them, and one pixel value.
- `lib/js/shared/test/recipe/output/type/bandMath.test.js` - the declaration's outcomes.
- `modules/gee/test/jobs/ee/bandMath/bandMathBands.test.js` - the catalogue, whatever is selected.
- `modules/gui/src/app/home/body/process/recipe/bandMath/bandMathOutput.test.js` - the common read, Retrieve's
  policies and destinations, and Masking over Band Math.
