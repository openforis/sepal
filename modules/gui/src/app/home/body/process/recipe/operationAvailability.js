import _ from 'lodash'
import {Subscription} from 'rxjs'

import {READY} from '#sepal/recipe/output/readImageOutput'
import {NOT_READY} from '#sepal/recipe/output/readiness'
import {INVALID, VALID} from '#sepal/recipe/source/dependencyValidity'

import {getRecipeType} from '../recipeTypeRegistry'
import {draftDisagreementsOfState} from '../sourceRuntime/recordCurrency'
import {readOperationReadiness, sectionOfFindings, UNAVAILABLE} from './operationReadiness'
import {IMAGE_OUTPUT} from './recipeOutput'
import {
    CONFIGURATION_UNMET,
    establishedIn,
    PIXEL_SEGMENTS,
    readSourceRequirements,
    requestGateOf,
    SOURCE_PENDING,
    SOURCE_UNAVAILABLE,
    sourceRequirementGate
} from './sourceRequirements'

// Whether an operation over a recipe may start, assessed from what its type declares it needs of its sources
// (sourceRequirements.js), its current configuration and the current evidence. The action that opens an operation and
// the panel or request carrying it out judge from this one assessment, so they cannot disagree. A type that declares no
// requirement holds nothing back.

// The segment chart: {available, gate, chartable, bands, noChartableBand}. `gate` holds the segments it reads
// (requestGate), `chartable` is what the reference is established to plot, and `bands` the measures among those the
// chart's observations show - those the type's `observedBands(recipe)` names, where it names any. Established, but with
// no band to plot (`noChartableBand`), it is not available either; while what can be plotted is not established, that
// is not known.
export const pixelChartAvailability = ({state, recipe, evidenceOwnerOf, heldFor, now}) => {
    const reads = readSourceRequirements({state, recipe, evidenceOwnerOf, heldFor, now})
    const gate = requestGateOf(reads, PIXEL_SEGMENTS)
    const chartable = establishedIn(reads, PIXEL_SEGMENTS)
    const bands = chartable ? chartBands(recipe, chartable.measures) : []
    const noChartableBand = Boolean(chartable) && !bands.length
    return {available: !gate && !noChartableBand, gate, chartable, bands, noChartableBand}
}

// A chart running operations at its pixel - observations (PIXEL_OBSERVATIONS) for Time Series, those and the segments
// fitted there (PIXEL_SEGMENTS) for CCDC - as {available, gate, computation}: `gate` being why they may not be
// requested now - in the shape requestGate answers, {wait, withdraw, code, section} - or null. Each is judged by what the
// recipe's type declares it requires (operationReadiness.js), never by its image output. A finding of any, or
// dependencies known unsound, withdraws what is charted, naming the section the finding is said in; otherwise, while
// what any needs is being read, nothing new is requested and what is charted stays; what could not be read is
// unavailable, which finds nothing. A dependency the session edits is executed from storage's copy, so nothing is
// requested while that copy is not the session's (draftDisagreementsOfState), as Retrieve holds an export.
// `computation` is what the chart is computed from (operationReadiness.js): they run at the same pixel, so it is one,
// and a chart charted from another is charted again. What the session does not hold is read by the runtime for as long
// as the operations are watched (watchOperations). `recordOf(id)` is a record of their closure as these reads resolved
// it (operationReadiness.js).
export const pixelOperationsAvailability = ({state, recipe, heldFor, operations}) => {
    const loadedRecipes = state.process?.loadedRecipes || {}
    const reads = operations.map(operation => readOperationReadiness({recipe, operation, loadedRecipes, heldFor}))
    const [{computation}] = reads
    const gates = reads.map(({readiness, dependencyValidity}) => operationGate(recipe, readiness, dependencyValidity)).filter(Boolean)
    const gate = gates.find(({withdraw}) => withdraw) || gates[0] || draftGate(state, recipe, computation)
    const recordOf = id => reads.map(read => read.recordOf(id)).find(Boolean) || null
    return {available: !gate, gate, computation, recordOf}
}

// Has the source runtime read what the operations need of a recipe (watchOutput$ with `operation`) until unsubscribed:
// whatever is held to them - a chart's action, its open panel - watches them as it judges them.
export const watchOperations = ({sourceRuntime, recipeId, operations}) => {
    const watches = new Subscription()
    sourceRuntime && operations.forEach(operation =>
        watches.add(sourceRuntime.watchOutput$({recipeId, operation}).subscribe()))
    return watches
}

const draftGate = (state, recipe, computation) => {
    const [draft] = draftDisagreementsOfState(state, computation.map(({id}) => id).filter(id => id !== recipe.id))
    return draft ? {wait: draft.wait, withdraw: false, code: draft.code, section: null} : null
}

const operationGate = (recipe, readiness, validity) => {
    if (readiness.status === NOT_READY) {
        return {wait: false, withdraw: true, code: CONFIGURATION_UNMET, section: sectionOfFindings(recipe, readiness.findings)}
    }
    if (validity?.status === INVALID) {
        return {wait: false, withdraw: true, code: CONFIGURATION_UNMET, section: null}
    }
    if (readiness.status === UNAVAILABLE || validity?.status === UNAVAILABLE) {
        return {wait: false, withdraw: false, code: SOURCE_UNAVAILABLE, section: null}
    }
    return readiness.status === READY && validity?.status === VALID
        ? null
        : {wait: true, withdraw: false, code: SOURCE_PENDING, section: null}
}

// Retrieve of the recipe's image output: {available, gate}, `gate` being why it may not be retrieved
// (sourceRequirementGate), as far as its sources decide that.
export const retrieveAvailability = ({state, recipe, evidenceOwnerOf, heldFor, now}) => {
    const gate = sourceRequirementGate({state, recipe, operation: IMAGE_OUTPUT, evidenceOwnerOf, heldFor, now})
    return {available: !gate, gate}
}

const chartBands = (recipe, measures) => {
    const observedBands = getRecipeType(recipe.type)?.observedBands
    return observedBands ? _.intersection(measures, observedBands(recipe)) : measures
}
