import _ from 'lodash'

import {CYCLIC, discoverProvider, FOUND, MALFORMED, NOT_A_SOURCE, UNRESOLVED} from '#sepal/recipe/capability/discoverProvider'
import {NEEDS_EVIDENCE, SUPPORTED, UNSUPPORTED} from '#sepal/recipe/requirement/verdict'
import {VALID} from '#sepal/recipe/source/dependencyValidity'

import {getRecipeType} from '../recipeTypeRegistry'
import {
    assetAuthority,
    assetEvidenceOfState,
    CURRENT as ASSET_CURRENT,
    EXPIRED as ASSET_EXPIRED,
    isDefinitiveFailure,
    WAITING as ASSET_WAITING
} from '../sourceRuntime/assetEvidence'
import {FAILED, PENDING} from '../sourceRuntime/evidenceRegistry'
import {recordStalenessOfState} from '../sourceRuntime/recordCurrency'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {
    IMAGE_OUTPUT,
    NEEDS_EVIDENCE as OUTPUT_PENDING,
    readRecipeOutput,
    READY as OUTPUT_READY,
    UNAVAILABLE as OUTPUT_UNAVAILABLE
} from './recipeOutput'
import {OBSERVED, sourceEdgeOf, sourceKeyOf} from './sourceEvidence'
import {evidenceSession, outdatedBasis} from './sourceEvidenceBasis'

// Whether the sources a recipe selects meet what its type declares it needs of them, as the session stands: pure and
// synchronous, starting nothing. A recipe type declares `sourceRequirements`:
//
//   {role, section: {id, label, input}, requirement, parameters: recipe => ({...}), operations, providerOperations,
//    requiredForSelection, advise}
//
// `role` names the selection by the edge the recipe already declares (directSources), and `section` the form panel the
// requirement belongs to: its id names the panel, which edits the model at that id - the section that selects the
// source where its edge lies there, otherwise one configuring something that depends on it - one section object,
// shared by every requirement in it. The section's `input`,
// where it has one, is a function of the panel's form values naming the form input - not a model location - that
// shows what the section's requirements find (recipeFormPanel.jsx); a section without one shows it only on its
// toolbar button. `advise` names the other sections whose status says, in one aggregate advisory, that this
// requirement is not met (selectedSourceStatus.js); none acquire one otherwise. `requirement` is a shared
// pure requirement (lib/js/shared/src/recipe/requirement) as the GUI reads it: {id, capability, evaluate(facts,
// parameters), describe(diagnostic)}, `capability` being the GUI side of the capability it is over - {capability,
// label, evidenceAsset(provider), factsOf(observed, assetId)} - and `describe` what its diagnoses mean, as {message,
// details}. `operations` names the Earth Engine requests that need it met: an output product's name, or PIXEL_SEGMENTS
// for the segments a pixel chart reads. `providerOperations` names those that only resolve the selection through its
// provider chain: they are refused where that chain is, and held only while its records are being read - nothing the
// requirement judges of the facts is asked of them. A request for anything else is not held. A requirement the selection
// need not meet to be applied (`requiredForSelection: false`) still gates its operations.
//
// Everything about whether evidence can be trusted is here. Each read answers its verdict (`SUPPORTED`, `UNSUPPORTED`,
// `NEEDS_EVIDENCE`) apart from the state of the evidence that verdict needs:
//
//   UNCHECKED    nothing has taken up the selection as the session holds it now: nothing watches the recipe's evidence,
//                the observation reads another source or only its records, or credentials, records, selections,
//                refreshes or tokens moved past the basis its evidence was read on
//   CHECKING     the owner is reading it - its evidence is not yet the answer of the observation its live basis belongs
//                to - or what was read awaits the authority of the asset that establishes it
//   CHECKED      current evidence was read, or the verdict needs none
//   UNAVAILABLE  the read failed, or the asset that establishes it is missing, unreadable or failing
//   EXPIRED      that asset's metadata outlived its authority
//
// The owner is the observation the source runtime keeps the recipe's evidence current by while anything watches it
// (`evidenceOwnerOf`, evidenceRegistry.js): its live basis from the runtime, its accepted evidence from the recipe
// (`ui.sourceEvidence`). Evidence counts for a selection only while the live basis passes the owner's own rule
// (sourceEvidenceBasis.js) for that selection against the session now - a basis taken for another source does not - and
// was published by the observation that basis belongs to. Only the asset that establishes the capability (`evidenceAsset`) must be authorized (assetEvidence.js):
// an unchanged token says nothing through a known mutation, an expired check or a failing one, while a mask or an AOI
// failing says nothing about it.
//
// A selection whose configured chain cannot lead to the capability is refused from the held records alone, with no
// owner; one not made at all is refused as missing. Where the session does not hold the chain's records, whether it can
// lead there is known once the owner has read them (`providerChain`): checking while it reads them, unavailable if it could not.
//
// A type may also declare requirements over its own configuration, judged from facts the recipe itself holds:
//
//   {id, section, requirement, localFacts: recipe => facts, items: facts => [...], parameters, operations}
//
// `localFacts` supplies the facts in place of a role and its evidence, so such a read is always CHECKED and selects
// nothing; `requirement` is {id, evaluate(facts, parameters), describe(diagnostic)}. Where the facts concern several items
// of a section - the calculations of a list, say - `items` enumerates them: [{id, path, label, facts, prerequisites}],
// `id` stable across edits, `path` where the item lies in the model, and
// `prerequisites` the reads it depends on, [{declaration, item}] by declaration id and item id. Without `items` the
// facts are judged once, for the section.
//
// A local read keeps its own verdict (`ownVerdict`) apart from its effective one (`verdict`): a read met itself, whose
// prerequisites are not all met - or not read at all - is UNSUPPORTED (`PREREQUISITE_UNMET`), and a read that is not
// keeps its own diagnosis. `unmetPrerequisites` names them either way, so what a prerequisite's own read says need not
// be repeated, while the operations it holds stay held. Evidence acquisition never reads these, and they bind no form
// panel: they judge the configuration applied (recipeFormPanel.jsx).
//
// And requirements over its configuration that its own output read judges - what the type's shared declaration refuses
// its configuration for, over what its sources are described to provide:
//
//   {id, section, requirement: {id, describe}, outputDiagnostics: {codes, itemOf}, editor, summary, operations}
//
// `codes` are the refusals of the recipe's IMAGE_OUTPUT it states, and `itemOf(diagnostic, recipe, {recipeNames})` the
// item of the section each is about - {id, path, label}, as a local item, and whatever `describe` needs of it - or null.
// Each item a refusal this recipe owns is about is read as a local read is, unmet, its diagnosis `{code: id,
// diagnostics, item}` for `describe`, and its section says them all in `summary(reads)` where it is given
// (selectedSourceStatus.js); nothing is read of what the output read has not established, pending or failed: the
// refusal is the evidence, and the output read
// acquires it (recipeOutput.js), whatever these say of the operations waiting on it. `editor` - {panel, input,
// candidate(recipe, model)} - binds the panel editing one item, judged before it is applied by the same refusals of
// the recipe its candidate builds from that item alone (outputCandidate.js). The output read lies below this: it never
// asks what these say.
//
// Where that read holds no refusal a declaration states but is no description either - still being read, unreadable,
// refused for something else, or over dependencies known unsound - one read without an item says so for the
// declaration (`outputState`): it holds the declaration's operations as the output read does, waiting while it is
// read, and marks nothing, no selection being known wrong. What an observed input establishes is known once the work
// observing it settles, which waits for every observation it requested: until its siblings answer or fail, its finding
// is not shown, and the operations wait. The reads of a recipe are reused while its output read
// says the same, so every consumer shares them.

export {NEEDS_EVIDENCE, SUPPORTED, UNSUPPORTED}

export const UNCHECKED = 'UNCHECKED'
export const CHECKING = 'CHECKING'
export const CHECKED = 'CHECKED'
export const UNAVAILABLE = 'UNAVAILABLE'
export const EXPIRED = 'EXPIRED'

export const MISSING_SOURCE = 'MISSING_SOURCE'
export const NOT_A_PRODUCER = 'NOT_A_PRODUCER'
export const UNFILLED_ROLE = 'UNFILLED_ROLE'
export const CYCLIC_SOURCE = 'CYCLIC_SOURCE'

// What Retrieve is told when a requirement is not known to be met: {wait, code, section}.
export const SOURCE_MISSING = 'SOURCE_MISSING'
export const SOURCE_PENDING = 'SOURCE_PENDING'
export const SOURCE_UNCHECKED = 'SOURCE_UNCHECKED'
export const SOURCE_UNAVAILABLE = 'SOURCE_UNAVAILABLE'
export const SOURCE_EXPIRED = 'SOURCE_EXPIRED'
export const SOURCE_UNSUITABLE = 'SOURCE_UNSUITABLE'
// What Retrieve is told when a requirement over the recipe's own configuration is not met.
export const CONFIGURATION_UNMET = 'CONFIGURATION_UNMET'

export const PREREQUISITE_UNMET = 'PREREQUISITE_UNMET'

// The operation of reading the segments at a pixel, as a segment chart does.
export const PIXEL_SEGMENTS = 'PIXEL_SEGMENTS'

// {declaration, selected, acquisition, providerChain, verdict, assetId?, missing?} for each requirement the recipe's type declares.
// Local reads, in their declaration's place, are {declaration, local: true, item, acquisition, providerChain, ownVerdict,
// verdict, unmetPrerequisites}, and so are the reads of requirements its output read judges, with `output: true`. Those
// are read from the answers the source runtime holds (`heldFor`), which a type declaring them requires.
export const readSourceRequirements = ({state, recipe, evidenceOwnerOf, heldFor, now}) => {
    const declarations = getRecipeType(recipe.type)?.sourceRequirements || []
    const local = readLocalRequirements(recipe)
    const output = readOutputRequirementsOfState({state, recipe, heldFor})
    // Without a requirement over a selected source, the reads are the recipe's local and output reads alone, each
    // reused while unchanged, and so is their list.
    if (!declarations.some(({role}) => role)) {
        const previous = OWN_READS.get(recipe)
        if (previous?.local === local && previous.output === output) {
            return previous.reads
        }
        const reads = declarations.flatMap(declaration => [...local, ...output].filter(read => read.declaration === declaration))
        OWN_READS.set(recipe, {local, output, reads})
        return reads
    }
    return declarations.flatMap(declaration => {
        if (isLocal(declaration)) {
            return local.filter(read => read.declaration === declaration)
        }
        if (isOutput(declaration)) {
            return output.filter(read => read.declaration === declaration)
        }
        return [readSourceRequirement({state, recipe, declaration, evidenceOwner: evidenceOwnerOf?.(recipe.id), now})]
    })
}

// Whether a type declares requirements its recipes' output read judges.
export const isJudgedByOutput = type =>
    (getRecipeType(type)?.sourceRequirements || []).some(isOutput)

// The reads of the requirements the recipe's output read judges, from that read: one for each item a refusal it owns,
// of a code a declaration states, is about.
export const readOutputRequirements = ({recipe, output, recipeNames = NO_NAMES}) => {
    const said = {status: output.status, validity: output.dependencyValidity?.status || null, diagnostics: output.diagnostics || []}
    const byNames = OUTPUT_READS.get(recipe) || new WeakMap()
    OUTPUT_READS.set(recipe, byNames)
    const previous = byNames.get(recipeNames)
    if (previous && previous.status === said.status && previous.validity === said.validity
        && _.isEqual(previous.diagnostics, said.diagnostics)) {
        return previous.reads
    }
    const reads = (getRecipeType(recipe.type)?.sourceRequirements || []).filter(isOutput)
        .flatMap(declaration => readOutputDeclaration({recipe, output, recipeNames, declaration}))
    byNames.set(recipeNames, {...said, reads})
    return reads
}

// By recipe, then by the names they were read with: a Retrieve reading without names and a toolbar with them keep
// their own.
const OUTPUT_READS = new WeakMap()

const OWN_READS = new WeakMap()

const NO_NAMES = Object.freeze({})

const NO_READS = Object.freeze([])

// The same, over the recipe's IMAGE_OUTPUT as the session and the runtime answer it now - asked to explain a refusal
// (recipeOutput.js), so a refusal the session establishes alone still has what it does not hold read: one input found
// lacking a band never keeps another's description from being read, and judged.
export const readOutputRequirementsOfState = ({state, recipe, heldFor}) => {
    if (!(getRecipeType(recipe.type)?.sourceRequirements || []).some(isOutput)) {
        return NO_READS
    }
    if (!heldFor) {
        throw new Error(`Requirements of ${recipe.type} are judged by its output read, which needs the runtime's answers (heldFor)`)
    }
    const loadedRecipes = state.process?.loadedRecipes || {}
    const output = readRecipeOutput({
        recipe,
        product: {name: IMAGE_OUTPUT},
        graph: buildMapDependencyGraph({recipe, loadedRecipes}),
        heldFor,
        currency: recordStalenessOfState(state),
        assetEvidence: assetEvidenceOfState(state),
        explain: true
    })
    return readOutputRequirements({recipe, output, recipeNames: recipeNamesOf(state)})
}

// Why the requirements the recipe's output read judges refuse an operation, from what that read establishes of an item:
// as configurationGate.
export const outputRequirementGate = ({recipe, output, operation}) => {
    const read = readOutputRequirements({recipe, output}).find(read => read.item && reasonFor(read, operation))
    return read
        ? {...reasonOf(read), section: read.declaration.section.label, withdraw: true}
        : null
}

// The reads of the requirements over the recipe's own configuration alone: they need nothing of the session.
export const readLocalRequirements = recipe => {
    if (!LOCAL_READS.has(recipe)) {
        const declarations = (getRecipeType(recipe.type)?.sourceRequirements || []).filter(isLocal)
        LOCAL_READS.set(recipe, withPrerequisites(declarations.flatMap(declaration => readLocal(recipe, declaration))))
    }
    return LOCAL_READS.get(recipe)
}

// The identity of a local read: its declaration's id and its item's.
export const readKey = ({declaration, item}) => keyOf(declaration.id, item?.id)

// Why a request for an operation over the recipe may not start, by what it selected, if anything: blocks before waits.
// Nothing an owner is not reading is waited for: no reader can say whether anything will. Retrieve refuses on any of
// them; a new request for a preview or a chart is held (requestGate).
export const sourceRequirementGate = ({state, recipe, operation, evidenceOwnerOf, heldFor, now}) =>
    firstReason(requirementReasons({state, recipe, operation, evidenceOwnerOf, heldFor, now}))

// Whether a new Earth Engine request for an operation over the recipe may start now: null when it may, otherwise
// {wait, withdraw, code, section, read} - `read` the requirement's read behind it, as far as the operation is held to it. While a requirement is not known to be met nothing new is requested, and what is
// already drawn stays - checking is no reason to change it. A source found missing or unsuitable, or a configuration
// found not to meet its requirements, also withdraws it.
// Wherever the recipe is shown, the consumer requesting the operation watches the evidence it needs (sourceRuntime.js),
// so what is held is being read.
export const requestGate = ({state, recipe, operation, evidenceOwnerOf, heldFor, now}) =>
    requestGateOf(readSourceRequirements({state, recipe, evidenceOwnerOf, heldFor, now}), operation)

// The same, judged from the recipe's reads (readSourceRequirements), for a caller asking more than one question of them.
export const requestGateOf = (reads, operation) =>
    firstReason(reasonsIn(reads, operation)
        .map(reason => ({...reason, withdraw: WITHDRAWING.includes(reason.code)})))

// Why the recipe's own configuration refuses an operation, if it does: {wait, withdraw, code, section, read}, decided
// from the recipe alone, whatever its sources or its output read as.
export const configurationGate = ({recipe, operation}) => {
    const read = readLocalRequirements(recipe).find(read => reasonFor(read, operation))
    return read
        ? {...reasonOf(read), section: read.declaration.section.label, withdraw: true}
        : null
}

// What the requirement an operation over the recipe is held to establishes, where it is met - the measures a segment
// chart can plot, say: its SUPPORTED verdict, or null.
export const establishedFor = ({state, recipe, operation, evidenceOwnerOf, heldFor, now}) =>
    establishedIn(readSourceRequirements({state, recipe, evidenceOwnerOf, heldFor, now}), operation)

// The same, judged from the recipe's reads (readSourceRequirements).
export const establishedIn = (reads, operation) => {
    const read = reads.find(({declaration, local}) => !local && declaration.operations?.includes(operation))
    return read?.verdict.status === SUPPORTED ? read.verdict : null
}

// An operation that needs the requirement met is answered by its whole read. One that only resolves the source through
// its provider chain is refused only where that chain is, and waits only for its records: what the requirement judges
// of the segments is not its concern.
const requirementReasons = ({state, recipe, operation, evidenceOwnerOf, heldFor, now}) =>
    reasonsIn(readSourceRequirements({state, recipe, evidenceOwnerOf, heldFor, now}), operation)

const reasonsIn = (reads, operation) => reads
    .map(read => reasonFor(read, operation))
    .filter(Boolean)
    .map(reason => ({...reason, section: reason.declaration.section.label}))

const reasonFor = (read, operation) => {
    const {declaration, verdict, providerChain} = read
    if (declaration.operations?.includes(operation)) {
        return verdict.status === SUPPORTED ? null : reasonOf(read)
    }
    if (!declaration.providerOperations?.includes(operation)) {
        return null
    }
    if (isProviderRefusal(verdict)) {
        return reasonOf(read)
    }
    return providerChain === CHECKED ? null : reasonOf({...read, acquisition: providerChain, verdict: NEEDS})
}

const WITHDRAWING = [SOURCE_MISSING, SOURCE_UNSUITABLE, CONFIGURATION_UNMET]

const reasonOf = read => ({...retrieveReason(read), declaration: read.declaration, read})

const firstReason = reasons => reasons.find(({wait}) => !wait) || reasons[0] || null

const isProviderRefusal = verdict =>
    verdict.status === UNSUPPORTED && PROVIDER_REFUSALS.includes(verdict.diagnostic.code)

const PROVIDER_REFUSALS = [MISSING_SOURCE, NOT_A_PRODUCER, UNFILLED_ROLE, CYCLIC_SOURCE]

const readSourceRequirement = ({state, recipe, declaration, evidenceOwner, now}) => {
    const edge = sourceEdgeOf(recipe, declaration.role)
    const selected = edge?.reference || null
    const selects = edge?.path[1] === declaration.section.id
    if (!selected) {
        return {declaration, selected, selects, acquisition: CHECKED, providerChain: CHECKED, verdict: unsupported({code: MISSING_SOURCE})}
    }
    const {capability} = declaration.requirement
    const session = {...evidenceSession(state), now}
    const discovery = discoverProvider(selected, new Map(Object.entries(session.loadedRecipes)), capability.capability)
    if (discovery.status !== FOUND && discovery.status !== UNRESOLVED) {
        return {declaration, selected, selects, acquisition: CHECKED, providerChain: CHECKED, verdict: unsupported(discoveryDiagnostic(discovery, selected))}
    }
    const owner = evidenceOwner && !outdatedBasis(evidenceOwner.basis, {recipe, sourceKey: sourceKeyOf(selected), session})
        ? evidenceOwner
        : null
    const providerChain = discovery.status === UNRESOLVED ? chainAcquisition(owner) : CHECKED
    const read = (acquisition, verdict, facts) => ({declaration, selected, selects, acquisition, providerChain, verdict, ...facts})
    if (!owner?.observes) {
        return read(UNCHECKED, NEEDS)
    }
    const observed = recipe.ui?.sourceEvidence
    if (observed?.observationId !== owner.observationId) {
        return read(CHECKING, NEEDS)
    }
    const assetId = discovery.status === FOUND ? capability.evidenceAsset(discovery.provider) : null
    const asset = assetId ? assetAuthorityOf(session.assetEvidence[assetId], now) : null
    if (observed.status !== OBSERVED) {
        return read(UNAVAILABLE, NEEDS, assetId && {assetId, ...asset?.facts})
    }
    if (asset) {
        return read(asset.acquisition, NEEDS, {assetId, ...asset.facts})
    }
    if (discovery.status === UNRESOLVED) {
        return read(UNCHECKED, NEEDS)
    }
    const verdict = declaration.requirement.evaluate(capability.factsOf(observed, assetId), declaration.parameters?.(recipe) || {})
    return verdict.status === NEEDS_EVIDENCE
        ? read(UNCHECKED, NEEDS)
        : read(CHECKED, verdict.status === UNSUPPORTED
            ? unsupported({...verdict.diagnostic, selected, chain: discovery.chain})
            : verdict)
}

const NEEDS = Object.freeze({status: NEEDS_EVIDENCE})

// Where the session does not hold the records the provider chain runs through, what the owner's reading of them says.
const chainAcquisition = owner => {
    if (owner?.records === PENDING) {
        return CHECKING
    }
    return owner?.records === FAILED ? UNAVAILABLE : UNCHECKED
}

const discoveryDiagnostic = ({status, chain, at}, selected) => ({
    code: DISCOVERY_CODES[status] || NOT_A_PRODUCER,
    selected,
    chain,
    ...(at && {at})
})

const DISCOVERY_CODES = {
    [MALFORMED]: UNFILLED_ROLE,
    [CYCLIC]: CYCLIC_SOURCE,
    [NOT_A_SOURCE]: MISSING_SOURCE
}

const retrieveReason = ({local, acquisition, verdict}) => {
    if (local) {
        return {wait: false, code: CONFIGURATION_UNMET}
    }
    if (verdict.status === UNSUPPORTED) {
        return {wait: false, code: verdict.diagnostic.code === MISSING_SOURCE ? SOURCE_MISSING : SOURCE_UNSUITABLE}
    }
    return {
        [CHECKING]: {wait: true, code: SOURCE_PENDING},
        [UNAVAILABLE]: {wait: false, code: SOURCE_UNAVAILABLE},
        [EXPIRED]: {wait: false, code: SOURCE_EXPIRED}
    }[acquisition] || {wait: false, code: SOURCE_UNCHECKED}
}

// Null while the asset's metadata authorizes what was read from it.
const assetAuthorityOf = (entry, now) => {
    const authority = assetAuthority(entry, {now})
    if (authority === ASSET_CURRENT) {
        return null
    }
    if (authority === ASSET_WAITING) {
        return {acquisition: CHECKING}
    }
    return authority === ASSET_EXPIRED
        ? {acquisition: EXPIRED}
        : {acquisition: UNAVAILABLE, facts: {missing: isDefinitiveFailure(entry)}}
}

const unsupported = diagnostic => ({status: UNSUPPORTED, diagnostic})

const isLocal = declaration => Boolean(declaration.localFacts)

const isOutput = declaration => Boolean(declaration.outputDiagnostics)

// A refusal this recipe owns, rather than one an upstream recipe does.
const ownedBy = ({recipePath = []}, recipe) => recipePath.length === 1 && recipePath[0] === recipe.id

const readOutputDeclaration = ({recipe, output, recipeNames, declaration}) => {
    const {codes, itemOf} = declaration.outputDiagnostics
    const byItem = new Map()
    ;(output?.diagnostics || [])
        .filter(diagnostic => codes.includes(diagnostic.code) && ownedBy(diagnostic, recipe))
        .forEach(diagnostic => {
            const item = itemOf(diagnostic, recipe, {recipeNames})
            if (item) {
                const entry = byItem.get(item.id) || {item, diagnostics: []}
                entry.diagnostics.push(diagnostic)
                byItem.set(item.id, entry)
            }
        })
    if (!byItem.size) {
        const state = outputStateRead(declaration, output)
        return state ? [state] : []
    }
    return [...byItem.values()].map(({item, diagnostics}) => {
        const {id, path, label} = item
        const verdict = unsupported({code: declaration.requirement.id, diagnostics, item})
        return {
            declaration,
            local: true,
            output: true,
            item: {id, path, label},
            acquisition: CHECKED,
            providerChain: CHECKED,
            ownVerdict: verdict,
            verdict,
            unmetPrerequisites: []
        }
    })
}

export const OUTPUT_REFUSED = 'OUTPUT_REFUSED'

const outputStateRead = (declaration, {status, dependencyValidity}) => {
    // A description over dependencies still being completed is the output's own to wait for (retrieveOutput.js).
    if (status === OUTPUT_READY && (!dependencyValidity || dependencyValidity.status === VALID)) {
        return null
    }
    const acquisition = status === OUTPUT_PENDING ? CHECKING : status === OUTPUT_UNAVAILABLE ? UNAVAILABLE : CHECKED
    return {
        declaration,
        outputState: true,
        selected: null,
        selects: false,
        acquisition,
        providerChain: CHECKED,
        verdict: acquisition === CHECKED ? unsupported({code: OUTPUT_REFUSED}) : NEEDS
    }
}

// Names by recipe id from the listing, once per listing and shared by everything naming recipes from it: read, never
// changed.
export const recipeNamesOf = state => {
    const listing = state.process?.recipes || NO_LISTING
    if (!RECIPE_NAMES.has(listing)) {
        RECIPE_NAMES.set(listing, Object.fromEntries(listing.map(({id, name}) => [id, name])))
    }
    return RECIPE_NAMES.get(listing)
}

const RECIPE_NAMES = new WeakMap()

const NO_LISTING = Object.freeze([])

const keyOf = (declarationId, itemId) => `${declarationId}|${itemId ?? ''}`

// Local reads are read once for each recipe the session holds: each edit of it is another.
const LOCAL_READS = new WeakMap()

const readLocal = (recipe, declaration) => {
    const facts = declaration.localFacts(recipe)
    const parameters = declaration.parameters?.(recipe) || {}
    const items = declaration.items
        ? declaration.items(facts)
        : [{facts}]
    return items.map(({id, path, label, facts, prerequisites = []}) => ({
        declaration,
        local: true,
        item: declaration.items ? {id, path, label} : null,
        acquisition: CHECKED,
        providerChain: CHECKED,
        ownVerdict: declaration.requirement.evaluate(facts, parameters),
        prerequisites
    }))
}

// Each read's effective verdict, from its own and those of its prerequisites, each resolved once. A prerequisite that was
// not read, or that depends on the read itself, is not met.
const withPrerequisites = reads => {
    const byKey = new Map(reads.map(read => [readKey(read), read]))
    const resolved = new Map()
    const resolving = new Set()
    const resolve = read => {
        const key = readKey(read)
        if (!resolved.has(key)) {
            resolving.add(key)
            const unmetPrerequisites = read.prerequisites
                .map(prerequisite => unmetPrerequisite(prerequisite, byKey, resolving, resolve))
                .filter(Boolean)
            resolving.delete(key)
            const {prerequisites: _prerequisites, ...rest} = read
            resolved.set(key, {
                ...rest,
                unmetPrerequisites,
                verdict: read.ownVerdict.status === SUPPORTED && unmetPrerequisites.length
                    ? unsupported({code: PREREQUISITE_UNMET, prerequisites: unmetPrerequisites})
                    : read.ownVerdict
            })
        }
        return resolved.get(key)
    }
    return reads.map(resolve)
}

const unmetPrerequisite = ({declaration, item}, byKey, resolving, resolve) => {
    const key = keyOf(declaration, item)
    const read = byKey.get(key)
    if (!read || resolving.has(key)) {
        return {declaration, item, label: read?.item?.label || null, read: Boolean(read)}
    }
    const prerequisite = resolve(read)
    return prerequisite.verdict.status === SUPPORTED
        ? null
        : {declaration, item, label: prerequisite.item?.label || null, read: true}
}
