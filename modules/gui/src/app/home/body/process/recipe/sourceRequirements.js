import {CYCLIC, discoverProvider, FOUND, MALFORMED, NOT_A_SOURCE, UNRESOLVED} from '#sepal/recipe/capability/discoverProvider'
import {NEEDS_EVIDENCE, SUPPORTED, UNSUPPORTED} from '#sepal/recipe/requirement/verdict'

import {getRecipeType} from '../recipeTypeRegistry'
import {
    assetAuthority,
    CURRENT as ASSET_CURRENT,
    EXPIRED as ASSET_EXPIRED,
    isDefinitiveFailure,
    WAITING as ASSET_WAITING
} from '../sourceRuntime/assetEvidence'
import {FAILED, PENDING} from '../sourceRuntime/evidenceRegistry'
import {OBSERVED, sourceEdgeOf, sourceKeyOf} from './sourceEvidence'
import {evidenceSession, outdatedBasis} from './sourceEvidenceBasis'

// Whether the sources a recipe selects meet what its type declares it needs of them, as the session stands: pure and
// synchronous, starting nothing. A recipe type declares `sourceRequirements`:
//
//   {role, section: {id, label}, requirement, parameters: recipe => ({...}), operations, providerOperations,
//    requiredForSelection}
//
// `role` names the selection by the edge the recipe already declares (directSources), and `section` the form panel the
// requirement belongs to: its id names the panel, which edits the model at that id - the section that selects the
// source where its edge lies there, otherwise one configuring something that depends on it. `requirement` is a shared
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

// The operation of reading the segments at a pixel, as a segment chart does.
export const PIXEL_SEGMENTS = 'PIXEL_SEGMENTS'

// {declaration, selected, acquisition, providerChain, verdict, assetId?, missing?} for each requirement the recipe's type declares.
export const readSourceRequirements = ({state, recipe, evidenceOwnerOf, now}) =>
    (getRecipeType(recipe.type)?.sourceRequirements || []).map(declaration =>
        readSourceRequirement({state, recipe, declaration, evidenceOwner: evidenceOwnerOf?.(recipe.id), now})
    )

// Why a request for an operation over the recipe may not start, by what it selected, if anything: blocks before waits.
// Nothing an owner is not reading is waited for: no reader can say whether anything will. Retrieve refuses on any of
// them; a new request for a preview or a chart is held (requestGate).
export const sourceRequirementGate = ({state, recipe, operation, evidenceOwnerOf, now}) =>
    firstReason(requirementReasons({state, recipe, operation, evidenceOwnerOf, now}))

// Whether a new Earth Engine request for an operation over the recipe may start now: null when it may, otherwise
// {wait, withdraw, code, section, read} - `read` the requirement's read behind it, as far as the operation is held to it. While a requirement is not known to be met nothing new is requested, and what is
// already drawn stays - checking is no reason to change it. A source found missing or unsuitable also withdraws it.
// Wherever the recipe is shown, the consumer requesting the operation watches the evidence it needs (sourceRuntime.js),
// so what is held is being read.
export const requestGate = ({state, recipe, operation, evidenceOwnerOf, now}) =>
    firstReason(requirementReasons({state, recipe, operation, evidenceOwnerOf, now})
        .map(reason => ({...reason, withdraw: [SOURCE_MISSING, SOURCE_UNSUITABLE].includes(reason.code)})))

// What the requirement an operation over the recipe is held to establishes, where it is met - the measures a segment
// chart can plot, say: its SUPPORTED verdict, or null.
export const establishedFor = ({state, recipe, operation, evidenceOwnerOf, now}) => {
    const read = readSourceRequirements({state, recipe, evidenceOwnerOf, now})
        .find(({declaration}) => declaration.operations?.includes(operation))
    return read?.verdict.status === SUPPORTED ? read.verdict : null
}

// An operation that needs the requirement met is answered by its whole read. One that only resolves the source through
// its provider chain is refused only where that chain is, and waits only for its records: what the requirement judges
// of the segments is not its concern.
const requirementReasons = ({state, recipe, operation, evidenceOwnerOf, now}) =>
    readSourceRequirements({state, recipe, evidenceOwnerOf, now})
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

const retrieveReason = ({acquisition, verdict}) => {
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
