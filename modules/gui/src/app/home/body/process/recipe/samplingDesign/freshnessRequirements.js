import _ from 'lodash'

import {CURRENT, STALE, UNKNOWN, UNVERSIONED} from '#sepal/recipe/calculation/freshness'
import {NEEDS_EVIDENCE, SUPPORTED, unsupported} from '#sepal/recipe/requirement/verdict'
import {allocationReviewState, INPUTS_CHANGED, REVIEWED, UNREVIEWED, UNTRUSTED} from '#sepal/recipe/samplingDesign/allocationReview'
import {isProportionsSkipped} from '#sepal/recipe/samplingDesign/proportionsSkip'
import {strataFreshness, STRATUM_FRAME, usesManualProportions, usesStratumAreas} from '#sepal/recipe/samplingDesign/stratumFrame'
import {PROBABILITY_SOURCE, proportionsFreshness} from '#sepal/recipe/samplingDesign/stratumProbabilities'
import {msg} from '~/translate'

import {EXPIRED as EVIDENCE_EXPIRED, FAILED, OBSERVED, PENDING} from '../../sourceRuntime/calculationEvidence'
import {
    CHECKED,
    CHECKING,
    EXPIRED,
    readLocalRequirements,
    requestGateOf,
    SOURCE_EXPIRED,
    SOURCE_PENDING,
    SOURCE_UNAVAILABLE,
    SOURCE_UNCHECKED,
    UNAVAILABLE,
    UNCHECKED
} from '../sourceRequirements'
import {isManualAllocation, unansweredStrata} from './sampling/allocationOutcome'
import {unansweredProportions} from './sampling/designModel'
import {isSectionStale} from './sampling/validateRetrieve'

// What a design's sections still need, as requirements over its own configuration (sourceRequirements.js), for the
// toolbar to mark them (sectionButton.jsx) and for Retrieve (SAMPLES) and the Proportions calculation
// (STRATUM_PROBABILITIES) to be held by.
//
// Whether its saved stratum areas and automatic proportions are still about their inputs is judged by the shared
// declarations (#sepal/recipe/samplingDesign/stratumFrame, stratumProbabilities) against the current evidence of what
// they read - the stratum frame, and for the proportions the probability source too - which the source runtime acquires
// while the design is open and publishes on it (calculationEvidence.js), as it stands when they are read. Areas not set
// up, or not current, hold Retrieve and the Proportions calculation; automatic proportions not current hold Retrieve.
// Proportions whose rows no longer cover the strata, manual answers an earlier version flagged, an allocation not
// reviewed for the design as it is now (#sepal/recipe/samplingDesign/allocationReview) and an arrangement an earlier
// version flagged mark them too; Retrieve refuses those itself (validateRetrieve.js).
//
// A section not set up yet, or whose result was saved without evidence and is calculated once when its panel opens, is
// unfinished (`incomplete`), and so is an allocation without a trustworthy record of what it was reviewed for, reviewed
// once; one whose result is established not to be about its inputs, or that only selecting another source repairs, is
// wrong. Each finding waits on the sections what it is about reads (`prerequisites`): proportions
// read the strata, and the allocation reads them and the proportions - its counts or the uncertainty it shows, whatever
// its strategy, manual counts included. Skipped proportions are sound, so an allocation does not wait on them. A section
// waiting on another says nothing of its own until that one is sound (selectedSourceStatus.js), so only what can be
// acted on now is marked.
//
// What the applied design says is no reason to refuse an edit. What a panel is about to apply is judged on its own: the
// areas and automatic proportions it calculates (`editedStrataStatus`, `editedProportionsStatus`) against what the source
// runtime holds for what it configures, refused while established STALE, or while that cannot be established yet, so a
// draft overtaken by a change to its inputs is not applied as it stands - results saved without evidence, or over a
// source that cannot report replacement, claim nothing an edit could make untrue; manual answers by the same requirement
// as the applied design (`editor`, localCandidate.js), refused while they are not the strata's; and the allocation by
// its derivation (derivations.js).

export const SAMPLES = 'SAMPLES'
export const STRATUM_PROBABILITIES = 'STRATUM_PROBABILITIES'

export const STRATA_CURRENT = 'samplingDesign.strataCurrent'
export const PROPORTIONS_CURRENT = 'samplingDesign.proportionsCurrent'
const PROPORTIONS_SETTLED = 'samplingDesign.proportionsSettled'
const MANUAL_PROPORTIONS = 'samplingDesign.manualProportions'
const ALLOCATION_SETTLED = 'samplingDesign.allocationSettled'
const ARRANGEMENT_SETTLED = 'samplingDesign.arrangementSettled'

// Nothing to judge yet: the section has not been set up.
const UNCONFIGURED = 'UNCONFIGURED'
// Its panel has to settle it again for the inputs it reads now.
const REQUIRES_UPDATE = 'REQUIRES_UPDATE'

const STRATIFICATION = {id: 'stratification', label: 'process.samplingDesign.panel.stratification.button'}
const PROPORTIONS = {id: 'proportions', label: 'process.samplingDesign.panel.proportions.button'}
const SAMPLE_ALLOCATION = {id: 'sampleAllocation', label: 'process.samplingDesign.panel.sampleAllocation.button'}
const SAMPLE_ARRANGEMENT = {id: 'sampleArrangement', label: 'process.samplingDesign.panel.sampleArrangement.button'}

const READS_STRATA = [{declaration: STRATA_CURRENT}]
const READS_PROPORTIONS = [{declaration: PROPORTIONS_CURRENT}, {declaration: PROPORTIONS_SETTLED}, {declaration: MANUAL_PROPORTIONS}]

// A result's state against the current evidence of what it reads ({[dependency]: {status, evidence}}), and how far
// acquiring that evidence has got: as far as the least advanced of them.
const freshnessFacts = (model, read, freshnessOf) => ({
    state: freshnessOf(model, _.mapValues(read, ({status, evidence}) => status === OBSERVED ? evidence : null)),
    evidence: leastAcquired(Object.values(read).map(({status}) => status))
})

// What says most about acquiring the evidence of several dependencies: what failed or lapsed, then what is not being
// read, then what is still being read.
const ACQUISITION_ORDER = [FAILED, EVIDENCE_EXPIRED, null, PENDING]

const leastAcquired = statuses => {
    const index = ACQUISITION_ORDER.findIndex(status => statuses.includes(status))
    return index < 0 ? OBSERVED : ACQUISITION_ORDER[index]
}

const strataState = (model, current) => strataFreshness(model, current[STRATUM_FRAME])

// Established states are judged; a state needing current evidence waits on its acquisition.
const acquisition = ({state, evidence}) => {
    if (state !== null) {
        return CHECKED
    }
    return {[PENDING]: CHECKING, [OBSERVED]: CHECKING, [FAILED]: UNAVAILABLE, [EVIDENCE_EXPIRED]: EXPIRED}[evidence] || UNCHECKED
}

const statusOf = facts => ({state: facts.state, acquisition: acquisition(facts)})

// What a section's state says: met where CURRENT, waiting on evidence where not established yet, and otherwise what
// holds it back, said as `process.samplingDesign.sectionStatus.<section>.<state>`.
const sectionRequirement = (section, aspect) => ({
    id: `samplingDesign.${section}.${aspect}`,
    evaluate: ({state}) => {
        if (state === CURRENT) {
            return {status: SUPPORTED}
        }
        return state === null
            ? {status: NEEDS_EVIDENCE}
            : unsupported({code: state, ...INCOMPLETE.includes(state) && {incomplete: true}})
    },
    describe: ({code}) => ({message: msg(`process.samplingDesign.sectionStatus.${section}.${code}`), details: []})
})

const INCOMPLETE = [UNCONFIGURED, UNKNOWN, UNREVIEWED, UNTRUSTED]

// What a finding depends on, once there is one.
const waitingOn = prerequisites => ({state}) => state === CURRENT ? [] : prerequisites

export const samplingDesignRequirements = [
    {
        id: STRATA_CURRENT,
        section: STRATIFICATION,
        localFacts: (recipe, dependencyEvidence) => usesStratumAreas(recipe.model) && !recipe.model.stratification?.strata?.length
            ? NOT_SET_UP
            : freshnessFacts(recipe.model, readOf(dependencyEvidence, [STRATUM_FRAME]), strataState),
        acquisition,
        requirement: sectionRequirement('stratification', 'areas'),
        operations: [SAMPLES, STRATUM_PROBABILITIES]
    },
    {
        id: PROPORTIONS_CURRENT,
        section: PROPORTIONS,
        localFacts: (recipe, dependencyEvidence) =>
            freshnessFacts(recipe.model, readOf(dependencyEvidence, [STRATUM_FRAME, PROBABILITY_SOURCE]), proportionsFreshness),
        acquisition,
        prerequisites: waitingOn(READS_STRATA),
        requirement: sectionRequirement('proportions', 'inputs'),
        operations: [SAMPLES]
    },
    {
        id: PROPORTIONS_SETTLED,
        section: PROPORTIONS,
        localFacts: recipe => ({state: automaticProportionsSettlement(recipe.model)}),
        prerequisites: waitingOn(READS_STRATA),
        requirement: sectionRequirement('proportions', 'settled')
    },
    // The Proportions panel reconciles manual answers with the strata as it opens, and its draft is judged by the same
    // rule: answers for other strata than the design's are refused, while what is not answered yet is its rows' to say.
    {
        id: MANUAL_PROPORTIONS,
        section: PROPORTIONS,
        localFacts: recipe => ({state: manualProportionsSettlement(recipe.model)}),
        prerequisites: waitingOn(READS_STRATA),
        requirement: sectionRequirement('proportions', 'answers'),
        editor: {panel: PROPORTIONS.id, input: 'anticipatedProportions', blocksApply: ({ownVerdict}) => !ownVerdict.diagnostic?.incomplete}
    },
    {
        id: ALLOCATION_SETTLED,
        section: SAMPLE_ALLOCATION,
        localFacts: recipe => ({state: allocationSettlement(recipe.model)}),
        prerequisites: waitingOn([...READS_STRATA, ...READS_PROPORTIONS]),
        requirement: sectionRequirement('sampleAllocation', 'settled')
    },
    {
        id: ARRANGEMENT_SETTLED,
        section: SAMPLE_ARRANGEMENT,
        localFacts: recipe => ({state: isSectionStale(recipe.model, 'sampleArrangement') ? REQUIRES_UPDATE : CURRENT}),
        requirement: sectionRequirement('sampleArrangement', 'settled')
    }
]

// How a panel's edited areas or automatic proportions stand, `model` the design as the edit would leave it and `read`
// the source runtime's current evidence of what it configures, {[dependency]: {status, evidence}} for each dependency
// the edit asks (`dependencyEvidence`, calculationEvidence.js): {state, acquisition, applicable}.
export const editedStrataStatus = (model, read) => editedStatus(model, read, strataState)

export const editedProportionsStatus = (model, read) => editedStatus(model, read, proportionsFreshness)

// What a panel says of the result it calculates (calculatedResult.js), `section` 'stratification' or 'proportions', as
// the widget showing that result is told it: {errorMessage, warningMessage, busyMessage}. Nothing while it calculates,
// which the panel's loading presentation says, or failed or was superseded, which the panel says with a retry in its
// place: a calculation waiting on the areas, and a result not current or not confirmed, or whose currency is still being
// established.
export const editedResultFeedback = (section, result) => {
    const failure = result.failure()
    if (result.calculating() || failure?.error || failure?.superseded) {
        return NO_FEEDBACK
    }
    if (failure?.held) {
        return {warningMessage: msg(`process.samplingDesign.panel.${section}.form.result.held`)}
    }
    const status = result.answered() ? result.status() : null
    if (!status || status.state === CURRENT) {
        return NO_FEEDBACK
    }
    if (status.state === null) {
        return status.acquisition === CHECKING
            ? {busyMessage: msg(`process.samplingDesign.retrieve.evidence.${SOURCE_PENDING}`)}
            : {errorMessage: msg(`process.samplingDesign.retrieve.evidence.${EVIDENCE_CODES[status.acquisition] || SOURCE_UNCHECKED}`)}
    }
    return status.state === STALE
        ? {errorMessage: msg(`process.samplingDesign.panel.${section}.form.result.${status.state}`)}
        : {warningMessage: msg(`process.samplingDesign.panel.${section}.form.result.${status.state}`)}
}

// What a panel says in place of a result not calculated because the evidence of what it reads is not usable yet
// (`awaiting`, calculatedResult.js): {checking, message}, `checking` while it is still being read - which the panel shows
// as loading - or null.
export const awaitedResultFeedback = (section, result) => {
    const awaiting = result.awaiting()
    if (!awaiting) {
        return null
    }
    if (awaiting === PENDING) {
        return {checking: true, message: msg(`process.samplingDesign.panel.${section}.form.result.checking`)}
    }
    return {
        checking: false,
        message: awaiting === UNVERSIONED
            ? msg(`process.samplingDesign.panel.${section}.form.result.UNVERSIONED`)
            : msg(`process.samplingDesign.retrieve.evidence.${SOURCE_UNAVAILABLE}`)
    }
}

// What holds a design's Retrieve on its areas and automatic proportions at `now`, or null. The same reads the toolbar's
// Retrieve button is disabled by (operationAvailability.js), for saying why and for checking again on submit.
export const samplesGate = (recipe, now = Date.now()) => requestGateOf(readLocalRequirements(recipe, now), SAMPLES)

export const samplesGateMessage = gate => gate.read?.acquisition === CHECKED
    ? gate.read.declaration.requirement.describe(gate.read.verdict.diagnostic).message
    : msg(`process.samplingDesign.retrieve.evidence.${gate.code}`)

const editedStatus = (model, read, freshnessOf) => {
    const status = statusOf(freshnessFacts(model, read || {}, freshnessOf))
    return {...status, applicable: status.state !== null && status.state !== STALE}
}

const readOf = (dependencyEvidence, dependencies) => Object.fromEntries(dependencies.map(id => [id, dependencyEvidence(id)]))

const NOT_SET_UP = Object.freeze({state: UNCONFIGURED, evidence: null})

const NO_FEEDBACK = Object.freeze({})

const EVIDENCE_CODES = {[CHECKING]: SOURCE_PENDING, [UNAVAILABLE]: SOURCE_UNAVAILABLE, [EXPIRED]: SOURCE_EXPIRED}

// Automatic proportions not skipped need rows for the strata as they are.
const automaticProportionsSettlement = model => {
    if (isProportionsSkipped(model?.proportions) || usesManualProportions(model)) {
        return CURRENT
    }
    if (!model?.proportions?.anticipatedProportions?.length) {
        return UNCONFIGURED
    }
    return isSectionStale(model, 'proportions') ? REQUIRES_UPDATE : CURRENT
}

// Manual proportions need an answer for every stratum and none for another: answers kept by stratum while the strata are
// reordered, and settled again where an earlier version flagged them, until they are applied.
const manualProportionsSettlement = model => {
    if (isProportionsSkipped(model?.proportions) || !usesManualProportions(model)) {
        return CURRENT
    }
    if (!model.proportions.anticipatedProportions?.length) {
        return UNCONFIGURED
    }
    if (isSectionStale(model, 'proportions')) {
        return REQUIRES_UPDATE
    }
    return unansweredProportions(model).length ? UNCONFIGURED : CURRENT
}

// An allocation needs counts, every manual one entered, reviewed for the inputs it reads now.
const allocationSettlement = model => {
    const allocation = model?.sampleAllocation?.allocation
    if (!allocation?.length || (isManualAllocation(model) && unansweredStrata(allocation).length)) {
        return UNCONFIGURED
    }
    return REVIEW_STATES[allocationReviewState(model)]
}

const REVIEW_STATES = {[REVIEWED]: CURRENT, [UNREVIEWED]: UNREVIEWED, [UNTRUSTED]: UNTRUSTED, [INPUTS_CHANGED]: REQUIRES_UPDATE}
