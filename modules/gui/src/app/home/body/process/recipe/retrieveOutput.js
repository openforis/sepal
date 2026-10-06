import _ from 'lodash'

import {physicalDestinationCompatibility} from '#sepal/recipe/output/physicalDestinationCompatibility'
import {VALID} from '#sepal/recipe/source/dependencyValidity'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {AGREED, draftAgreement, isDraft, SAVE_PENDING} from '../draftAgreement'
import {CURRENT, EXPIRED, listingAuthority, WAITING} from '../recipeListing'
import {
    assetAuthority,
    assetEvidenceOfState,
    CURRENT as ASSET_CURRENT,
    DEFAULT_ASSET_POLICY,
    EXPIRED as ASSET_EXPIRED,
    WAITING as ASSET_WAITING
} from '../sourceRuntime/assetEvidence'
import {knownRevisionOf, recordStalenessOfState} from '../sourceRuntime/recordCurrency'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {retrieveAvailability} from './operationAvailability'
import {IMAGE_OUTPUT, INVALID, NEEDS_EVIDENCE, readRecipeOutput, READY, UNAVAILABLE} from './recipeOutput'
import {exportRequirements, submitRetrieveRecipeTask} from './recipeTaskSubmitter'

// Retrieve over a recipe's image output: what may be retrieved, decided once from one read, by the panel that
// offers it and by the submission that sends it.
//
// The read is the common one (recipeOutput.js), over the records the session holds and what the source runtime holds
// for the question the panel watches. Its description is the one authority: choices, destinations, policies and names
// all come from it, and nothing else is retrieved.
//
// A description is evidence about the session's records, but an export executes what storage holds. So Retrieve is
// authorized only while the recipe listing - this session's evidence of storage - is recent enough, and only while
// every draft the output depends on - open, or closed with its saves unsettled - is what storage holds
// (draftAgreement.js): a save still in flight is waited for, and anything else - a save unconfirmed past its bound, refused, conflicting or unresolved, a newer revision in
// storage, or a draft never saved - blocks, named by its own code. The recipe itself is submitted as it is, so its own
// draft needs no saving. Being open is no reason to block.
//
// Likewise for the assets the description was established from - those its closure read (assetEvidence.js): their
// evidence must have been read within its authority, with nothing since found missing, failing or made stale by a
// mutation. A read in flight is waited for; evidence expired or failed blocks, naming the asset. A source without a
// token reports no change, so a description read from one authorizes nothing once it is `unversionedMaxAgeMs` old,
// until it is refreshed; the description and its drawing stay as they are. Assets that only supply pixels establish
// nothing an export is authorized by, and execution resolves its own inputs.
//
// A recipe whose type declares requirements of the sources it selects (`sourceRequirements`, sourceRequirements.js) is
// authorized only while each is known to be met, decided from the same state and from the observation the source
// runtime keeps the recipe's evidence current by (`evidenceOwnerOf`), which the panel's own watch acquires: while one is
// being checked it is waited for, and otherwise it blocks, naming the section the source is selected in. Dependencies already known to be unsound refuse it for that.
//
// A request is the selection translated into the physical names it exports: {names, retrieveOptions}, and the
// options a structured selection could not translate, `unrecognized`, which no band answers. Recipes whose
// selection means something else supply their own translation.

const log = getLogger('retrieveOutput')

export const RESOLVING = 'RESOLVING'
export const BLOCKED = 'BLOCKED'
export const RETRIEVABLE = 'RETRIEVABLE'

export const UNRESOLVED_OUTPUT = 'UNRESOLVED_OUTPUT'
export const UNSOUND_DEPENDENCIES = 'UNSOUND_DEPENDENCIES'
export const NO_SELECTION = 'NO_SELECTION'
export const MISSING_SELECTION = 'MISSING_SELECTION'
export const UNRECOGNIZED_SELECTION = 'UNRECOGNIZED_SELECTION'
export const UNVERIFIED_SELECTION = 'UNVERIFIED_SELECTION'
export const INCOMPATIBLE_DESTINATION = 'INCOMPATIBLE_DESTINATION'

export const REVISIONS_PENDING = 'REVISIONS_PENDING'
export const REVISIONS_EXPIRED = 'REVISIONS_EXPIRED'
export const REVISIONS_UNAVAILABLE = 'REVISIONS_UNAVAILABLE'
export const ASSETS_PENDING = 'ASSETS_PENDING'
export const ASSETS_EXPIRED = 'ASSETS_EXPIRED'
export const ASSETS_UNAVAILABLE = 'ASSETS_UNAVAILABLE'

// The recipe, its output read, and whether that read is still being loaded, from one state of the session.
// `pending` is an answer the runtime does not yet hold for the current key - loading, or about to be.
export const readRetrieveOutput = ({state, recipeId, heldFor, evidenceOwnerOf, now = Date.now()}) => {
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes') || {}
    const recipe = loadedRecipes[recipeId]
    if (!recipe) {
        return null
    }
    const graph = buildMapDependencyGraph({recipe, loadedRecipes})
    const output = readRecipeOutput({
        recipe, product: {name: IMAGE_OUTPUT}, graph, heldFor, currency: recordStalenessOfState(state),
        assetEvidence: assetEvidenceOfState(state)
    })
    const held = output.acquisition && heldFor(output.acquisition.key)
    const pending = Boolean(output.acquisition) && !held
    const gate = output.status === READY
        && authorityGate({
            state, recipe, graph, basis: held?.basis || [], assets: held?.assets || [], observedAt: held?.observedAt ?? null,
            dependencyValidity: output.dependencyValidity, evidenceOwnerOf, now
        })
    return gate
        ? {recipe, graph, output: withheld(output, gate), pending: gate.wait}
        : {recipe, graph, output, pending}
}

// A selection of physical output names, in the output's order. "All bands" names every band the answer holds,
// ignoring a manual selection kept beside it, as does a stored selection that predates the option and states neither.
export const physicalRequest = ({output, retrieveOptions = {}}) => {
    const {useAllBands, bands} = retrieveOptions
    const outputNames = output.bands.map(({name}) => name)
    const names = useAllBands === true || (useAllBands === undefined && bands === undefined)
        ? outputNames
        : inOrderOf(outputNames, bands || [])
    return {names, retrieveOptions: {...retrieveOptions, bands: names}}
}

// Chosen names in the order they are offered in. A selection is a set of buttons, so the order they were pressed in
// is no order anyone chose; an export follows the output instead. A name no longer offered keeps its place after the
// rest, so it is still named and refused.
export const inOrderOf = (offered, chosen) => {
    const offeredNames = new Set(offered)
    return [
        ...offered.filter(name => chosen.includes(name)),
        ...chosen.filter(name => !offeredNames.has(name))
    ]
}

export const retrieveDecision = ({output, pending, names, unrecognized = [], destination, task = {}}) => {
    const unresolved = unresolvedOutput(output, pending)
    if (unresolved) {
        return unresolved
    }
    if (unrecognized.length) {
        return decision(BLOCKED, UNRECOGNIZED_SELECTION, {missingBandNames: unrecognized})
    }
    if (!names.length) {
        return decision(BLOCKED, NO_SELECTION, {destinations: emptySelectionDestinations(output.bands)})
    }
    const available = new Set(output.bands.map(({name}) => name))
    const missing = names.filter(name => !available.has(name))
    if (missing.length) {
        return decision(BLOCKED, MISSING_SELECTION, {missingBandNames: missing})
    }
    const destinations = physicalDestinations(output.bands, names, task.fallbackPyramidingPolicy)
    if (!destinations) {
        return decision(BLOCKED, UNVERIFIED_SELECTION)
    }
    return destination && destinations[destination] === false
        ? decision(BLOCKED, INCOMPATIBLE_DESTINATION, {destinations})
        : decision(RETRIEVABLE, null, {destinations})
}

// Whether the output could not be established - it failed, or its dependencies are not known to be sound. Neither
// says anything about which bands it holds.
export const isUnresolved = ({status, reason}) =>
    status === BLOCKED && [UNRESOLVED_OUTPUT, UNSOUND_DEPENDENCIES].includes(reason)

// The saved choices a form keeps once the output has answered: those it still offers, in their saved order. None
// may remain, which asks for a new selection; it never means every band. Undefined when nothing is to change - also
// while the output is being resolved or could not be, since neither shows that a choice disappeared. A choice is
// dropped only because it is no longer offered: a request built from offered choices that the output still cannot
// satisfy is left to the decision to name and refuse.
export const reconciledChoices = ({decision, saved, offered}) => {
    if (decision.status === RESOLVING || isUnresolved(decision) || !Array.isArray(saved)) {
        return undefined
    }
    const kept = saved.filter(choice => offered.includes(choice))
    return kept.length === saved.length ? undefined : kept
}

// Decides from the read it is handed, which is the caller's to take at the moment of submission, and submits exactly
// what it decided on. Nothing is published before the decision: a refused retrieval leaves no trace but its notice.
// `submitTask` is the recipe's own task, where it has one; otherwise the generic image export.
export const submitRetrieve = ({recipe, output, pending, request, task = {}, submitTask}) => {
    const {names, unrecognized, retrieveOptions} = request
    const verdict = retrieveDecision({
        output, pending, names, unrecognized, destination: retrieveOptions.destination, task
    })
    if (verdict.status !== RETRIEVABLE) {
        log.warn(`Retrieve refused for recipe ${recipe.id}:`, verdict)
        Notifications.error({message: msg('process.retrieve.error.imageOutput')})
        return false
    }
    try {
        submitTask
            ? submitTask({recipe, retrieveOptions})
            : submitRetrieveRecipeTask(recipe, {
                ...taskConfig(task),
                ...exportAuthority({output, task}),
                retrieveOptions,
                visualizationBands: output.availableBands
            })
        return true
    } catch (error) {
        log.error(`Retrieve blocked for recipe ${recipe.id}:`, error)
        Notifications.error({message: msg('process.retrieve.error.imageOutput')})
        return false
    }
}

// Why the description may not authorize an export now, if it may not: {wait, code, recipeId}. A wait comes after
// every block, so nothing that blocks is reported as pending.
const authorityGate = ({state, recipe, graph, basis, assets, observedAt, dependencyValidity, evidenceOwnerOf, now}) => {
    const listing = listingAuthority({listingState: selectFrom(state, 'process.recipeListing'), now})
    if (listing !== CURRENT) {
        return listing === WAITING
            ? {wait: true, code: REVISIONS_PENDING}
            : {wait: false, code: listing === EXPIRED ? REVISIONS_EXPIRED : REVISIONS_UNAVAILABLE}
    }
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes') || {}
    const open = new Set((selectFrom(state, 'process.tabs') || []).map(({id}) => id))
    const saves = selectFrom(state, 'process.saveStates') || {}
    const listed = new Map((selectFrom(state, 'process.recipes') || []).map(({id, revision}) => [id, revision]))
    const drafts = _.uniq([...graph.recipes.map(({id}) => id), ...basis.map(({id}) => id)])
        .filter(id => id !== recipe.id && loadedRecipes[id] && isDraft({open: open.has(id), saveState: saves[id]}))
        .map(id => ({
            recipeId: id,
            code: draftAgreement({
                draft: loadedRecipes[id],
                saveState: saves[id],
                knownRevision: knownRevisionOf({listed: listed.get(id), saveState: saves[id]})
            })
        }))
        .filter(({code}) => code !== AGREED)
        .map(draft => ({...draft, wait: draft.code === SAVE_PENDING}))
    const evidence = assetEvidenceOfState(state)
    const unversionedTooOld = assetId => evidence[assetId]?.unversioned && observedAt !== null
        && now - observedAt >= DEFAULT_ASSET_POLICY.unversionedMaxAgeMs
    const unauthorized = assets
        .map(assetId => ({
            assetId,
            authority: unversionedTooOld(assetId) ? ASSET_EXPIRED : assetAuthority(evidence[assetId], {now})
        }))
        .filter(({authority}) => authority !== ASSET_CURRENT)
        .map(({assetId, authority}) => ({
            assetId,
            wait: authority === ASSET_WAITING,
            code: authority === ASSET_WAITING ? ASSETS_PENDING : authority === ASSET_EXPIRED ? ASSETS_EXPIRED : ASSETS_UNAVAILABLE
        }))
    // Dependencies known to be unsound already refuse it, with what it describes (unresolvedOutput).
    const requirement = dependencyValidity && dependencyValidity.status !== VALID
        ? null
        : retrieveAvailability({state, recipe, evidenceOwnerOf, now}).gate
    const reasons = [...drafts, ...unauthorized, ...(requirement ? [requirement] : [])]
    return reasons.find(({wait}) => !wait) || reasons[0] || null
}

// The description is withheld: waited for as one still being loaded, or blocked as one that could not be had.
const withheld = (output, {wait, code, recipeId, assetId, section}) => ({
    ...output,
    status: wait ? NEEDS_EVIDENCE : UNAVAILABLE,
    authority: null,
    description: null,
    bands: [],
    presentation: {},
    availableBands: {},
    diagnostics: [{code, ...(recipeId && {recipeId}), ...(assetId && {assetId}), ...(section && {section})}]
})

const decision = (status, reason = null, {missingBandNames = [], destinations = null} = {}) =>
    ({status, reason, missingBandNames, destinations})

// Dependencies not known to be sound are no answer, whichever of the two is missing; a read still being loaded
// is not yet one.
const unresolvedOutput = ({status, dependencyValidity}, pending) => {
    if (status === READY && dependencyValidity?.status === VALID) {
        return null
    }
    if (dependencyValidity && dependencyValidity.status !== VALID) {
        return decision(BLOCKED, UNSOUND_DEPENDENCIES)
    }
    if (status === UNAVAILABLE || status === INVALID) {
        return decision(BLOCKED, UNRESOLVED_OUTPUT)
    }
    return pending
        ? decision(RESOLVING)
        : decision(BLOCKED, status === READY ? UNSOUND_DEPENDENCIES : UNRESOLVED_OUTPUT)
}

// The destinations these bands can be exported to, by the requirements submission itself validates; null when a
// band's shape is unverified.
const physicalDestinations = (physicalBands, names, fallbackPyramidingPolicy) =>
    exportRequirements(physicalBands, {bands: names, useAllBands: false, fallbackPyramidingPolicy}).destinations

// Where an export of some of these bands could go, before any is chosen.
const emptySelectionDestinations = physicalBands =>
    physicalDestinationCompatibility({bands: physicalBands, selectedBandNames: [], useAllBands: false}).destinations

const exportAuthority = ({output, task: {fallbackPyramidingPolicy}}) =>
    withFallback({imageOutputDescription: output.description}, fallbackPyramidingPolicy)

const withFallback = (authority, fallbackPyramidingPolicy) =>
    fallbackPyramidingPolicy === undefined ? authority : {...authority, fallbackPyramidingPolicy}

const taskConfig = ({dataSetType, includeTimeRange}) => ({
    ...(dataSetType && {dataSetType}),
    ...(includeTimeRange !== undefined && {includeTimeRange})
})
