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
are not resolved by choosing an arbitrary match; ambiguous or malformed orphan references stay invalid. Already-orphaned recipes need that explicit repair before future removal/restoration can recover automatically.

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

Restoring the source band and refreshing its evidence restores the chain without changing constraints or
retained source identity. If the asset token has not changed, refresh the source asset so independently held
upstream answers are also invalidated; refreshing only a downstream question does not guarantee that.

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

## Feedback for a blocked recipe input

Shared [reference feedback](../design/recipes/source-resolution.md#consumers) marks IMG and the exact
recipe input for confirmed upstream findings. For Band Math → Remapping A → Remapping B, a problem owned
by A names A; a Band Math problem names A as the direct reference and Band Math as the origin. Both may
be named when each owns a finding. IDs remain structured through rendering and common recipe navigation.

The input editor follows its draft selection. A healthy replacement clears draft feedback without repairing
the applied model; Cancel preserves that model, and upstream repair clears feedback with current evidence.
Pending/transient failures add no configuration mark. This display adds no Apply rule or execution gate.
Only reported dependency routes are marked; diamond traversal may omit an alternate route.

## Open issues

The [validation roadmap](../design/recipes/data-sources.md#validation-and-execution-coverage)
tracks the remaining work below. Automatic source recovery and checking used bands against current source
descriptions are implemented.

- **Unused missing selections on recipe inputs.** Execution differs by source type, as described above. Decide whether
  to preserve those selection semantics and add type-specific requirements, or change execution to select only used
  bands, before broadening validation. Unused missing asset selections remain distinct and do not block readiness.

- **Routes that build the image unchecked.** The asset, Drive and workspace exports refuse a broken constraint, but
  Preview and the other image routes build it as before
  ([Execution readiness](../design/recipes/source-resolution.md#consumers)): a constraint naming a removed input fails
  in Earth Engine, and one reading a band its recipe input does not include executes or fails as that recipe type
  applies `selection` - only asset inputs are verified live.

## Verification

- `lib/js/shared/test/recipe/output/type/remapping.test.js`: located constraint/source findings and downstream repair.
- `modules/gui/src/app/home/body/process/recipe/remapping/`: constraint drafts, exact-source recovery,
  field/row/section marks, layer withdrawal and panel activation.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js`: direct/downstream export refusal and repair.
- [Live probes](../../modules/gee/verify/README.md): `classificationOutputBands.mjs` checks output schema;
  `remappingSourceBands.mjs` distinguishes used/unused selections through assets, Stack and Asset recipes.

Browser acceptance:

1. Build Band Math (`used`, `spare`) → Remapping A (constraint on `used`) → Remapping B. Add another healthy
   input to B; establish real previews/Retrieve.
2. Remove `used` upstream and Apply. A's IMG/input row, and B's reference to A, must be marked; MAP must not
   repeat the input failure. Both previews/Retrieve are held. Pending or failed reads create no false mark.
3. In A's constraint, select `spare`: draft Apply enables, applied blocking remains, Cancel keeps it. Restore
   exact `used` upstream and refresh current source evidence: both recover without changing constraints.
4. Remove an input, save/reopen and re-add its exact source with the required bands. Constraints recover with
   operators/values intact. Different sources, Cancel and omitted required bands must not repair them.
5. Open B's marked input, try a healthy draft replacement, Cancel, then repair upstream with the editor open.
   Feedback must follow the draft/current evidence; known recipe links preserve the originating draft.
6. Verify an unused missing asset selection does not block. Recipe-input differences remain the policy gap above.
