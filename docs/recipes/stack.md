# Stack

Stacks bands selected from several input images into one image, each under a name of the user's choosing.

## Inputs

`inputImagery.images` lists the input images in order, each a selected recipe or asset (`type`, `id`) with the bands
chosen from it (`includedBands`). `bandNames.bandNames` maps them: one entry per image, found by its `imageId`, listing
each chosen band's `originalName` and the `outputName` it is given. The band lists and styles copied from a source when
it was selected are editing aids and presets, never evidence of what the source holds.

The form names bands after their source and renames a later image's band that repeats an earlier one - the same asset
selected twice gives `elevation` and `elevation_1` - and refuses an edited name that repeats another.

## Output

Declared in `lib/js/shared/src/recipe/type/stack.js` (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)). Each output band
corresponds to one band of one input (`stackBandCorrespondence`): the input images in model order, and within each
the bands its mapping names, in the mapping's order. Selecting and renaming change neither values nor representation,
so an output band takes its input band's dimensionality, pyramiding policy and encoding under its new name, from the
input's current description. A scalar its input states no policy for - an asset's, typically - is averaged at
coarser pyramid levels, as Earth Engine's default always exported it; an array gets no policy it was not given, and
an encoding its input does not state stays unknown.

| Configuration or inputs | Answer |
| --- | --- |
| an image with no mapping, a blank name, or a final name already taken | refused before any input is read: `UNMAPPED_INPUT`, `INCOMPLETE_IMAGE_OUTPUT`, `DUPLICATE_BAND_NAME` |
| an input not yet read | needs evidence |
| an input with no image output, such as a Sampling Design | refused, `NON_IMAGE_OUTPUT`, located at that input |
| a mapped band its input's description does not hold | refused, `MISSING_INPUT_BAND` |

Each input is asked for its mapped bands as the physical bands it should return (`withOutputBands`), so an input
whose own selection means something else - CCDC's names the measures to fit - still returns those bands. Asked for no
bands or an empty selection, Earth Engine builds every mapped band; a selection returns the bands selected, in model
order, and ignores a name the mapping does not give. The catalogue answers the mapped names without building
anything.

## Open issues

- **A selection can leave nothing to clip to.** An input none of whose bands is selected contributes an empty image,
  whose empty geometry becomes the clip region when every other selected input is unbounded - a global asset - and
  Earth Engine refuses it. A selection naming no mapped band fails the same way.
- **A Stack with no images builds no image.** Execution zips nothing and emits nothing.
- **The mapping's renaming covers only earlier images.** `toBandNames`
  (`modules/gui/src/app/home/body/process/recipe/stack/panels/bandNames/bandNamesUpdate.js`) renames a band repeating
  one of an earlier image, never one of its own image, and renames the later band rather than an edited one.

## Verification

- `modules/gee/verify/stackOutputBands.mjs` - on live Earth Engine: the catalogue, the running image asked for nothing,
  an empty selection and a selection, the description from its assets' band evidence, one asset stacked twice, CCDC's
  coefficients and segment starts renamed beside an asset, built and described with the same dimensions, and a
  repeated name, an unheld band and an unmapped input as the declaration and Earth Engine each answer them, and one
  pixel value.
- `lib/js/shared/test/recipe/output/type/stack.test.js` - the declaration's outcomes.
- `modules/gee/test/jobs/ee/stack/stackBands.test.js` - the catalogue, whatever is selected.
- `modules/gee/test/jobs/ee/image/inputBandReads.node.test.mjs` - the bands read from a CCDC input.
- `modules/gui/src/app/home/body/process/recipe/stack/stackOutput.test.js` - Retrieve's policies and destinations,
  Masking over Stack, and a Stack over an input with no image output.
- `modules/task/src/tasks/imageAssetExport.test.js` - encoding recorded under renamed names, and the export refused
  before an input with no image output is read.
