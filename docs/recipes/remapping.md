# Remapping

Remaps its input images to classes: each legend entry is a class value, assigned where its constraints on the
inputs' bands hold.

## Inputs

`inputImagery.images` lists the input images, each a selected recipe or asset (`type`, `id`) with the bands chosen
from it (`includedBands`, each named by `band`). The editor is the one Stack shares
([Stack](stack.md#inputs)). `legend.entries` holds the classes, each with its `constraints` - each naming an input by
`imageId` (`image`) and one of its bands (`band`) - combined by `booleanOperator`.

## Configuration checks

Remapping judges its mapping as applied through the shared requirement reader (`remappingRequirements.js`), one read per
legend entry: each constraint must name an input still in Input imagery, and a band that input includes. Removing an
input or deselecting a band leaves the constraints reading it as they are; the Mapping toolbar button and the entry's
row are marked, with the reason as their tooltip, and in the entry's constraints the field concerned says what is wrong.
A constraint naming a removed input shows its image selector, even beside a single remaining input, which it takes only
when chosen. While any constraint is invalid the entry's Apply is unavailable; each invalid constraint can be opened and
repaired, by choosing another input or band, or removed, and Cancel keeps the configuration as saved. Opening rewrites
nothing.

Any unmet constraint holds back the image output, whichever panels are open: previews, here and on other maps, are not
requested or are withdrawn, and Retrieve is disabled and refused at submission (`CONFIGURATION_UNMET`, naming Mapping).
Repairing and applying the constraint restores them. This holds even where Earth Engine would build the image - an asset
input is built with every band it stores, so a constraint reading one its input does not include executes
([Output](#output)) - since the configuration no longer says what the constraint reads. An edit not yet applied is
judged by its modal alone: it keeps Apply unavailable, and leaves the applied configuration as it was judged.

Running it needs one input image at least: a Remapping listing none cannot run, though its class is described from
its legend ([Execution readiness](../design/recipes/source-resolution.md#execution-readiness)). Input imagery says
"Please add at least one image." - except while the set-up wizard has it open, where its list holds Next until it has
one - its layer is not drawn, Retrieve is held and the asset export is refused. While what its image builds is being
read, Retrieve waits.

Not checked: whether an input's source holds its bands, and a model submitted to Task directly, which Earth Engine
builds as above. The constraint editor checks references only where Remapping asks it to (`checkReferences`); its other
users judge their constraints as before.

## Output

Declared in `lib/js/shared/src/recipe/type/remapping.js`: one categorical band, `class`, using mode for pyramiding,
described from the legend alone without reading any input. A legend without entries describes no bands.

Execution (`lib/js/ee/src/remapping/remapping.js`) passes each input the bands it includes as its `selection`, then
selects from it the band each constraint reads. An asset input does not read that selection and is built with every band
it stores; a recipe input applies it as its type does. On live Earth Engine
(`modules/gee/verify/classificationOutputBands.mjs`), over an asset input:

| An input band missing | Execution | Described |
| --- | --- | --- |
| none | builds `class` | `class` |
| one a constraint reads | refused: the band matches nothing | `class` |
| another of an input a constraint reads | builds `class` | `class` |
| one of an input no constraint reads | builds `class` | `class` |
| none, but a constraint reads a band the asset stores that the input does not include | builds `class` | `class` |

So a band no constraint reads need not prevent execution, and refusing every missing selected band in the
description would refuse recipes that execute.

## Open issues

- **Its inputs are not marked above their editor.** The input editor marks a selected band its source no longer
  has, but nothing marks the input's row in Input imagery or the Input imagery button, as Stack and Band Math do
  from their output reads: Remapping's description reads no input, so its output read establishes nothing about
  them. A design was prototyped and set aside: an editor-only assessment of the bands the inputs select, apart from
  the output - a provider `assess`, a resolver assessment mode, an `ASSESS` runtime work type and a second editor
  question - marking every established missing band at all three levels while leaving the output, Retrieve and
  asset export unchanged, pending or failed evidence counting as unknown. It was judged too broad to land for this
  gap alone, and is better taken up as a foundation for editor validation across recipes, if at all.
- **A recipe input's deselected band is not verified.** Submitted to Task directly, a constraint reading a band its
  recipe input does not include executes or fails as that recipe type applies `selection`; only asset inputs are
  verified live.

## Verification

- `modules/gee/verify/classificationOutputBands.mjs` - on live Earth Engine: the declared band against the image
  built, with and without legend entries, and each case of a missing input band above, built and at one pixel; an asset
  input built as Remapping builds it, keeping every band it stores.
- `modules/gui/src/app/home/body/process/recipe/remapping/remappingRequirements.test.js` - each constraint judged by the
  input it reads and the bands that input includes; the image output held back by Mapping, and Retrieve not offered and
  refused at submission until the constraint is repaired.
- `modules/gui/src/app/home/body/process/recipe/remapping/remappingLayer.test.jsx` - a layer on another map not
  requested while a constraint reads a removed input or a band not included, withdrawn once one is applied, and drawn
  again once repaired, though its assets store every band read.
- `modules/gui/src/app/home/body/process/recipe/remapping/constraintReferences.test.jsx` - the Mapping button, rows and
  fields marked and Retrieve not offered, opening writing nothing, each invalid constraint expanded in turn and kept in
  focus, a removed input replaced only when chosen, repair by replacement or removal, Cancel, an invalid edit refused
  without unmarking the applied mapping, and Index Change's constraints judged as before.
- `modules/gui/src/app/home/body/process/recipe/remapping/panelActivation.test.jsx` - which of its panels open and
  give way, an edited legend or input holding the others closed, and the set-up wizard.
