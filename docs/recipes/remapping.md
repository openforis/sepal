# Remapping

Remaps its input images to classes: each legend entry is a class value, assigned where its constraints on the
inputs' bands hold.

## Inputs

`inputImagery.images` lists the input images, each a selected recipe or asset (`type`, `id`) with the bands chosen
from it (`includedBands`, each named by `band`). The editor is the one Stack shares
([Stack](stack.md#inputs)). `legend.entries` holds the classes, each with its `constraints` - each naming an input by
`imageId` (`image`) and one of its bands (`band`) - combined by `booleanOperator`.

## Configuration checks

Each constraint must name an input still in Input imagery, and a band that input includes. That is a shared
configuration requirement (`lib/js/shared/src/recipe/type/remapping.js`): `MISSING_CONSTRAINT_INPUT` or
`CONSTRAINT_BAND_NOT_INCLUDED`, found at the constraint (`['model', 'legend', 'entries', i, 'constraints', j]`) and
judged by the output read like every readiness finding
([Execution readiness](../design/recipes/source-resolution.md#execution-readiness)). The Remapping stays described, its
class known from its legend. Removing an input or deselecting a band leaves the constraints reading it as they are, and
then:

- the Mapping toolbar button and the entry's row are marked, the entry named with the first problem as their tooltip and
  the others listed after it (`remappingRequirements.js`); in the entry's constraints the field concerned says what is
  wrong;
- the layer is not drawn, here or on another map, or is withdrawn, and Retrieve is held and refused at submission
  (`CONFIGURATION_UNMET`, naming Mapping);
- a recipe whose image builds the Remapping - another Remapping of its classes, a Masking by it - is held the same way,
  naming the Remapping, though its own description reads nothing of it;
- the asset export refuses it: `Recipe X cannot run: MISSING_CONSTRAINT_INPUT` or `CONSTRAINT_BAND_NOT_INCLUDED`.

Repairing and applying the constraint clears all of these. A constraint reading a band its input does not include is
refused even where Earth Engine would build it - an asset input is built with every band it stores ([Output](#output))
- since the configuration no longer says what the constraint reads. The outline of the inputs is not held: it is the
first input's geometry, whatever the constraints read.

The constraint editor judges an edit itself, against the inputs and bands Input imagery offers (`checkReferences`). A
constraint naming a removed input shows its image selector, even beside a single remaining input, which it takes only
when chosen. While any constraint is invalid the entry's Apply is unavailable; each invalid constraint can be opened and
repaired, by choosing another input or band, or removed. An edit not yet applied changes nothing the recipe is judged
by: a repair can be applied while the applied recipe is refused, and Cancel keeps the configuration as saved. Opening
rewrites nothing.

Re-adding the same source kind and exact asset or recipe ID, then applying the input, automatically reconnects its
constraints to the new `imageId`. Their bands, operators, values and selected classes stay unchanged. If the restored
input omits a required band, the missing-input finding becomes a band-not-included finding; including that band and
applying clears it. A different source with the same bands does not reconnect anything. Draft input edits and Cancel
leave the applied errors and execution blocks in place.

Each constraint retains `imageSource`, the `inputSourceKey` string made from source kind and exact ID. The shared input
editor captures it before removing an input and refreshes it when applying an input, including a change of selected
source. Applying constraints in Mapping also records their current source identities. Thus existing valid constraints
acquire the identity on their next applied edit or input removal, without a migration or a change merely from opening
the recipe. It is stored in the model, so recovery survives saving and reopening after removal. The input and constraint
updates are one action; readiness still checks the actual `image` reference and included band, never `imageSource`.

Legacy orphaned constraints that have already lost their input and have no retained identity need one explicit repair
in Mapping. Their former source cannot safely be inferred from a name or band. Duplicate source or input identities
are not resolved by choosing an arbitrary match; ambiguous or malformed orphan references stay invalid. The supplied
`.vscode/remapping_A.json` is already orphaned this way: B must be explicitly linked to the radar input once before
future removal and restoration can recover automatically.

Running it needs one input image at least: a Remapping listing none cannot run, though its class is described from
its legend. Input imagery says "Please add at least one image." - except while the set-up wizard has it open, where its
list holds Next until it has one - its layer is not drawn, Retrieve is held and the asset export is refused. Its
constraints, reading inputs no longer listed, are found too. While what its image builds is being read, Retrieve waits.

A successful current source description is also checked for each included band a constraint actually reads.
If the source no longer provides it, shared readiness reports `MISSING_INPUT_BAND` at that input's included band.
This blocks rendering, Retrieve and the existing asset-export route, including downstream recipes. The known `class`
description remains available. Missing inputs and bands not included still have their separate constraint findings;
pending, failed or superseded evidence never establishes a missing source band.

The affected input row and IMG button use the existing unavailable-band feedback. MAP and its legend entries do not
repeat that originating input error. The input editor retains its detailed unavailable selections, and the constraint
editor explains which selected band the source no longer provides. Its actual draft is read through `OutputCandidate`
and the same shared rule: Apply is disabled for that draft's missing source bands, a valid repair can be applied even
while another entry remains invalid, and Cancel changes no applied availability. No saved validity or extra assessment
work type is introduced. Other callers of the constraint editor keep their existing behaviour.

Restoring the source band and refreshing its evidence restores the chain without editing the constraints or their
retained source identity. For an asset whose version token has not changed, refresh the **source asset**: refreshing
only a downstream output refreshes that question but does not also refresh separately held upstream output answers.

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

The read-only probe `modules/gee/verify/remappingSourceBands.mjs` also samples a public DEM through recipe inputs.
An unused missing selection executes through Stack, which filters its output mappings to the requested names. The
same selection fails through an Asset recipe (`ASSET_MOSAIC`), which explicitly selects every requested name. A used
missing asset band fails both the first Remapping and a second Remapping over it. These live checks are distinct from
the mocked readiness, GUI and export tests. This packet covers bands constraints read; it does not impose a uniform
unused-selection policy across recipe types.

## Open issues

The [validation and source recovery roadmap](../design/recipes/source-resolution.md#validation-and-source-recovery-roadmap-2026-10-15)
tracks the remaining work below. Automatic source recovery and checking used bands against current source
descriptions are implemented.

- **Unused missing selections on recipe inputs.** Execution differs by source type, as described above. Decide whether
  to preserve those selection semantics and add type-specific requirements, or change execution to select only used
  bands, before broadening validation. Unused missing asset selections remain distinct and do not block readiness.
  The previously rejected editor-assessment framework has not been revived to mark them.
- **Routes that build the image unchecked.** The asset export refuses a broken constraint, but Preview, the Drive and
  workspace exports and the other image routes build it as before
  ([Execution readiness](../design/recipes/source-resolution.md#consumers)): a constraint naming a removed input fails
  in Earth Engine, and one reading a band its recipe input does not include executes or fails as that recipe type
  applies `selection` - only asset inputs are verified live.

## Verification

The source-band packet adds shared used-band/downstream cases, mounted constraint draft repair and Cancel cases,
input-row/IMG feedback, preview withdrawal/restoration, runtime pending/failed/superseded evidence and source refresh,
and mocked asset-export refusal/recovery. `remappingSourceBands.mjs` is the separate live EE check described above.

### Manual source-band sequence

1. Create a working Band Math with two output bands, `used` and `spare`. Add it to Remapping A, include both bands,
   and give an entry a constraint on `used`. Create Remapping B using A's `class` output. Confirm both render and
   offer Retrieve.
2. In the upstream Band Math output editor, remove `used` while keeping `spare`. Cancel first: both Remappings should
   remain available. Repeat and Apply: A's IMG and input row should be marked; its input editor should explain the
   missing selection. Both Remappings should stop rendering and refuse Retrieve/asset export, with B attributing
   the failure upstream. A's MAP and B's own sections should not acquire copies of the source error.
3. Open A's constraint. Its selected `used` band should explain the source problem and Apply should be disabled.
   Select `spare`: Apply should become available, but applied availability should remain blocked. Cancel to keep the
   original constraint.
4. Restore the upstream output with the exact name `used` and Apply. With current source evidence, A and B should
   render and offer Retrieve again. No constraint band, operator, value or retained source identity should change.
   For external asset changes, refresh the source asset's evidence after restoring its band.
5. As a separate check, leave an unused missing selection on an asset input while every constraint reads an available
   band. It should not block rendering/Retrieve. Recipe-input differences are the open policy described above.

### Automated coverage

- `modules/gee/verify/classificationOutputBands.mjs` - on live Earth Engine: the declared band against the image
  built, with and without legend entries, and each case of a missing input band above, built and at one pixel; an asset
  input built as Remapping builds it, keeping every band it stores.
- `lib/js/shared/test/recipe/output/type/remapping.test.js` - each broken reference found at its constraint, the
  Remapping described, a Remapping of it held and both restored once repaired; an input not yet loaded awaited, and a
  band its asset no longer holds not taken for one its input does not include.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js` - the asset export refused for a Remapping reading a
  removed input or a band not included, and for a Remapping of it, and exported once repaired.
- `modules/gui/src/app/home/body/process/recipe/remapping/remappingRequirements.test.js` - each entry said by what its
  constraints read, every problem once in constraint order; the image output held back by Mapping, Retrieve not offered
  and refused at submission until the constraint is repaired; a Remapping of it held, marked nowhere, and offered once
  repaired.
- `modules/gui/src/app/home/body/process/recipe/remapping/remappingLayer.test.jsx` - a layer on another map not
  requested while a constraint reads a removed input or a band not included, withdrawn once one is applied, and drawn
  again once repaired, though its assets store every band read.
- `modules/gui/src/app/home/body/process/recipe/remapping/constraintReferences.test.jsx` - the Mapping button, rows and
  fields marked and Retrieve not offered, opening writing nothing, each invalid constraint expanded in turn and kept in
  focus, a removed input replaced only when chosen, repair by replacement or removal, Cancel, an invalid edit refused
  without unmarking the applied mapping, automatic recovery after re-adding the exact asset or recipe source, recovery
  across saving/reopening, omitted bands, different sources, Cancel, changed input sources, legacy ambiguity, and
  Index Change's constraints judged as before.
- `modules/gui/src/app/home/body/process/recipe/remapping/panelActivation.test.jsx` - which of its panels open and
  give way, an edited legend or input holding the others closed, and the set-up wizard.

### Manual source recovery check

1. Start with A reading optical `nbr < 500` and B reading radar `VV_med < -7`. For the supplied already-broken recipe,
   first repair B's input and band in Mapping and Apply.
2. Remove the radar input. B and MAP should be marked, Retrieve unavailable and the preview withdrawn. Save and reopen.
3. Add the exact radar asset, include `VV_med`, and Apply. B should still read `VV_med < -7`; its marks and execution
   blocks should clear. A should retain its optical reference and expression.
4. Repeat with only `VH_med` included: B should report that `VV_med` is not included. Include it and Apply to recover.
   Re-adding a different radar asset or cancelling the new input must leave B blocked.
