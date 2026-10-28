# Recipe behavior contracts

Recipe behavior should follow the analysis the user configured. The applied settings, the editor, the available
actions and the result should agree. Reading new evidence should update what the app knows without silently
rewriting what the user chose.

This guidance comes from the [manual findings](source-resolution.md#browser-feedback-further-results-2026-10-23)
and their corrections in October 2026. It records design principles and the scope of the choices behind them.
The [correction roadmap](source-resolution.md#next-steps-from-browser-feedback-updated-2026-10-23) owns delivery
status and verification; the principles here do not imply every affected recipe already implements them.

Use this guide when designing a recipe, dependency, operation or form. The technical mechanisms remain owned by
[output products](output-products.md), [source resolution](source-resolution.md), the
[GUI runtime](gui-source-runtime.md), [freshness](source-freshness.md) and
[visualizations](visualizations.md). These principles do not require another validation framework.

## What the manual findings exposed

The findings were several different kinds of problem. Treating all of them as missing validation would preserve
some undesirable behavior and add checks around it.

| Kind | Examples | Design response |
| --- | --- | --- |
| Implementation defect | A chart built in a hidden panel; an empty missing-band warning; opening an editor offers Apply | Correct lifecycle, data handling or initialization while preserving the intended interaction. |
| Missing operation prerequisite | PyEO accepts a Classification with several input images, then fails during execution | Declare the prerequisite and present the same diagnosis before the action runs. |
| Unspecified product policy | A native chart can compute while the selected Classification is broken | Decide what a valid configured analysis means; computational possibility alone does not decide the interaction. |
| Unclear ownership or meaning | Change Alerts overwrites overrides; reused samples depend on the Provider's selected features | Establish who owns each setting and each part of the computation, then align execution and validation. |
| Incomplete workflow | An item error has no editor explanation; an error suggests a repair the field cannot perform | Design discovery, explanation, repair and recovery together. |

The generalized resolver can answer whether declared requirements hold against available evidence. It cannot infer
why a dependency was selected, which settings should follow it, or whether a user would expect native output to
remain available. Those are behavior contracts to define before choosing declarations or UI mechanisms.

## Define the behavior before the mechanism

Before implementation, answer these questions in the change description. A small change can answer them in a short
paragraph; a dependency or asynchronous workflow usually also needs a state table.

1. **Promise:** what analysis has the user configured, and which selections are essential versus optional? State
   validity policy explicitly rather than inferring it from whichever outputs can happen to compute.
2. **Ownership:** who owns each effective value: this recipe, its source, a user-editable draft, or current evidence?
   State when defaults are proposed, what may change on refresh, and what Cancel leaves untouched.
3. **Authority:** which shared rule decides each prerequisite, and which type declaration applies it? Choices,
   validation and execution use that same semantic decision, including units, masks and feature transformations.
4. **Entry points:** inventory every way the computation starts: normal and alternate layers, charts, Retrieve and
   each server/export route. Identify its common analysis prerequisites plus any operation-specific requirements,
   and the point where they are enforced before product work. Include direct requests and reopening saved recipes.
5. **State and repair:** write the response to confirmed invalidity, pending evidence, unavailable evidence and
   repair. Name the repair field, what closes or remains open, what is disabled, what is cancelled and what choices
   survive. A description of available bands alone cannot authorize computation.
6. **Commit boundary:** what accepts Apply or Run from current state, before saving settings, remembering a
   destination, submitting work or closing the panel? Buttons, keyboard submission and server calls must agree.
7. **Timing:** what happens on upstream edits, late answers, replacement, deselection, unacknowledged saves and
   hidden tabs? Preserve ownership and user intent, release watches with their owner, and keep shared preparation
   outside per-scene work.
8. **Proof:** test opening an already-invalid recipe and the working -> invalid -> repaired journey, plus pending
   and unavailable states and submission before re-render. Exercise representative callers of a shared mechanism;
   establish both refusal before product work and a working control. State what still needs a browser or live test.

State policy changes explicitly. A new requirement can enforce a product decision as well as an execution need;
the reason matters when deciding where to put it and which apparent bypasses are intentional.

Use this short brief in implementation prompts and reviews; expand only the parts the change affects:

```text
User promise and mandatory selections:
Value owners and allowed updates:
Shared rules/declarations and affected entry points:
Invalid / pending / unavailable / repaired behavior:
Acceptance before commit and asynchronous lifetime:
Acceptance tests, valid controls and remaining live checks:
```

Pause design review when a proposed fix introduces blue information text for an error, a type-name exception in a
generic component, another readiness flag/cache, copied validation logic, or background writes to editable settings.
These are prompts to examine ownership and the shared contract, not automatic prohibitions. Before calling a
shared fix complete, check the entry-point inventory and remove the old decisions it supersedes. A test proving
that old code differs is useful only after the intended behavior has been agreed.

## Declare validity for the operation and the configured analysis

Separate three questions:

- What output or capability can this source provide?
- What configuration and evidence does this operation require?
- What does the product policy require of the analysis the user selected?

Start with the promise of the selection: a source chosen as a classifier must supply a usable classifier; a source
chosen for training data supplies samples rather than its own classified image. Weaker, optional or metadata-only
uses need an explicit contract instead of inheriting meaning from whichever code path happens to execute.

For Time Series and CCDC, the S3 direction makes a selected Classification part of the configured analysis:
an unusable selection holds native and classified chart/retrieval operations, including count outputs, until
repair or explicit deselection. Native execution still need not train. This is a scoped policy decision, not a
universal rule that every reference must produce its full image before any consumer can run.

Declare such a policy once, as the analysis prerequisites of the type, rather than copying it into each operation.
Every entry point to the analysis - its image and layers, named map products, charts and Retrieve - is then held to
it through the same readiness, and an operation can add requirements but not weaken it. A product may still describe
its bands cheaply from configuration: description is not authorization, and judging a product's prerequisites must not
require describing or building the canonical image. A type that declares no prerequisites keeps each product's own
semantics.

An optional feature has a different contract. PyEO with Require drop off does not require a drop index. With it on,
the index must be available. Turning it off can repair that optional requirement, but cannot repair an incompatible
Classification or an unsupported number of input images.

Actions consume applicable shared requirements, not the color of SRC or another toolbar button. A pixel chart
must not inherit unrelated image-export requirements merely because an image-output read is convenient. Direct
pixel operations can replace the consumer AOI with the selected point while referenced imagery retains its own AOI.

Inventory client and server callers when changing the policy. Enforce guards before product work at execution
boundaries; keep known unguarded routes explicitly recorded until migrated. A client hold alone does not establish
server enforcement. Client-assembled settings and omitted recipe types must not provide a way around a guard.

## Give each effective value one owner

| Value | Authority | Expected behavior |
| --- | --- | --- |
| Applied configuration | The recipe's applied model | It describes the analysis that operations and section marks judge. |
| Unapplied edit | The editor's candidate | It can differ from the model until Apply; Cancel leaves the model unchanged. |
| Current source facts | The resolved record or runtime evidence | Refresh facts and revalidate; a copied UI snapshot is not authority. |
| Setting that must match a source | The source's effective value | Show the value as read-only with its ownership clear; execution uses that same value. |
| Independently editable consumer setting | The consumer | Preserve it through refresh and unrelated source edits. Copying new values is an explicit form action. |

Decide which settings genuinely must match by tracing the algorithm. A source edit is not permission to overwrite
an entire group of consumer settings. Disabling an input while continuing to use a stale copied value does not
establish ownership.

Defaults are proposals at a defined user action, not a continuous synchronization rule. A late proposal must not
overwrite edits. Change Alerts seeds consumer-owned monitoring defaults only at the first Reference Apply during
new creation (`!ui.initialized` and no previously applied reference). Apply, Enter and wizard Next use current,
authorised candidate facts and publish the reference and defaults atomically. Later reference changes, reopen,
Refresh and producer edits never reseed; Cancel writes nothing. The separate "Use reference settings" action was
dropped on 2026-10-27: its limited convenience does not justify another potentially confusing copying control.

Change Alerts derives required processing matches from the actual segment producer, with its execution defaults,
or from asset metadata. Recorded values are read-only; genuinely unrecorded asset values are labelled editable
consumer fallbacks. Pending and failed acquisition supply no effective fallback, and malformed governing metadata
is explained at REF and holds affected work. Displaying effective values does not change saved consumer copies or
an open editable draft. Observations now acquire these processing facts before projecting the observed collection;
that facts read neither builds segments nor loads the producer's Classification/training dependencies. Separately,
Change Alerts declares the live reference's `IMAGE_OUTPUT` readiness as an analysis prerequisite of its images,
period mosaics and pixel operations. Confirmed upstream findings mark REF and block REF Apply/Next/Done through the
normal output candidate; submission rechecks blocking candidates against current values and state. Back and Cancel
retain their existing behavior. Operation gates withdraw affected layers and open operation panels; repair releases
the holds. An exported asset remains independent of its private producer and Classification. CCDC Slice retains its
own date-format policy.

Reference ownership must preserve the normal processing-form labels and layout. Explain ownership and unverified
asset fallbacks through the standard label help tooltip. Read-only choice groups keep their selected value
highlighted. A speckle-details summary opens an editor only when a currently displayed parameter is editable;
otherwise it remains a read-only summary without an action affordance. Change Alerts does not offer the legacy
strong-scatterer toggle that its observed time-series collection does not read; the thresholds actually used by that
collection retain their reference ownership or explicit unrecorded fallback. Ordinary radar controls are unchanged.

Change Alerts' configured monitoring band is part of its alerts and analysis chart, independently of the band
currently explored in that chart. The existing monitored-measure rule must explain an incompatible choice in Sources
and hold retrieval and both chart streams. Keep missing native as well as classified selections visible in the draft;
opening must not normalize a broken applied choice into a different one or make it appear repaired. A valid draft
repair is applicable; Cancel and unsaved edits leave applied findings and gates unchanged. Confirmed invalidity closes
an open chart and cancels both streams, and repair makes reopening available without reopening it automatically.
An unrelated image-only/export requirement is not a chart prerequisite. Metadata acquisition remains separate from
computation authorization; the same semantic rule can judge current catalogue facts at a guarded server boundary.

New computing-segment exports record bounded, server-derived `processing` metadata and their date representation.
Readers distinguish complete canonical/recognised producer records from partial imports and apply precedence per
field; malformed governing metadata cannot silently fall through. This is additive: existing assets and saved
recipes are not migrated. Matching processing settings does not establish scientific comparability.

A reference must state what it reuses. Reusing an image, training points, metadata and processing settings are
different relationships. For reused training data, Provider owns its imagery, points and sampling location; the
agreed S4 direction gives Consumer ownership of the required feature definition and training transformation.
That does not authorize sampling Provider's points on Consumer's imagery or dropping Consumer's features.

For an asset reference, use evidence recorded on the asset; do not require access to its private producer recipe.

A confirmed shared finding that makes the selection being edited unusable must both explain the problem and block
committing that selection. Reference-editor errors are not decorative: Apply, wizard Next/Done and keyboard/direct
submission use the same candidate finding and recheck current values and state before writing or advancing. Valid
replacement and upstream repair release the hold. Unchanged Close, Cancel, Back and removal keep their existing exit
paths. Apply policy is never inferred from translated message text. A presentation-only declaration can opt out of
its own blocking only where an existing field rule supplies that behavior; record that reason beside the declaration.
Operation scope remains authoritative: Phenology analysing a native band does not acquire a classifier requirement.

List panels that apply entries individually may declare `valuesToModel: null`. Completing their wizard step must
close or advance without serializing over those entries; optional form serialization hooks must preserve that opt-out.
AOI recipe eligibility is distinct from image-input eligibility: the GUI's optional `geometrySource` declaration
defaults to `imageSource`, and CCDC opts into geometry selection while remaining excluded from ordinary image inputs.
If a persisted setting or format must change, describe compatibility explicitly. Transient UI state cannot supply
a guarantee that must survive saving, reopening or importing a recipe.

## Distinguish setup, invalidity and missing evidence

| State | Feedback | Execution |
| --- | --- | --- |
| Setup not yet complete | Neutral guidance naming the actual ways to complete it; required-field feedback follows the form's interaction policy | Hold operations whose prerequisites are absent. |
| A confirmed incompatible or broken selection | An actionable error at the relevant field/item, with a section summary | Hold affected operations. |
| Evidence still being read | Checking state where explanation is needed | Wait; do not infer a missing band, empty Provider or invalid reference from an unanswered read. |
| Evidence could not be read | A distinct unavailable state and an appropriate recovery path | Hold operations requiring that evidence; do not invent a configuration finding. |
| Repaired configuration and current evidence | Clear obsolete findings and restore the applicable actions | Resume using the repaired analysis. |

The absence of a refusal is not proof of readiness. An editor that saves configuration and a button that starts a
computation may have different policies for unresolved evidence. State that policy explicitly. The current reused
training-data editor blocks confirmed findings; that does not establish a universal rule that pending candidates
may be applied in every form.

Confirmed invalidity withdraws the affected operation, including an operation panel that is already open. For Time
Series and CCDC, a broken selected Classification closes open Retrieve panels and charts, disables their opening
actions and withholds the affected layers. Explain the cause in SRC, where it can be repaired, rather than keeping
Retrieve open with another message or a Refresh action for that configuration error. Use the shared operation
lifecycle and existing readiness, without another panel-specific configuration validator.

Pending or unavailable evidence does not establish a broken configuration: an open panel may remain, with submission
held. A missing export selection or invalid destination is local to Retrieve and remains repairable there. Closing
for a configuration finding must not clear saved retrieval settings or save unsubmitted edits; use the normal panel
close semantics. Repair restores the opening action without reopening the panel automatically. Current-state
submission guards and server readiness remain necessary, because a submission can race the closing render.

Avoid using a red section mark as a generic instruction to start setup. A Classification without points can be
completed by collecting them on the map or adding a data set; Regression offers a different set of actions.
Operations requiring training remain held. Feedback for an explicitly selected empty Provider is a separate policy
question; an empty branch does not by itself establish that the Consumer's total training data is empty.

The same distinction applies to Band Math: no output chosen yet is setup guidance, while a configured output that
references a missing band or has an invalid name is an error. An empty overall output selection still holds preview
and Retrieve. Guidance must allow selecting input bands directly as outputs; creating a calculation is optional.

Presence and sufficiency are different claims. Configured points do not prove that samples survive masking, cover
the imagery or suffice for a particular classifier.

## Put feedback where the user can repair the cause

A finding can appear as a section mark, a list-item explanation and editor feedback. These are views of the same
diagnosis, with the same affected item and origin, rather than independent validators.

Choose the primary location by the meaningful repair. A collection that cannot feed the selected Classification
is explained beside Classification. A compatible source that cannot provide the enabled Require drop index is
explained in OPT, where another index or turning Require drop off can repair it.

Suppress a dependent field error when its prerequisite already makes the analysis unusable. Keep the dependent
controls visible with their values, disabled while necessary. A confirmed SRC problem does not need another
paragraph in OPT repeating it; checking or unreadable evidence may need a short status to explain disabled controls.
Independent controls remain editable.

Use one actionable explanation in a field. Appending a blue repair paragraph to an error saying only "needs
attention" creates repetition. Include useful cause and repair in the validation message. Match the control's
terminology: "Require drop" in user-facing text, even if an internal identifier says `indexGate`.

Treat blue information text introduced in response to an error as a design checkpoint. Stop and examine whether
the panel or operation should still be open, whether the user can repair the cause there, whether a prerequisite
already explains it elsewhere, and whether the message compensates for missing ownership or lifecycle behavior.
Prefer the correct lifecycle and one actionable finding over another explanatory state. This is a reason to
analyze the interaction, not a ban on neutral setup guidance, progress or genuine recovery information.

Name the actual origin of a nested problem. Scope an item editor to the item it edits; a healthy item must not show
another item's Provider error. Keep the finding's identity and path separate from its translated prose.

Distinguish a recipe's own validity from its suitability for the operation requesting it. A Classification of several
input images is valid by itself, yet its classifier cannot be applied to each image of a collection. Explain that
beside the consumer's selection as the consumer's requirement, with selecting a suitable recipe as the repair; do not
say the selected recipe "needs attention", since opening it shows nothing to repair. Where the unsuitable recipe is
further up, name the recipe that selects it as the one to review. Genuine upstream defects keep naming their origin.
Where the evidence establishes only that a use is refused, for a reason feedback cannot explain, say so neutrally; do
not fall back to claiming the referenced recipe is broken.

Repair guidance must describe an action that works in the current interface. Opening another recipe from a modal
requires correct modal ownership; a special navigation button is not a substitute for that missing contract.

## Make editing and recovery predictable

| Action | Contract |
| --- | --- |
| Open | Read and initialize without changing applied values or making the form dirty. Preserve saved names. |
| Apply | Commit a genuine edit only when the editor's validity policy allows it; button, Enter and direct form submission agree. |
| Close | Leave an unchanged item, including one with an upstream problem, without applying it again. |
| Cancel | Discard the editor's edits while preserving independently applied upstream changes. |

Evaluate submission against current state. A disabled button or the previous render's props cannot protect against
a dependency change in the same event batch. Use the existing form/candidate gate on the submission path.

A refused action is not a successful Apply. Check acceptance before committing the action form's values or closing
it. A keyboard submission while evidence is pending must leave Retrieve open with its draft edits and must not
replace the saved retrieval settings, even though no task was submitted. Button and keyboard paths share that rule.

Blocking Apply for a confirmed bad selection must leave choosing a replacement, Cancel and Close available. Removal
must remain reachable. An error must not trap the user inside the editor.

A confirmed finding that makes the selection being edited unusable must block committing that selection through
Apply, wizard Next/Done and keyboard submission. An explanation may opt out of candidate blocking only when an
identified field or form rule already refuses the same invalid state. Document that guard and test both the button
and direct submission; calling feedback "presentation only" does not establish that committing it is acceptable.
Read the shared finding and form validity, rather than inferring blocking from an error message or its color.

Refreshing a source must update offered choices and validation from current evidence. The two must not disagree
because one uses the runtime and the other uses an old UI copy. A late answer for an earlier selection must not
replace the current selection, its name or edits.

Distinguish temporary invalidity from a withdrawn capability:

- A training failure does not remove the Classification's configured output choices. Keep selections for repair.
- A saved analysis parameter that a changed reference can no longer supply should remain visible and explained;
  do not silently switch Optical to Radar or substitute a different monitoring band.
- Explicit deselection of Classification must stop a leftover UI copy offering classified outputs. Any fallback
  or removal of obsolete request selections follows the particular control's stated reconciliation policy.
- Repair clears stale findings and restores availability while preserving the user's band, index and threshold
  wherever they still have meaning.

Consistent behavior does not require every control to reconcile identically. It requires a deliberate rule for
each case, rather than whatever mutation happens to make validation pass.

## Share semantic decisions between validation and execution

Each physical or semantic constraint needs one owner. Shared declarations express when it applies; forms bind
findings to fields; the runtime acquires evidence; execution consumes the same decision. UI and routes should not
reconstruct a second validator from recipe shapes or old copied settings.
An output's name or container type alone does not establish its units, feature space or derivability.

Selection flexibility must preserve measurement meaning. Reusing training points may derive Consumer features from
Provider imagery despite a different Provider band selection, but those features still need comparable scaling,
units and processing to the imagery being classified. Check the features actually used; unrelated extra bands do
not determine suitability. A single input or a Stack wrapper is a structural fact, not proof of scientific
comparability. Enforce known constraints through shared rules and state clearly what evidence does not establish.

Use the smallest correspondence contract the computation actually needs. A classifier consumes named features;
structural compatibility by unambiguous feature names does not require proving equivalence of whole source recipes
or introducing source-role metadata. State ambiguity explicitly and use meaningful names where needed. Do not
resolve it through incidental list order, or mistake matching names for proof of matching measurement semantics.

A map product's description and permission to compute it are separate contracts. Knowing the bands of a count or
another visualization from configuration does not establish that its configured analysis is usable. State which
operation's prerequisites apply to each product and acquire them before constructing a new preview. Keep the cheap
description independent; avoid assuming that every distinct map product executes the canonical image. Cover opening
an already-invalid saved recipe as well as a working recipe becoming invalid.

Mandatory prerequisites of the configured analysis must be enforced consistently by every analysis entry point:
layers, alternate map products, charts and Retrieve. A selected Classification is such a prerequisite for Time Series
and CCDC under the agreed S3 policy. Derive this common verdict from the existing readiness rules and current records
and evidence; individual operations can add their own requirements. A product description does not authorize an
operation to bypass that verdict. Implement the shared contract rather than separate checks for each visualization
or panel, and do not introduce another validator or a stored `isValid` flag. Regression tests should exercise each
entry point against the same failure, pending and repair transitions.

Examples from the corrections:

- Producing training data and training a classifier are different operations. An empty Provider can produce an
  empty collection without being able to train its own image. Type support comes from declared operations, not
  the incidental presence of a `trainingData` array.
- PyEO's one-input restriction belongs to its shared requirements, not only a selector callback or runtime throw.
- Require drop's index can be provided or calculated from the required raw bands. Readiness, offered choices and
  execution use the same derivation decision and the source's actual output names, including Stack aliases.
- Feature names alone do not establish compatible values. Training and prediction must use the same units and
  transformation; provided indexes must not be scaled twice. Preserve masks and reference footprints too.

Assemble shared samples/training inputs once per collection computation, outside the per-scene map. Do not add a
cross-request cache merely to preserve that boundary. Counted expression construction is not evidence of how often
Earth Engine evaluates it.

Prefer stable semantic contracts to object shape or accidental instance identity. A requirement copied to extend
its operation list is still the same rule; a shared diagnostic code alone may not identify it uniquely.

When a clearer base contract makes special operations, watches or messages redundant, remove them. Do not keep a
second decision path after moving authority into declarations. Request-specific checks remain necessary where the
operation genuinely depends on the request; the S3 simplification is not a general ban on request context.

Separate recipe policy from common mechanism. PyEO's one-input restriction and CCDC's mapping of physical bands to
fitted measures are legitimate domain rules, expressed once and shared by their callers. Evidence states, readiness
enforcement, panel withdrawal, cancellation and acceptance before commit belong to common mechanisms. A type-name
branch or allowlist in a generic component is a design-review trigger: determine whether the difference belongs in
the type's declaration. Generalize repeated decisions and ownership, with representative callers proving the
contract; similar-looking code alone is not a reason to invent a framework or erase distinct operation semantics.

## Scope asynchronous work and presentation to their real lifetime

Preserve user intent across timing changes: data arriving while a tab is inactive, evidence arriving after a source
replacement, and saves completing while a form is open must not produce different analyses.

Cancel obsolete requests, release watches when their owners leave, and reject stale answers. A source made invalid
must withdraw the authority to continue the affected operation; a later repair uses current evidence. Save agreement
and source currency remain part of that decision.

Shared reads and transport boundaries own notification context. Share the answer, but deliver each subscriber's
next, error and completion in the context captured when that subscriber subscribes. Enforce this inside the private
sharing mechanism, so callers cannot accidentally omit a wrapper. Keep producer authority, operation lifetime and
dependency ancestry intact. Test concurrent subscribers and completion-driven continuations with delayed reads;
instrumentation must not add an asynchronous hop that hides the actual delivery behavior.

Draw a chart only when its container can be measured. Keep data received while hidden and display it on return
without a second request just to repair layout. Fix a shared lifecycle defect in its owning component and verify
unrelated users, rather than adding per-chart delays or unconditional rebuilding.

Size panels by meaningful views, with viewport limits and scrolling. A deliberate Optical/Radar/Planet or More/Less
change can resize a panel; background metadata should not repeatedly move the interface. The agreed CCDC sizing
direction follows that distinction. It does not require a universal fixed height.

Keep labels, ordering and keyboard behavior predictable. Human-readable labels do not change band/request identity;
adding a band with Enter should preserve the user's place in the list. These are interaction contracts, not output
schema or validation changes.

## Test the agreed user journey

Write acceptance from the intended behavior before using the current implementation as the expected result.
A witness proves a regression detects a code difference; it does not prove that the chosen policy is desirable.

Use representative transitions for the changed contract: working, newly configured, confirmed invalid, pending,
unavailable, upstream change, replacement, Cancel, repair and submission before re-render. Cover two consumers when
claiming a shared rule. For operation guards, prove refusal before product work and a successful valid control.

Test helpers must perform the same change as the user. Updating both an upstream recipe and a copied UI snapshot
hid PyEO's freshness defect. Accepting either Apply or Close hid an editor initialization defect. Assert the actual
button/state and that no unintended applied values changed.

Match evidence to the claim:

- A mounted DOM test proves lifecycle and request behavior, not that a chart visually fills its panel.
- A numeric stand-in can prove arithmetic and scaling, not Earth Engine's own evaluation or performance.
- Compare complete training rows, including their labels; independently matching each feature column can conceal
  wrong samples. Compare predictions, masks and units where the result contract requires them.
- Browser acceptance needs an actual preview/chart response or completed export with the requested data, not an
  enabled button. Repair with a complete working fixture; one point clearing an absence finding does not prove
  training succeeds.

Run checks appropriate to the change and representative unrelated users of changed shared components. Keep focused
browser rechecks after corrections and an integrated automated checkpoint at the agreed boundary. Preserve the
distinction between a reported pass, an independently observed result and an untested variant.

## Choices that still need explicit resolution

These principles narrow the decisions; they do not settle every product policy:

- How to present an explicitly selected empty Provider, especially when other data supplies points.
- What scientific comparability and additional legacy asset metadata establish beyond the implemented processing
  ownership contract. Unknown provenance must not silently acquire an invented producer snapshot.
- Whether a particular configuration editor may Apply unresolved evidence. Applying configuration and starting a
  computation must remain distinct decisions.

Keep these choices and implementation status in the correction roadmap. Do not make them implicit side effects of
a component helper, a disabled field or a cache implementation.
