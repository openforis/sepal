# Band Math

Evaluates calculations over its input images - expressions, and reducers across chosen bands - and outputs a
configured selection of input and calculated bands under names of the user's choosing.

## Referenced recipes needing attention

Shared input feedback marks IMG and the exact recipe-reference row when a current readiness finding confirms an
upstream problem, naming the directly referenced recipe. The detailed diagnosis remains in that recipe. This does
not copy a local CALC error onto OUT, add marks for pending/transiently failed evidence, or change execution gates
and draft isolation. Repair clears the reference feedback with current evidence. It uses reported recipe paths;
a second route to the same dependency in a diamond graph may not be reported and is not guessed.

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

The input editor follows [Stack's shared input-editor contract](stack.md#shared-input-editor).
Band Math additionally reclaims retained band IDs at Apply when reconnecting preserved calculations, as above.
Deleted direct output selections stay deleted.

Output bands follow the bands they were copied from by id, an output band's identity being its id within its output
image. Deliberately unselecting an input band removes every output taken from it: the one copied under its id, and any a
saved recipe copied under an id no band of that image has, matched by the name of the band it was copied from, never by
the name it is output under. Output bands offers and adds only bands the input or calculation includes now, found by its
`imageId` - never the copy of its bands an output image was saved with, which can still list a band since removed - and,
by the same match, none its image already outputs; the ids that copy knows stay known, so a band replaced by a
same-named one is still offered. A choice is checked again when it is added, alone or by Add all, and added as its image
includes it then. Two outputs of one band a saved recipe holds are kept as saved. A FUNCTION calculation's band keeps
its id when the calculation is edited, so its output, and any name given to it, follows.

### Output names

`outputImages.js` allocates unique defaults in output order, reserving custom names first. A free base name
is retained; collisions take the lowest free suffix (`red`, `red_1`). Assigned defaults survive unrelated
add/remove, save and reopen. `defaultOutputName` and explicit `outputName` remain separate.

Saved names appear as values. A default allocated in the open panel is an empty field's placeholder; Apply
persists it. Typing creates an override; clearing resets only that band to its available default. Neither
operation renames another output. Final names must match `[a-zA-Z_][a-zA-Z0-9_]{0,29}` and be unique.
Rows and Apply judge the same draft rules; toolbar marks judge the applied model.

A calculation renaming several bands to the same base assigns suffixes in order, after the largest existing
suffix. Band IDs survive renaming. Synchronization updates each affected output's default against other
final names, counting earlier assignments and custom names but releasing the old names changed in that
operation. Custom overrides remain intact; unrelated outputs do not change.

Opening a saved collision among automatic names proposes distinct draft defaults; Apply commits and Cancel
discards them. Duplicate custom names remain errors. Opening alone never repairs the applied model.

## Output boundary

The final image is clipped to the first input's `getGeometry$()`, after calculation, naming and band selection.
The AOI outline and fit bounds use that same geometry. This applies to direct, expression and reducer outputs,
including single-band requests. Other inputs can supply pixels inside this boundary even where the first input
is masked, but cannot extend it. There is no separate AOI setting or fallback region.

Failed/null geometry refuses construction; EE rejects empty clipping geometry. An unbounded geometry skips
clipping because EE rejects `clip` on it. With no inputs, image construction emits nothing and direct geometry
requests fail; normal configuration gates block that state.

**Compatibility:** older computations clipped to the union of bounded input/calculation footprints. Recomputing
can remove pixels outside the first input, or remove an incidental later-input restriction when the first input
is unbounded. Interior values, masks and projections retain normal EE clipping semantics.

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

Compatibility: asset, Drive and SEPAL image exports and dependent recipes with broken calculation references are now refused
deterministically with `INVALID_CALCULATION`, even if source observations succeed. Output-selection rules beyond the shared checks already in
place remain GUI-local. Other backend routes have no such check.

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
[output contract](../design/recipes/output-products.md#declaration-and-description)): the configured output
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

The refusal reaches every route that reads the description: Retrieve, whatever the destination, Task's asset, Drive
and SEPAL exports, previews on every map, and recipes reading Band Math as a source.

Each input is asked for the bands it includes as the physical bands it should return (`withOutputBands`), so an
input whose own selection means something else - CCDC's names the measures to fit - still returns those bands. Asked
for no bands or an empty selection, Earth Engine builds every configured output band; a selection returns exactly
the bands selected, in the order selected. The catalogue answers the configured names without building anything.

Known limitations and follow-ups are tracked in the [workplan](../design/workplan.md#band-math).

## Verification

Live schema/geometry probes and their limitations are indexed in
[EE verification](../../modules/gee/verify/README.md). Automated coverage lives in:

- `lib/js/shared/test/recipe/output/type/bandMath*.test.js`: declaration and calculation-reference rules.
- `modules/gee/test/jobs/ee/bandMath/`: catalogue and geometry; `jobs/ee/image/inputBandReads.test.js`
  covers physical CCDC input selection, and `jobs/task/export/imageAssetExport.test.js` covers export refusal.
- `modules/gui/src/app/home/body/process/recipe/bandMath/`: source recovery, isolated draft repair, output
  naming/identity, missing-selection chips, section marks, downstream gates and synchronization.
- `modules/gui/src/app/home/body/process/sourceRuntime/`: explanation acquisition and asset-evidence recovery.

These suites use controlled external boundaries; browser tiles and live EE pixels need their own checks.

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


Manual output-boundary check:

1. Create two Asset Mosaic recipes from an overlapping image, with a small AOI on the first and a larger AOI on the
   second. Add them to Band Math in that order as `i1` and `i2`; include a scalar band in each.
2. Output a direct band from each, an expression such as `i2.elevation * 2`, and a mean reducer reading both inputs.
   Give the outputs distinct custom names. Display each output, especially those using `i2`: all must stop at the
   first-input outline. Values inside it, custom names and data types should remain unchanged.
3. Check a single-band display/Retrieve selection as well as the full output. Where the first input has masked pixels
   inside its AOI, the second input may still supply values; its extent must not expand the output beyond the outline.
