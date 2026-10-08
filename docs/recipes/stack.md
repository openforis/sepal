# Stack

Stacks bands selected from several input images into one image, each under a name of the user's choosing.

## Inputs

`inputImagery.images` lists the input images in order, each a selected recipe or asset (`type`, `id`) with the bands
chosen from it (`includedBands`). `bandNames.bandNames` maps them: one entry per image, found by its `imageId`, listing
each chosen band's `originalName` and the `outputName` it is given. The band lists and styles copied from a source when
it was selected are editing aids and presets, never evidence of what the source holds.

Inputs are told apart by their `imageId`, never by their source. A source - its type and id - can be taken by one
input only: one another input uses is not offered, or refused where it is typed. A saved recipe whose inputs already
share a source keeps them, each edited and removed alone.

Stack and Remapping share an input editor, which learns what a source holds by reading it; nothing it learns is an edit:
opening a saved input leaves it unchanged, offering no Apply. A read of the source the input was saved with keeps every
selected band as saved, with its id. One that read finds absent stays selected, marked on its row and band selector, and
refuses Apply until it is replaced - keeping its id - or removed. Absence is judged from that read alone: never from the
band list saved with the input, nor while the read is pending or after it fails. Choosing another source reconciles the
selection once that source answers: bands it holds are kept, the others dropped, and its first band selected when none
remains, as a new input is given its source's first band. An answer about a source no longer selected changes nothing.

The editor marks an input found to lack a band it maps: its row in Input imagery and the Input imagery toolbar button,
naming the bands (`stack/inputBandProblems.js`). The marks come from the output read as it stands - the
`MISSING_INPUT_BAND` diagnoses this recipe owns, found at its band names entry, which knows its input by `imageId` -
and are watched while the editor is open (`withOutputProblems.jsx`), the loading shared with its map layer and
Retrieve. While the read is pending or unavailable nothing is marked. A band its source no longer has is not replaced
or removed: the selection, its band names entry and its output name stay as configured, marked until the source has
the band again or the user repairs it. Deliberately removing an input or unselecting its band removes its band names
entry. Where the mapping is refused - an unmapped image, a blank or repeated name - the refusal is what every consumer
has, at once, and only the editor reads the inputs it names to mark those lacking a band, as Band Math's does
([Band Math](band-math.md#configuration-checks)). Remapping shares the list but describes its output from its legend
alone, reading no input, so nothing marks its inputs outside their editor.

The same read marks the Band names toolbar button, at once and before the panel opens, with the refusals this recipe
owns: a repeated or blank name, or an input the mapping does not name (`stack/bandNamesProblems.js`). A name written
as the editor does not accept one - a letter or underscore, then up to 29 letters, digits or underscores - marks it
too, judged from the configuration by the rule the fields apply (`stack/bandNameFormat.js`); the declaration and Task
do not refuse it. Each is repaired in Band names, whose fields check the names as they stand when it opens - unique
among the names the mapping gives, not blank, that rule - without waiting for an edit; Cancel keeps the names saved. The panel finds each input's entry by `imageId`, as the
declaration does; an input without one is offered its bands to name, blank, and gets its entry only once the user
names them and applies. A refusal of an input recipe stays with that recipe. Opening the panel changes nothing.

Input imagery keeps the mapping following the bands each input includes (`toBandNames`). A band keeps the name it was
given, even one another band also has, until the user edits it there; a band newly included takes its own name,
suffixed where a band of any input already has it - two inputs' `elevation` give `elevation` and `elevation_1`.

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
- `modules/gui/src/app/home/body/process/recipe/stack/sectionMarks.test.jsx` - an input lacking a band marked on
  its row and Input imagery before it is opened, the configuration kept, recovery, pending and failed reads, reordered
  and removed inputs; repeated, blank, misspelled and unmapped band names marked on Band names at once and refused in
  their fields when it opens, kept on Cancel and repaired there; each section left marked while the other is repaired; and an upstream Stack's
  diagnoses left with it.
- `modules/gui/src/app/home/body/process/recipe/stack/panels/bandNames/bandNamesUpdate.test.js` - the mapping following
  the bands included, names given kept and new ones named apart.
- `modules/gui/src/app/home/body/process/panels/inputImagery/inputImageBands.test.jsx` - the input editor Stack and
  Remapping share: an input opened unchanged, a band its source no longer has kept, marked and refused until replaced or
  removed, never judged from saved bands, pending or failed reads, edits kept while reading, and source switches
  reconciled, over asset and recipe inputs.
