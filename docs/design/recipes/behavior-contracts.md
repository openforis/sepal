# Recipe behavior contracts

Applied settings, editor feedback, available actions and computation must describe the same analysis.
New evidence updates facts without silently rewriting user choices.

These are design rules, not implementation-coverage claims. Current contracts and target designs live in
[output products](output-products.md), [source resolution](source-resolution.md),
[GUI runtime](gui-source-runtime.md), [freshness](source-freshness.md) and
[visualizations](visualizations.md). Remaining work belongs in the [roadmap](data-sources.md#remaining-work).

## Define the behavior before the mechanism

For the changed workflow, state:

| Question | Required decision |
| --- | --- |
| User promise | Mandatory selections, optional features and operation-specific needs. |
| Ownership | Authority for each value; when defaults apply; what refresh and Cancel preserve. |
| Shared rule | Pure requirement, type declaration, evidence owner and execution enforcement. |
| Entry points | Layers, named products, charts, Retrieve, direct API/export requests and saved recipes. |
| State and repair | Invalid, pending, unavailable and repaired behavior; repair field and affected actions. |
| Commit boundary | Current-state acceptance before saving, submitting, remembering destinations or closing. |
| Lifetime | Upstream edits, late answers, source replacement, unsettled saves, hidden tabs and cancellation. |
| Proof | Refusal before product work, a valid control and representative recovery journeys. |

A short change needs a paragraph; a dependency or async workflow may need a state table. Before adding a
readiness flag, cache, copied validator, type-name exception or background configuration write, identify
its owner and remove the superseded decision path. Similar-looking code alone does not justify a framework.

## Declare validity for the operation and the configured analysis

Distinguish product availability, computational requirements and configured-analysis policy. A cheap band
description does not authorize execution. Named products can have prerequisites without describing or
building the canonical image. Operations may add to their type's analysis prerequisites, never weaken them.

Time Series and CCDC treat a selected Classification as mandatory for native and classified operations,
including counts, until repaired or deselected. Native computation still need not train. Phenology retains
its conditional classified-band policy. This does not require every source to build its own full image:
a training-data Provider supplies samples, not necessarily a trainable classified result.

Optional features declare conditional needs. PyEO's Require drop needs an available index only while enabled;
disabling it does not repair an incompatible Classification or unsupported input count. Pixel charts use
their own operations and may replace the consumer AOI with the clicked point; referenced imagery keeps its AOI.

Enforce requirements at each execution boundary before its work. Inventory known unguarded routes in
[source resolution](source-resolution.md#operation-availability-and-server-coverage); a GUI hold proves no
server protection. Omitted recipe types or browser-supplied settings must not bypass a declared guard.

## Give each effective value one owner

| Value | Authority | Update policy |
| --- | --- | --- |
| Applied configuration | Recipe model | Operations and section marks judge it. |
| Unapplied edit | Editor candidate | Apply commits; Cancel leaves the model unchanged. |
| Source facts | Current authorized record/evidence | Refresh revalidates; saved UI copies are not authority. |
| Required processing match | Source's effective value | Show read-only; execution uses the same value. |
| Editable consumer setting | Consumer | Preserve on refresh and unrelated upstream edits. |

Trace which settings must match the algorithm; do not synchronize whole option groups. Defaults are
proposals at a defined action, never continuous synchronization. Change Alerts seeds consumer-owned defaults
on first creation Reference Apply only. Later replacement, refresh and reopening preserve choices; required
processing follows the producer or recorded asset evidence. Only genuinely unrecorded asset values permit
labelled editable fallbacks. Pending, failed or malformed evidence does not. See
[Change Alerts REF](source-resolution.md#change-alerts-ref) for precedence and coverage.

A reference states what it reuses: pixels, samples, metadata or processing settings. For training-data reuse,
Provider owns imagery, points, labels, scale and masks; Consumer owns the feature definition and transformation.
Never sample Provider's points on Consumer's imagery as an incidental shortcut. Assets use recorded evidence
without requiring access to private producer recipes.

List panels with `valuesToModel: null` advance/close without serializing over individually applied entries.
AOI eligibility is separate from image eligibility: GUI `geometrySource` defaults to `imageSource`, while
CCDC permits geometry selection without becoming an ordinary image input. Persisted-format changes require
explicit compatibility rules.

## Distinguish setup, invalidity and missing evidence

| State | Feedback | Operation policy |
| --- | --- | --- |
| Incomplete setup | Neutral guidance listing valid completion paths. | Hold unmet operations. |
| Confirmed broken/incompatible choice | Actionable field/item error and section mark. | Withdraw affected operations. |
| Pending evidence | Checking indication when useful. | Wait without inventing a finding. |
| Unavailable evidence | Distinct failure and recovery path. | Hold work requiring that evidence. |
| Repaired | Clear obsolete findings. | Restore actions using current evidence. |

Absence of a finding is not readiness. Editors must explicitly decide whether unresolved candidates may
Apply; saving configuration and starting computation can have different policies. Configured points do
not prove post-mask sample adequacy, geographic coverage or classifier success.

A confirmed source/configuration finding closes an open affected Retrieve/chart through the ordinary
lifecycle. Pending/unavailable evidence can leave it open with submission held. Local export selection or
destination errors remain repairable in Retrieve. Closing preserves last submitted settings, discards
unapplied edits and never automatically reopens after repair. Current-state submission guards remain
necessary because closing can race submission.

An empty Classification can be completed on the map or by adding a dataset; Regression has different paths.
Band Math permits direct input outputs without calculations. Neutral setup guidance must reflect those
paths while execution remains held.

## Put feedback where the user can repair the cause

Fields, item rows and section marks present the same structured finding. Keep its code, item, model path,
recipe path and operation separate from translated prose. Explain an unsuitable classifier beside the
consumer's Classification choice; explain an otherwise compatible but unavailable Require drop index in OPT.
Suppress dependent errors while a prerequisite explains the hold, retaining disabled controls and their values.
Independent controls remain editable.

One message states cause and repair in the control's terms. Extra information text must have a distinct
purpose, such as setup, progress or recovery; it must not compensate for a misplaced error or an operation
panel that should have closed. An item editor must not show another item's failure.

Distinguish a broken producer from an unsupported use: a valid multi-input Classification can be unsuitable
as a collection classifier. Attribute that restriction to the consumer; use neutral wording for an
unexplained use refusal. Name actual upstream defects at their origin. Never invent an alternate route
through a diamond that readiness did not report.

Carry recipe IDs and names to the shared renderer; never infer identity by parsing labels. Known recipe
links use the common open/focus action and preserve the originating draft. Keep a plain-text equivalent,
keyboard/touch access and modal ownership; hidden or covered owners leave no interactive tooltip.

## Make editing and recovery predictable

| Action | Contract |
| --- | --- |
| Open | Initialize without changing applied values, saved names or dirty state. |
| Apply / Enter / wizard Next or Done | Judge the current candidate before any persistence, work or closure. |
| Close | Exit an unchanged item without applying it again, including an item with an upstream error. |
| Cancel / Back | Preserve applied configuration and independent upstream changes. |
| Remove | Remain available for repairing an invalid item. |

Confirmed unusability blocks committing that selection. Presentation-only candidate blocking may be disabled
only where an identified field/form rule already refuses it; document and test that guard. Read findings
and form validity, never message colors or translated text. A valid draft repair can Apply while another
applied item is invalid. A refused submission saves nothing and does not count as successful Apply.

Late answers cannot replace the current source, names or edits. Refresh updates choices and validation from
the same evidence. Training failures retain configured output choices; unavailable saved monitoring choices
remain visible for repair. Explicit deselection removes the authority of leftover UI snapshots. Each control
owns its reconciliation policy; repair preserves selections and thresholds wherever still meaningful.

## Share semantic decisions between validation and execution

Shared pure requirements own semantic decisions; declarations scope them, runtime acquires evidence, forms
locate findings and execution enforces them. Product names, wrapper types and matching feature names do not
prove units, encoding, derivability or scientific comparability.

Use the smallest correspondence needed by computation: unambiguous named classifier features, not whole-recipe
equivalence or incidental input order. Preserve Consumer operand order, units and normalization, Provider
sampling footprint and masks, and avoid scaling provided indexes twice. Known incompatibility is enforced;
unknown comparability remains explicit. The complete
[training-reuse contract](source-resolution.md#reused-training-data) owns matching and sampling details.

Assemble shared training inputs outside per-scene prediction. Do not introduce a cross-request cache merely
to achieve that lifetime; counted expression construction does not measure EE evaluation frequency.
A requirement extended with more operations remains the same semantic rule; a shared diagnostic code alone
may not identify it uniquely. Keep genuine request-specific checks after consolidating common prerequisites.

## Scope asynchronous work and presentation to their real lifetime

Modal ownership is inherited once from the recipe context. Application-wide login/project workflows declare
an exception; outside a recipe, application scope is the default. Tab/section navigation preserves drafts and
nested dialogs. Only the active owner's top modal handles input, including document shortcuts and portalled
popups. Preserve tab-close protection while a modal is open. Placement and non-modal map interactions retain
their own semantics. [GUI scope](gui-source-runtime.md#recipe-scoped-panels-and-navigation) owns the mechanism.

Cancel obsolete requests, release claims with their owner and reject superseded answers. Hidden tabs,
replacement and save timing must not change the analysis. Shared reads deliver next/error/complete in each
subscriber's captured async context, preserving authority and path-local ancestry inside the sharing owner.
Test delayed concurrent subscribers and completion continuations without instrumentation that masks ordering.

Charts retain data received while hidden and draw when measurable; returning should not need another request
solely to repair layout. Fix shared lifecycle defects at their owner. Panels may resize for deliberate views
such as Optical/Radar/Planet or More/Less, while background metadata must not repeatedly move controls.
Labels do not change raw request identity; keyboard additions preserve the user's list position.

## Test the agreed user journey

Acceptance follows the intended contract, not whatever the implementation currently does. Cover the relevant
working → invalid → repaired journey, saved invalid state, pending/unavailable evidence, replacement, Cancel,
and submission before re-render. A shared rule needs representative consumers and a valid control.

Helpers must perform actual user mutations without repairing copied UI snapshots. Assert exact Apply/Close
behavior and unchanged applied values. Compare complete labelled training rows rather than independent columns.

Match the evidence to the claim:

- DOM tests establish lifecycle/request behavior; browser checks establish layout, focus and actual interaction.
- Numeric stand-ins establish arithmetic; live EE checks establish graph semantics, values, masks and projections.
- An enabled action is not a successful chart/export. Use actual responses and complete working fixtures.
- A reported past pass, a newly observed pass and an untested variant remain distinct.

Run targeted checks and representative users of changed shared components. Keep temporary results and review
history in the change under review; durable coverage stays in its owning suite.

## Choices that still need explicit resolution

The roadmap retains decisions about empty training Providers, scientific comparability/legacy provenance and
whether particular editors may Apply unresolved evidence. These must not become implicit cache or helper policy.
