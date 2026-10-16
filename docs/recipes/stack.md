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

Stack and Remapping share an input editor. The kind of source - an asset or a recipe - is chosen beside its picker, a
new input starting as an asset; each kind keeps a draft of its own while the editor is open - its source and the bands
selected for it - so switching back restores it, and no band crosses from one kind to the other. A kind not yet shown
starts with nothing selected. It learns what a source holds by reading it; nothing it learns is an edit: opening a saved
input leaves it unchanged, offering no Apply. Each selected band is a row of its own, named in its header and chosen
when it is added: another band is taken by removing the row and adding one, which takes nothing of the removed band, not
its id. The header chooses the band's type, continuous or categorical, over its source's default either way, without
opening or closing the row. A categorical band shows its legend, open until its row collapses it and opened when the
band is switched to categorical; a continuous band has none. A legend set aside by switching its band to continuous
returns if the band is switched back while the editor is open; the configuration keeps no legend for a continuous band.
Each legend is edited in an editor of its own, however many are shown. A long name is cut short in its row, named in
full by its tooltip. A read of the source the input was saved with keeps every selected band as saved, with its id. One
that read finds absent stays selected, marked on its row with the reason as its tooltip, and refuses Apply until it is
removed or its source has it again. Absence is judged from that read alone: never from the band list saved with the
input, nor while the read is pending or after it fails. Choosing another source reconciles the selection once that
source answers: bands it holds are kept and the others dropped; no band is selected for the user. Once a source just
chosen answers with bands, none of them selected, the bands to add are offered, once: not again after they are
dismissed, nor when a draft returns or its source is read again, and never while it loads, after its read fails or when
it has no bands. An answer about a source no longer selected changes nothing.

Running it needs one input image at least: a Stack listing none cannot run
([Execution readiness](../design/recipes/source-resolution.md#execution-readiness)). Its Input imagery button says
"Please add at least one image." - except while the set-up wizard has that section open, where the list holds Next
until it has one - its layer is not drawn, Retrieve is held and the asset export is refused, as for every recipe over
it. Adding an input restores them.

The editor marks an input found to lack a band it maps: its row in Input imagery says some of its bands are
unavailable, to be reviewed in it, and the Input imagery toolbar button that some inputs' are; the input's editor names
the bands. The finding is the output read's as it stands - the `MISSING_INPUT_BAND` diagnoses this recipe owns, found
at its band names entry, which knows its input by `imageId` - through the requirement it shares with Band Math
(`panels/inputImagery/inputImageryRequirements.js`, [Band Math](band-math.md#configuration-checks)), watched while the
editor is open, the loading shared with its map layer and Retrieve. While it stands, Retrieve is disabled and refused
at submission (`CONFIGURATION_UNMET`, naming Input imagery), and previews are not requested or are withdrawn; repair
restores them. While the read is pending or unavailable nothing is marked and Retrieve waits; where the output is
refused for anything else - its band names, say - Retrieve is disabled too, marking no input. A band its source no longer has is not replaced
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

- **Re-adding an input loses output aliases.** The source-recovery audit found a removed input's custom output name
  was replaced by a fresh default when the same source returned, leaving a downstream consumer of the old name
  blocked. Restoring discarded aliases needs a retention policy, not just source matching. See the
  [validation and source recovery roadmap](../design/recipes/source-resolution.md#validation-and-source-recovery-roadmap-2026-10-15).
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
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js` - encoding recorded under renamed names, and the export refused
  before an input with no image output is read.
- `modules/gui/src/app/home/body/process/recipe/stack/sectionMarks.test.jsx` - an input lacking a band marked on
  its row and Input imagery before it is opened, Retrieve withheld meanwhile, the configuration kept, recovery, pending and failed reads, reordered
  and removed inputs; repeated, blank, misspelled and unmapped band names marked on Band names at once and refused in
  their fields when it opens, kept on Cancel and repaired there; each section left marked while the other is repaired; and an upstream Stack's
  diagnoses left with it.
- `modules/gui/src/app/home/body/process/recipe/stack/panels/bandNames/bandNamesUpdate.test.js` - the mapping following
  the bands included, names given kept and new ones named apart.
- `modules/gui/src/app/home/body/process/panels/inputImagery/inputImageBands.test.jsx` - the input editor Stack and
  Remapping share: an input opened unchanged, a band its source no longer has kept, marked and refused until removed,
  another band taken by removing and adding, never judged from saved bands, pending or failed reads, edits kept while
  reading, source switches reconciled, each kind's draft kept and restored with no band crossing, no band selected for
  the user, the bands to add offered once, and a band's type chosen either way, its legend open, collapsed and kept
  through a switch to continuous and back, over asset and recipe inputs.
- `modules/gui/src/app/home/body/process/panels/inputImageSources.test.jsx` - the kind of source chosen beside its
  picker, a new input starting as an asset and a saved one keeping its kind, and a source another input uses not offered
  or refused.
- `modules/gui/src/app/home/body/process/panels/inputImagery/bandLegends.test.jsx` - two categorical bands' legends
  shown at once in Remapping's real input editor, each edited in the legend widget's own editor alone.
