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

### Shared input editor

Stack and Remapping share `process/panels/inputImagery`; Band Math follows the same behavior in its editor.

- Source kind is chosen beside the picker; a new input starts as an asset. Asset/recipe kinds keep separate
  source and band drafts while open; switching kinds restores its draft without transferring bands.
- Reading a saved source is not an edit. Its selected bands and IDs survive reopening and metadata refresh.
  A band confirmed missing stays selected, marked and removable, and blocks Apply. Pending/failed reads do
  not establish absence. Late answers for a replaced source change nothing.
- Explicit source replacement reconciles after a successful current read: retain available selected bands,
  drop absent ones and select no substitute. If none are selected, offer Add once, without reopening it on
  refresh, draft return or dismissal. Loading, failed and empty reads offer nothing.
- Each selected band has a row; change it by remove/add, without inheriting the removed row's ID. The type
  control chooses continuous/categorical without toggling row expansion. Categorical legends initially open
  and have independent editors. Switching to continuous sets the legend aside in the draft; switching back
  restores it. Applied continuous bands retain no legend. Truncated names have full tooltips.

Band Math's explicit [reference recovery](band-math.md#inputs) can reclaim retained IDs at Apply.

### Applied input and naming checks

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
names them and applies. A refusal of an input recipe stays with that recipe: its detailed diagnosis does not mark this Stack's Band names.
Shared [reference feedback](../design/recipes/source-resolution.md#consumers) marks IMG and the declaring
input row for a confirmed upstream problem. It follows the draft selector, preserves Apply/Cancel semantics,
and clears on upstream repair; it does not assign upstream failures to this Stack's Band names.

Input imagery keeps the mapping following the bands each input includes (`toBandNames`). A band keeps the name it was
given, even one another band also has, until the user edits it there; a band newly included takes its own name,
suffixed where a band of any input already has it - two inputs' `elevation` give `elevation` and `elevation_1`.

## Output

Declared in `lib/js/shared/src/recipe/type/stack.js` (see the
[output contract](../design/recipes/output-products.md#declaration-and-description)). Each output band
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

Known limitations and follow-ups are tracked in the [workplan](../design/workplan.md#stack).

## Verification

- `lib/js/shared/test/recipe/output/type/stack.test.js`: mapping validation and inherited band facts.
- `modules/gee/test/jobs/ee/stack/stackBands.test.js` and `jobs/ee/image/inputBandReads.test.js`:
  catalogue and physical CCDC input selection.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js`: renamed encoding and export refusal.
- `modules/gui/src/app/home/body/process/recipe/stack/`: output policies, section marks and name synchronization.
- `modules/gui/src/app/home/body/process/panels/inputImagery/`: shared input drafts, missing bands and legends;
  `panels/inputImageSources.test.jsx` covers kind selection and duplicate-source refusal.

The read-only [Stack probe](../../modules/gee/verify/README.md) checks real schema, selection order,
renaming, arrays, one pixel and declaration/execution differences. It does not establish export acceptance.
