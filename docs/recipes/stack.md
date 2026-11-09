# Stack

Stacks bands selected from several input images into one image, each under a name of the user's choosing.

## Inputs

`inputImagery.images` lists the input images in order, each a selected recipe or asset (`type`, `id`) with the bands
chosen from it (`includedBands`). `bandNames.bandNames` maps them: one entry per image, found by its `imageId`, listing
each chosen band's `id`, its `originalName` and the `outputName` it is given. A band is named automatically while its
`automaticName` equals its `outputName`. Any other name is the user's, including every name saved without
`automaticName`, however it looks. `bandNames.retired` records names no band holds any longer, each with the band it
last named: its input's source and original name. The band lists and styles copied from a source when it was selected
are editing aids and presets, never evidence of what the source holds.

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
([Execution readiness](../design/recipes/source-resolution.md#execution-readiness)). Its Input imagery button is marked
as unfinished, saying "Please add at least one image." - except while the set-up wizard has that section open, where
the list holds Next, Done and Enter until it has one - its layer is not drawn, Retrieve is held and the asset export is
refused, as for every recipe over it. Adding an input restores them.

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
the band again or the user repairs it. Deliberately removing an input or unselecting its band removes it from the
mapping in the same action. Where the mapping is refused - an unmapped image, a blank or repeated name - the refusal is what every consumer
has, at once, and only the editor reads the inputs it names to mark those lacking a band, as Band Math's does
([Band Math](band-math.md#configuration-checks)). Remapping shares the list but describes its output from its legend
alone, reading no input, so nothing marks its inputs outside their editor.

The same read marks the Band names toolbar button, at once and before the panel opens, with the refusals this recipe
owns: a repeated or blank name, or an input the mapping does not name (`stack/bandNamesProblems.js`). A name written
as the editor does not accept one - a letter or underscore, then up to 29 letters, digits or underscores - marks it
too, judged from the configuration by the rule the fields apply (`stack/bandNameFormat.js`); the declaration and Task
do not refuse it. Each is repaired in Band names. A refusal of an input recipe stays with that recipe: its detailed
diagnosis does not mark this Stack's Band names.
Shared [reference feedback](../design/recipes/source-resolution.md#consumers) marks IMG and the declaring
input row for a confirmed upstream problem. It follows the draft selector, preserves Apply/Cancel semantics,
and clears on upstream repair; it does not assign upstream failures to this Stack's Band names.

### Band names

Every commit names the bands it leaves in its own action: an input's Apply, its removal from the list, and Band names'
Apply (`stack/derivations.js`, an applied derivation). The rule belongs to the declaration (`committedBandNames`,
`lib/js/shared/src/recipe/type/stack.js`) and reads configuration only:

1. Each input's entry follows the bands it includes, in their order, by band `id`. A band saved without an `id` is
   matched by its original name, where that tells it apart within its input, and takes the included band's `id`.
   Where it does not - the input includes the band more than once, or saved it under more than one name - the entry
   is kept as saved and its names are held, until the user names those bands in Band names.
2. The user's names are reserved as given; names the user gives alike stay refused.
3. In Stack order, an automatic name stays with its band unless one of the user's, or an earlier band's, holds it.
4. In Stack order, every other band takes its own name, suffixed - two inputs' `elevation` give `elevation` and
   `elevation_1`. It skips the names held, and every name that before the commit named, or was retired for, a band of
   another source. A blank saved name and an input the mapping does not name are named this way at the next commit.
5. Names no band holds after the commit are retired.

So a name never passes to another source's band by itself: removing `elevation` from one input and adding another
input's `elevation` gives the newcomer a suffix, in the same commit or a later one. The same source band may take its
old name back. Replacing an input's source keeps the rows the editor keeps, and with them their names: references
follow the replacement, as replacing the source intends. Opening the recipe or a panel, and reading its inputs, name
nothing. A band its source no longer has keeps its name.

Band names drafts the mapping as the user names it. A field left empty names its band automatically, showing that name
as its placeholder; a saved blank name, and the bands of an input the mapping does not name, open so, and Apply names
them. Band names' requirement (`stack/bandNamesRequirements.js`) judges names as the recipe holds them, by the
declaration's own refusals (`stackMappingRefusals`) and the editor's format rule. The panel's values are judged as
Apply's commit would name them, over the applied recipe (`recipe/editing/localCandidate.js` runs the applied derivation), so
an automatic name - suffixed past the length allowed, say - is judged as it would be saved. A name taken twice is said
at every band holding it, and a band left to name after an ambiguous save is said too. What it finds holds Apply and
Enter, judged again over the recipe as it stands at submission. A field says before Apply where a
name would read another band: an automatic name another band's takes, and a name the user gives that named another
band. Other recipes reading such a name read the band it now names. A submission whose names, or what they would read,
differ from those shown, because the applied recipe changed, is held and the panel shows them as they are. Cancel keeps
the names saved.

This Stack's own visualizations follow each band's rename in the same commit, by input and band `id`, a name saved
without an `id` matched to its band as the rule matches it (`savedBandNames`). The style of a band its input's saved
names cannot tell apart is kept as it is, as is a removed band's style; the input's other bands still follow.
Other recipes reference bands by name. A name that disappears is marked missing until repaired; an explicit
reassignment makes existing references read the band now holding that name.

Older clients keep `retired` when they save, but do not honour it: their input Apply can give a freed name to another
source. Their name edits leave a stale `automaticName`, and their input Apply drops it, so the names they write are the
user's.

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
- `lib/js/shared/test/recipe/stackBandNames.test.js`: the naming rule across adding, removing, renaming, replacing a
  source and saved names.
- `modules/gui/src/app/home/body/process/recipe/stack/`: output policies, section marks, and band names written at each
  commit and edited in Band names.
- `modules/gui/src/app/home/body/process/panels/inputImagery/`: shared input drafts, missing bands and legends;
  `panels/inputImageSources.test.jsx` covers kind selection and duplicate-source refusal.

The read-only [Stack probe](../../modules/gee/verify/README.md) checks real schema, selection order,
renaming, arrays, one pixel and declaration/execution differences. It does not establish export acceptance.
