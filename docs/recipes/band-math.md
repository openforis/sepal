# Band Math

Evaluates calculations over its input images - expressions, and reducers across chosen bands - and outputs a
configured selection of input and calculated bands under names of the user's choosing.

## Inputs

`inputImagery.images` lists the input images, each a selected recipe or asset (`type`, `id`) with the bands Band Math
reads from it (`includedBands`) and a variable name. A new input or calculation is named `i<n>` or `c<n>`, one past
the highest such name an input or calculation has or a calculation reads (`variableName.js`), counted exactly - or,
where that would be longer than a name may be, the lowest number none has; no existing name changes, and a removed name
a calculation still reads is not given to another source. An exact returning source can reclaim its unused former
name as described below. `calculations.calculations` holds expressions and reducers in
order; each names its bands (`includedBands`) and an optional cast (`dataType`, `auto` for none), and may read the
inputs and earlier calculations. `outputBands.outputImages` selects the output: per input or calculation, the bands
it contributes, each with a generated `defaultOutputName` and an optional `outputName`. A calculation no output band
is taken from is intermediate. The band lists, styles and legends copied from a source when it was selected are
editing aids and presets, never evidence of what the source holds.

Inputs are told apart by their `imageId`, never by their source. A source - its type and id - can be taken by one
input only: one another input uses is not offered, or refused where it is typed. A saved recipe whose inputs already
share a source keeps them, each edited and removed alone.

Applied input changes and removal retain `imageSource` on each calculation's `usedBands` references, using
`inputSourceKey` (source kind plus exact asset/recipe ID). The existing `imageName`, `imageId` and band `id` retain the
former variable name and identities. `inputImages.js` reuses Remapping's source reconciliation: a reference whose
input still exists refreshes its source identity, including an applied change to that input's source. Removal
captures identity before the input disappears. No separate input history is kept, and these fields survive normal
save/reopen. Existing working recipes acquire this metadata on their next applied input change or removal; opening
one alone changes nothing. For a valid expression, the existing shared analysis refreshes its reference snapshot
before the input change, including bands gained by whole-image derivation. An unresolved snapshot is preserved.

When the same unambiguous source is added back, the new-input form suggests its former variable name only if no
other input or calculation uses it and no conflicting retained reference claims it. Other sources keep the existing
name-allocation guard. A name explicitly typed in the draft is respected. Applying with the former name reconnects
preserved references to the new input's `imageId`; expression text, reducer settings, selected physical band names,
casts and calculated output names remain unchanged. Referenced selected bands reuse their retained band IDs so
normal synchronization preserves outputs still taken from calculations. A required band not yet selected stays
invalid under shared readiness; selecting it and applying clears that finding. Input and reference updates are
published in one action. Draft source changes, name suggestions and Cancel do not repair the saved recipe.

An occupied name is never stolen, and expressions are never rewritten to avoid a collision. Reducer references
then remain unresolved. Expressions retain their existing variable-name semantics: if a user has manually assigned
that name to a different input, the expression already reads that input; recovery does not reinterpret or undo that
explicit edit. A different name deliberately entered for the returning input also leaves automatic recovery undone.
Already-orphaned references without retained source identity need explicit repair; there is no reconstruction from
band names or list position. Ambiguous legacy source identities are not chosen as replacements. Reconnecting these
preserved calculations does not restore deleted direct output selections, custom names from those deleted outputs,
deleted calculations, or Stack aliases.

The input editor works as Stack's does ([Stack](stack.md#inputs)). The kind of source - an asset or a recipe - is chosen
beside its picker, a new input starting as an asset; each kind keeps a draft of its own while the editor is open - its
source and the bands selected for it - so switching back restores it, and no band crosses from one kind to the other. A
kind not yet shown starts with nothing selected. It learns what a source holds by reading it, and nothing it learns is
an edit: opening a saved input leaves it unchanged, offering no Apply. Each selected band is a row of its own, named in
its header and chosen when it is added: a different band is taken by removing the row and adding one, which takes
nothing of the removed band. Re-including a band still referenced by a preserved calculation can reclaim its retained
id at Apply, as described above; deleted direct output selections stay deleted. The header chooses the band's type, continuous or categorical, over its source's default
either way, without opening or closing the row. A categorical band shows its legend, open until its row collapses it and
opened when the band is switched to categorical; a continuous band has none. A legend set aside by switching its band to
continuous returns if the band is switched back while the editor is open; the configuration keeps no legend for a
continuous band. Each legend is edited in an editor of its own, however many are shown. A long name is cut short in its
row, named in full by its tooltip. A read of the source the input was saved with keeps every selected band as saved,
with its id. One that read finds absent stays selected, marked on its row with the reason as its tooltip, and refuses
Apply until it is removed or its source has it again. Absence is judged from that read alone: never from the band list
saved with the input, nor while the read is pending or after it fails. Choosing another source reconciles the selection
once that source answers: bands it holds are kept and the others dropped; no band is selected for the user. Once a
source just chosen answers with bands, none of them selected, the bands to add are offered, once: not again after they
are dismissed, nor when a draft returns or its source is read again, and never while it loads, after its read fails or
when it has no bands. An answer about a source no longer selected changes nothing.

Output bands follow the bands they were copied from by id, an output band's identity being its id within its output
image. Deliberately unselecting an input band removes every output taken from it: the one copied under its id, and any a
saved recipe copied under an id no band of that image has, matched by the name of the band it was copied from, never by
the name it is output under. Output bands offers and adds only bands the input or calculation includes now, found by its
`imageId` - never the copy of its bands an output image was saved with, which can still list a band since removed - and,
by the same match, none its image already outputs; the ids that copy knows stay known, so a band replaced by a
same-named one is still offered. A choice is checked again when it is added, alone or by Add all, and added as its image
includes it then. Two outputs of one band a saved recipe holds are kept as saved. A FUNCTION calculation's band keeps
its id when the calculation is edited, so its output, and any name given to it, follows.

The forms generate unique default output names - two inputs' `red` become `red` and `red_1` - in output order, by
one rule (`outputImages.js`): custom names are taken first and never renamed, a default nothing earlier takes keeps its
name, and each other takes its band's name with the lowest free suffix, names given earlier in the same change counting
as taken - whether shown as a value or a placeholder. A name given automatically stays the band's - another output added
or removed, saved or reopened, changes none - and the model keeps it apart from a custom one (`defaultOutputName`,
`outputName`). Output bands shows a saved name, automatic or custom, as the field's value; a default allocated while the
panel is open - for a band added, a saved collision repaired as it opens, or a band reset - is a suggestion, the
placeholder of an empty field, which Apply saves and the next opening shows as the value. Typing a name gives a custom
one; clearing the field resets that band alone to the default now available to it, by the same rule, as the field's
tooltip says. Typing in one field renames no other band: a name another band is output under, automatically or not, is refused as a duplicate,
holding Apply back. A calculation whose
renaming gives several of its bands one name - a pattern matching each whole name - names them apart in order, `x`,
`x_1`, `x_2`, a repeat taking the suffix after the highest `x_<n>` already among them; each band keeps its identity. A
band renamed under its id - a calculation's band renamed or derived again - keeps its
outputs, the sync giving each the new name as its default, made unique as the forms make it against every other
output's final name: custom names count, and so do names given earlier in the same change, while the old names of the
bands renamed or removed in it, inputs' and calculations' alike, hold back none. Its custom name is kept, and no other
output is renamed; custom names stay taken, those of bands renamed in the change included. A saved recipe outputting
defaults alike keeps them as saved, and judged so, until Output bands is opened: its draft names them apart, its rows
no longer marked, Apply saves that and Cancel discards it. Custom names alike are not renamed, and stay marked. A
custom name is optional; when given it must start with a letter or underscore, continue with letters, digits and
underscores, and be at most 30 characters long. No two final names may be alike. Output bands checks both rules over
every configured output, a saved configuration included, and Apply stays unavailable while any fails; each row shows the
same rules as its own feedback.

## Configuration checks

Applied calculation-reference rules belong to shared execution readiness (`lib/js/shared/src/recipe/bandMath/calculationReferences.js`,
registered by `type/bandMath.js`). Each `INVALID_CALCULATION` finding locates its originating calculation at
`['model', 'calculations', 'calculations', index]` and carries the existing problem codes and reference details.
`bandMathRequirements.js` presents those findings on CALC and the originating rows; it no longer evaluates an applied
calculation predicate. Output-selection checks remain GUI-local in `chainRequirements.js`.

Execution builds every calculation in order, over the inputs and the calculations before it, so:

- An expression may read only those, by variable name and physical band name. It is analysed as its editor analyses
  it (the shared `bandMath/expressionAnalysis.js`): the same syntax, functions, argument counts and band-count rule. A function reads them
  by image id and physical band name, as execution selects them. A missing variable or band, a removed calculation, a
  later calculation and the calculation itself are each diagnosed.
- An output band must be a band of the image it is taken from, by physical name, and that image must exist.
- At least one input image is listed: running it zips them, and builds nothing from none. Without one, Input imagery
  says "Please add at least one image." beside what Output bands says of having none - except while the set-up
  wizard has Input imagery open, where its list holds Next until it has one - and its layer, Retrieve and the asset
  export are held, as for every recipe over it
  ([Execution readiness](../design/recipes/source-resolution.md#execution-readiness)).
- At least one image is output, each outputting at least one band, under names that are valid and that no other output
  band has - the rules Output bands applies to its own Apply (`outputImages.js`), so its fields, rows and toolbar
  button agree. An empty section is judged once, for the section; the rest per output image.
- A calculation reading an unmet calculation, and an output taken from one, remain blocked by the recipe's shared
  readiness. Only originating problems produce calculation findings and row marks; dependent rows do not repeat them.
  Output bands stays unmarked for calculation failures, but still reports its own output-selection problems.
  Self and forward references remain invalid, so a calculation cycle cannot become valid.

Any unmet calculation holds back the image output, whether or not an output reads it: previews, here and on other
maps, are not requested or are withdrawn, and Retrieve is disabled and refused at submission (`CONFIGURATION_UNMET`,
naming Calculations), whatever its output reads as. This also holds for dependent recipes, including a Remapping whose
own class description reads none of those calculations, and for asset exports through the existing readiness check.
Repair restores the chain. Descriptions remain available wherever they can be established; it is execution readiness
that carries the configuration refusal. Calculations and Output bands mark their
toolbar buttons and the items concerned, with the reason as their tooltip. The toolbar buttons judge the recipe as
applied; Output bands' rows judge its draft by the same checks, the rest of the recipe as applied, so a repair made in
the panel clears its rows before Apply, and nothing applied holds Apply back. An output whose image no longer exists is
listed in Output bands as it was saved, marked, to be removed; it offers no bands to add. Deliberately unselecting an
input band, or removing an input or calculation, removes its outputs ([Inputs](#inputs)); an output image that leaves
without bands is kept, marked on its row and on Output bands, until it is given a band or removed. Saved `invalid`
flags from earlier versions are ignored.

Draft calculation validation is local to the calculation being edited: expressions use the editor's lint, and
functions use the shared `CALCULATION_REFERENCES` rule and `calculationItem` scope. A function's Apply is disabled
while any selected reference is invalid, or no bands are selected. Another saved calculation's failure does not
prevent applying a valid repair here.

The function editor shows available choices together with all draft selections. An unavailable selected band remains
as a red, removable chip with the shared diagnostic as its tooltip. A removed input or calculation retains a group
under its saved name, with its selected chips and the standard row-error indicator. Remove a chip individually or
use the group's Remove all action; unavailable selections are never offered by Add or Add all. Changing another
selection preserves the references kept, including `imageSource` and other metadata. Selection changes order available
bands by configured input/calculation order, as before, preserving the behavior of `first` and `last`; missing references
follow them in their existing relative order. Opening neither reorders selections nor writes an applied calculation;
draft changes and Cancel leave applied findings and gates unchanged.

Groups and diagnostics follow current configuration while the editor is open. Matching uses input/calculation identity
and physical band name, just as shared readiness does, so regenerating a band's internal ID alone does not invalidate
its chip. Restoring a configured band clears the existing chip's error. The source-recovery flow above reconnects a
returning source before the calculation is reopened; no chip needs to be removed and added again. This editor work
neither restores deleted calculations nor changes the source-recovery identity/name policy.

After a change, the sync derives each expression's bands again, in order, from the calculations before it as just
derived, but only where everything it reads is met. One that is not keeps the bands it was derived with, and with them
the names its outputs were given. Renamed inputs, calculations and bands are still renamed in expressions, used bands,
outputs and visualizations.

Whether an input's bands exist in the asset or recipe it is taken from is judged by its output description
([Output](#output)), not by calculation-reference checks. Configured inputs and calculation bands are read from the
model, independently of source evidence: pending or failed source loading never fabricates a missing reference.
Descriptions still need their normal observations; a known calculation failure can block execution before those
observations succeed. The editor and synchronization reuse the same analyzer and scope rules, with the existing
JavaScript grammar and `jsep` versions pinned in the shared package. No new parser or validity flag is introduced.

Compatibility: asset exports and dependent recipes with broken calculation references are now refused
deterministically with `INVALID_CALCULATION`, even if source observations succeed. Output-selection rules beyond the shared checks already in
place remain GUI-local. Drive/workspace exports and other backend routes have not gained new checks in this packet.

The editor marks an input found to lack a band it includes: its row in Input imagery says some of its bands are
unavailable, to be reviewed in it, and the Input imagery toolbar button that some inputs' are; the input's editor names
the bands, beside each, from its own read of the source ([Inputs](#inputs)). The finding is the output read's as it
stands - the `MISSING_INPUT_BAND` diagnoses this recipe owns, never an upstream recipe's - located in the configuration
as it is now and shown on the input with that `imageId`, through the requirement it shares with Stack
(`panels/inputImagery/inputImageryRequirements.js`), read as any requirement an output read judges
(`sourceRequirements.js`). While it stands, Retrieve is disabled and refused at submission (`CONFIGURATION_UNMET`,
naming Input imagery), and previews - here and on other recipes' maps - are not requested or are withdrawn; repair
restores them. While the read is pending or unavailable nothing is marked, and Retrieve waits, as for any such
requirement; a later read establishing it again marks it again. The marks change nothing: selections, expressions,
derived bands, output names and visualizations stay as configured. A band an input's source no longer has is not
replaced or removed: upstream disappearance keeps the selection, the outputs passed through from it, the expressions
reading it and their output names, marked until the source has the band again or the user repairs it. The editor
watches its output for as long as it is open (`selectedSource.jsx`), the loading shared with its map layer and
Retrieve, so with its layer hidden it still describes the output - observing its running image and its inputs - where
nothing else would.

Not marked by this: an input's other description failures, an edit before it is applied - the panels keep their own
validation - and anything the execution boundary would recheck. Where the description refuses the configuration
itself - output names repeated, or nothing output - before reading any input, that refusal is what every consumer has,
at once. The editor alone also reads the inputs it names, once, loading any recipe it reads that the session does not
hold (`EXPLAIN`, `recipeOutput.js`), and marks the inputs that reading finds lacking a band. While that reading is
pending, or where it fails, only the refusal is marked; it never delays the refusal, and nothing it could not read is a
diagnosis. Where no input could be read, the reading is retried like any failed read and not kept once the editor
closes. A layer, Retrieve or Task export reads nothing to explain it.

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
| no output bands | refused, `NO_OUTPUT_BANDS`, observing nothing |
| two final names alike | refused, `DUPLICATE_BAND_NAME`, observing nothing |
| running image not yet observed, or its observation failed | nothing offered: needs evidence, or unavailable |
| running image carrying other names, or another order | refused, `CONFLICTING_OBSERVATION` |
| running image not reporting a band's dimensionality | refused, `INCOMPLETE_IMAGE_OUTPUT` |
| an included band its input's description does not hold | refused, `MISSING_INPUT_BAND` where it is included, whether or not a calculation reads it and though the running image cannot be observed |
| an input that cannot be described | refused or unavailable as that input is, never `MISSING_INPUT_BAND` |
| an input not yet read, or whose read failed | nothing offered: needs evidence, or unavailable |

Execution selects every band an input includes, so Earth Engine fails to build an image including one its input lacks,
and observing that image fails with it. So the inputs are described too, both readings asked for before either is
tested, and a band an input's current description does not hold is refused where it is included, its recipe and field
path kept through nested recipes - never judged against the band list copied when the input was selected. Each input is
held to its whole description, as Stack and Masking hold theirs: Band Math is not described while an input is not, even
where Earth Engine would build what it selects. That refuses what used to export:

- an input reporting no dimensionality for any of its bands, included or not (`INCOMPLETE_IMAGE_OUTPUT`) - every band
  of the assets `bandMathOutputBands.mjs` reads reports it, which shows the usual case, not that it cannot happen;
- an input refused for its own configuration, such as a Band Math naming two output bands alike, which Earth Engine
  would build with the second renamed (`DUPLICATE_BAND_NAME`), or a Stack or BAYTS recipe its declaration refuses.

The refusal reaches every route that reads the description: Retrieve, whatever the destination, Task's asset export,
previews on every map, and recipes reading Band Math as a source. Task's Drive and SEPAL exports describe nothing, so a
model submitted to them directly is not checked: Earth Engine still refuses a missing band there, and still builds what
the description refuses.

Each input is asked for the bands it includes as the physical bands it should return (`withOutputBands`), so an
input whose own selection means something else - CCDC's names the measures to fit - still returns those bands. Asked
for no bands or an empty selection, Earth Engine builds every configured output band; a selection returns exactly
the bands selected, in the order selected. The catalogue answers the configured names without building anything.

## Open issues

Shared calculation-reference validation and automatic recovery of preserved input references are implemented.
Deleted output selections and their custom names still require a separate retention decision. See the
[validation and source recovery roadmap](../design/recipes/source-resolution.md#validation-and-source-recovery-roadmap-2026-10-15)
for the audit evidence, completed packets and remaining boundaries.

- **Earth Engine renames a repeated output name.** Output images are concatenated, so a second `x` is built as `x_1`.
  The declaration refuses such a configuration; execution still builds it.

## Verification

- `modules/gee/verify/bandMathOutputBands.mjs` - on live Earth Engine: the catalogue, the running image asked for
  nothing, an empty selection and a subset out of order, the description from an observed running image, an
  expression cast over CCDC's coefficients and its segment starts passed through, observed as arrays and sampled,
  the dimensionality of casts, expressions and reducers over arrays, repeated names and no output bands as the
  declaration and Earth Engine each answer them, an input band the asset lacks as Earth Engine refuses it, the
  dimensionality of every band of representative input assets, and one pixel value.
- `modules/gui/src/app/home/body/process/recipe/bandMath/inputRecovery.test.jsx` - real input add/remove/apply with
  Sync, expressions and reducers, asset/recipe identity, save/reopen, missing bands, Cancel, source changes, name
  collisions, legacy ambiguity, whole-image reference capture, preserved calculated output names and deleted direct
  outputs staying deleted; shared findings, Retrieve and a mounted downstream Remapping preview recover together.
- `lib/js/shared/test/recipe/output/type/bandMathReferences.test.js` - applied reference, syntax, arity and band-count
  findings, self/forward references and cycles, preserved descriptions, pending/failed evidence, downstream attribution
  through Remapping and repair.
- `lib/js/shared/test/recipe/output/type/bandMath.test.js` - the declaration's outcomes, through the read and the
  observer, over asset, declared-recipe, Masking and nested Band Math inputs.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js` - Band Math's asset export, refused for a missing input band, an
  input that cannot be described or read, an input Band Math naming two outputs alike, and broken calculation references
  here and through Remapping, exported after repair.
- `modules/gui/src/app/home/body/process/recipe/bandMath/inputBandProblems.test.jsx` - the inputs and toolbar button
  marked for a missing band, Retrieve withheld and refused naming Input imagery until the band is back, and nothing
  marked for pending, failed, upstream or superseded reads, the output read shared.
- `modules/gui/src/app/home/body/process/recipe/bandMath/panels/inputImagery/inputImageBands.test.jsx` - an input opened
  unchanged, a band its source no longer has kept, marked and refused until removed, another band taken by removing and
  adding, never judged from saved bands, pending or failed reads, edits kept while reading, source switches reconciled,
  each kind's draft kept and restored with no band crossing, no band selected for the user, the bands to add offered
  once, and a band's type chosen either way, its legend open, collapsed and kept through a switch to continuous and
  back, over asset and recipe inputs.
- `modules/gui/src/app/home/body/process/sourceRuntime/outputExplanation.test.js` - a refusal explained for the editor
  alone: immediate, adding a missing input band once read, keeping one input's evidence when another fails, retried
  and checking the assets named when none could be read, a cold editor loading what it reads, cancellation once closed,
  reuse of a read that completed but never of one that failed, withdrawal on a new token, credentials or refresh.
- `modules/gui/src/app/home/body/process/sourceRuntime/assetFreshness.test.js` - a missing input band found, then
  recovered on a changed token or an explicit refresh, and an answer about an edited configuration ignored.
- `modules/gee/test/jobs/ee/bandMath/bandMathBands.test.js` - the catalogue, whatever is selected.
- `modules/gee/test/jobs/ee/image/inputBandReads.node.test.mjs` - the bands read from a CCDC input.
- `modules/gui/src/app/home/body/process/recipe/bandMath/bandMathOutput.test.js` - the common read, Retrieve's
  policies and destinations, Retrieve refused and allowed by the configuration checks, and Masking over Band Math.
- `modules/gui/src/app/home/body/process/recipe/bandMath/chainRequirements.test.js` - the configuration checks.
- `modules/gui/src/app/home/body/process/recipe/bandMath/panels/outputBands/outputBandRows.test.jsx` - Output bands:
  copies of one band, output names, orphaned outputs, and the bands offered and added - those the input includes now,
  never a band removed from it, a same-named replacement offered; saved defaults alike named apart in the draft, applied
  or cancelled, rows judging the draft while the toolbar and gates judge what is applied, around custom names and unique
  defaults, custom names alike refused, a custom name taking a saved or suggested name refused; and a name allocated
  in the panel suggested as a placeholder, kept through another output's removal, saved by Apply and shown as the value
  on reopening, and a saved name cleared to the default now available.
- `modules/gui/src/app/home/body/process/recipe/bandMath/bandMathLayer.test.jsx` - a layer on another map refused,
  withdrawn and drawn again.
- `modules/gui/src/app/home/body/process/recipe/bandMath/panels/calculations/calculation.test.jsx` - a calculation
  edited in its panel keeping its bands' identities, bands renamed alike named apart beside suffixed names of any
  length, and one saved with names alike opened unchanged and named apart once applied, its custom output name kept.
- `modules/gui/src/app/home/body/process/recipe/bandMath/panels/calculations/calculationRequirements.test.jsx` - the
  originating calculation marks, isolated draft Apply/Cancel, missing function bands and groups kept visible/removable,
  shared-scope validation, live configuration updates, metadata preservation and repairs beside another invalid calculation.
- `modules/gui/src/app/home/body/process/recipe/bandMath/sectionMarks.test.jsx` - the toolbar buttons and Output bands
  rows marked for an output image left without bands by unselecting its band, and cleared once it has one; a section
  without any output image; an output
  of an unmet calculation leaving Output bands unmarked, refused naming Calculations, beside its own problems; duplicate and invalid output names; an input
  lacking a band beside an output problem.
- `modules/gui/src/app/home/body/process/recipe/bandMath/sync/` - derivation through failure, recovery and renames,
  and the output names a rename or added band is given: apart from other outputs, custom names and earlier renames in
  the same change, a custom name kept, and a saved collision left as saved on opening.

Manual calculation-readiness check:

1. In Band Math, include `red` and `nir` from an input named `i1`, create `c1 = i1.red * 2`, and keep a valid output.
   Create a Remapping using that Band Math output and display both recipes.
2. In Band Math's input editor, remove `red`, keep `nir`, and Apply. CALC and `c1` should be marked; both previews and
   both Retrieve actions should be blocked. The Remapping should have no misleading MAP error of its own.
3. Edit `c1` to use `i1.nir * 2`. Before Apply, the saved chain stays blocked. Cancel keeps it blocked; Apply repairs it
   and restores both recipes' availability.
4. Repeat with a reducer reading `red`, or with a calculation reading another calculation that is then removed.
   Repair the reducer's selection or the expression explicitly; deleted calculations are not restored automatically.

Manual source-recovery check:

1. Start with a working Band Math: `i1` includes `red`, another input remains available, `c1 = i1.red * 2`, and a
   reducer `c2` reads `i1.red`. Output both calculations under custom names. Create and display a Remapping over one
   of those outputs. Record the expression, reducer settings and output names.
2. Remove `i1` in IMG. Both calculations and their calculated output selections/names must remain. CALC should
   identify the broken references; previews and Retrieve for both recipes should be blocked. Save and reopen.
3. Add the exact source back and select `red`. Its name should be suggested as `i1` if still free. Before Apply,
   saved references and blocking remain unchanged; Cancel must leave that state intact.
4. Add it again and Apply. Both calculations should recover without editing their text or settings, the calculated
   output names should remain unchanged, and both recipes' previews/Retrieve should become available.
5. Repeat, returning with only another band selected. The input can reconnect, but `red` findings must remain.
   Include `red` and Apply to recover. A different source with a `red` band must not reconnect anything.
6. In a separate copy, occupy `i1` before restoring its source. The occupying input/calculation must keep its name,
   expressions must remain unchanged, and unresolved reducer references must remain invalid. Repair this collision
   explicitly. Direct outputs removed with the old input must stay absent throughout all these steps.


Manual missing-selection editor check:

1. Start with a valid reducer selecting `i1.red` and `i1.nir`, and a downstream recipe. In IMG, remove `red` and
   Apply. Open the reducer: `red` must remain as a red chip with an explanatory tooltip, its group must have an
   error indicator, and Apply must be disabled. Adding/removing other chips must keep `red` until explicitly removed.
2. Remove the red chip. Apply should enable while `nir` remains; removing every chip must disable it again. Cancel
   must keep the applied error. Repeat the repair and Apply: the calculation and downstream gates should recover
   if nothing else blocks them. Alternatively, Cancel and restore `red` in IMG: the existing chip should recover.
3. Remove the entire `i1` input and reopen the reducer. Its `i1` group and selected chips must remain, marked, with
   Add disabled. Remove individual chips or use Remove all; keep at least one valid selection from another group
   before applying. Cancel must preserve the missing references and blocking. Re-add the exact source with the
   required bands and Apply: automatic recovery must keep the reducer settings and clear its chips' errors.
