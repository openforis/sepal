import {physicalDestinationCompatibility} from '#sepal/recipe/output/physicalDestinationCompatibility'
import {VALID} from '#sepal/recipe/source/dependencyValidity'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {buildMapDependencyGraph} from './mapDependencyGraph'
import {DESCRIBED, IMAGE_OUTPUT, INVALID, LEGACY, readRecipeOutput, READY, UNAVAILABLE} from './recipeOutput'
import {exportRequirements, submitRetrieveRecipeTask} from './recipeTaskSubmitter'
import {OBSERVED, UNAVAILABLE as SOURCE_UNAVAILABLE, UNOBSERVED} from './sourceEvidence'
import {currentSourceFacts} from './sourceEvidenceBasis'

// Retrieve over a recipe's image output: what may be retrieved, decided once from one read, by the panel that
// offers it and by the submission that sends it.
//
// The read is the common one (recipeOutput.js), over the records the session holds and what the panel's own
// acquisition owner retains. Its authority decides where physical facts come from:
//
//   DESCRIBED  the description: choices, destinations, policies and names all from it
//   LEGACY     a registered helper's names, which offer choices and nothing more. A type's own legacy policy
//              applies as it always has, with no destination restriction and no physical claim. A declared
//              wrapper over an undeclared source has no such policy of its own - its fallback is migration
//              configuration about someone else's bands - so it applies only to bands its evidence lifecycle
//              vouches for as scalar, judged current against the same session as the read (currentSourceFacts),
//              never to what the helper's answer says.
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

// The recipe, its output read, whether that read is still being acquired, and the physical facts its evidence
// lifecycle vouches for, all from one state of the session. `pending` is an answer whose acquisition is not yet
// retained - acquiring, or about to be.
export const readRetrieveOutput = ({state, recipeId, heldFor, publishedEvidence}) => {
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes') || {}
    const recipe = loadedRecipes[recipeId]
    if (!recipe) {
        return null
    }
    const graph = buildMapDependencyGraph({recipe, loadedRecipes})
    const output = readRecipeOutput({recipe, product: {name: IMAGE_OUTPUT}, graph, heldFor})
    const pending = Boolean(output.acquisition) && !heldFor(output.acquisition.key)
    return {recipe, graph, output, pending, sourceFacts: currentSourceFacts(recipe, state, publishedEvidence)}
}

// A selection of physical output names. "All bands" names every band the answer holds, ignoring a manual selection
// kept beside it, as does a stored selection that predates the option and states neither.
export const physicalRequest = ({output, retrieveOptions = {}}) => {
    const {useAllBands, bands} = retrieveOptions
    const names = useAllBands === true || (useAllBands === undefined && bands === undefined)
        ? output.bands.map(({name}) => name)
        : bands || []
    return {names, retrieveOptions: {...retrieveOptions, bands: names}}
}

export const retrieveDecision = ({output, pending, sourceFacts, names, unrecognized = [], destination, task = {}}) => {
    const unresolved = unresolvedOutput(output, pending)
    if (unresolved) {
        return unresolved
    }
    const facts = physicalFacts({output, sourceFacts, task})
    if (facts.status !== OBSERVED) {
        return facts.status === SOURCE_UNAVAILABLE
            ? decision(BLOCKED, UNRESOLVED_OUTPUT)
            : decision(RESOLVING)
    }
    if (unrecognized.length) {
        return decision(BLOCKED, UNRECOGNIZED_SELECTION, {missingBandNames: unrecognized})
    }
    if (!names.length) {
        return decision(BLOCKED, NO_SELECTION, {destinations: facts.bands && emptySelectionDestinations(facts.bands)})
    }
    const available = new Set(output.bands.map(({name}) => name))
    const missing = names.filter(name => !available.has(name))
    if (missing.length) {
        return decision(BLOCKED, MISSING_SELECTION, {missingBandNames: missing})
    }
    const destinations = facts.bands
        ? physicalDestinations(facts.bands, names, task.fallbackPyramidingPolicy)
        : ALL_DESTINATIONS
    if (!destinations) {
        return decision(BLOCKED, UNVERIFIED_SELECTION)
    }
    return destination && destinations[destination] === false
        ? decision(BLOCKED, INCOMPATIBLE_DESTINATION, {destinations})
        : decision(RETRIEVABLE, null, {destinations})
}

// Decides from the read it is handed, which is the caller's to take at the moment of submission, and submits exactly
// what it decided on. Nothing is published before the decision: a refused retrieval leaves no trace but its notice.
// `submitTask` is the recipe's own task, where it has one; otherwise the generic image export.
export const submitRetrieve = ({recipe, output, pending, sourceFacts, request, task = {}, submitTask}) => {
    const {names, unrecognized, retrieveOptions} = request
    const verdict = retrieveDecision({
        output, pending, sourceFacts, names, unrecognized, destination: retrieveOptions.destination, task
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
                ...exportAuthority({output, sourceFacts, task}),
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

const ALL_DESTINATIONS = {GEE: true, DRIVE: true, SEPAL: true}

const decision = (status, reason = null, {missingBandNames = [], destinations = null} = {}) =>
    ({status, reason, missingBandNames, destinations})

// Dependencies not known to be sound are no answer, whichever of the two is missing; a read still being acquired
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

// Where physical facts come from, and whether they can be had yet. `bands: null` is an answer that makes no physical
// claim at all, which restricts nothing.
const physicalFacts = ({output, sourceFacts = {status: UNOBSERVED}, task}) => {
    if (output.authority === DESCRIBED) {
        return {status: OBSERVED, bands: output.bands}
    }
    if (output.authority === LEGACY && isWrapperFallback(task)) {
        return sourceFacts
    }
    return {status: OBSERVED, bands: null}
}

const isWrapperFallback = ({pyramidingPolicy, fallbackPyramidingPolicy}) =>
    !pyramidingPolicy && fallbackPyramidingPolicy !== undefined

// The destinations these bands can be exported to, by the requirements submission itself validates; null when a
// band's shape is unverified.
const physicalDestinations = (physicalBands, names, fallbackPyramidingPolicy) =>
    exportRequirements(physicalBands, {bands: names, useAllBands: false, fallbackPyramidingPolicy}).destinations

// Where an export of some of these bands could go, before any is chosen.
const emptySelectionDestinations = physicalBands =>
    physicalDestinationCompatibility({bands: physicalBands, selectedBandNames: [], useAllBands: false}).destinations

const exportAuthority = ({output, sourceFacts, task: {pyramidingPolicy, fallbackPyramidingPolicy}}) => {
    if (output.authority === DESCRIBED) {
        return withFallback({imageOutputDescription: output.description}, fallbackPyramidingPolicy)
    }
    if (isWrapperFallback({pyramidingPolicy, fallbackPyramidingPolicy})) {
        return withFallback({observedBands: sourceFacts.bands}, fallbackPyramidingPolicy)
    }
    return pyramidingPolicy ? {pyramidingPolicy} : {}
}

const withFallback = (authority, fallbackPyramidingPolicy) =>
    fallbackPyramidingPolicy === undefined ? authority : {...authority, fallbackPyramidingPolicy}

const taskConfig = ({dataSetType, includeTimeRange}) => ({
    ...(dataSetType && {dataSetType}),
    ...(includeTimeRange !== undefined && {includeTimeRange})
})
