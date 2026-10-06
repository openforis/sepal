import _ from 'lodash'

import {getRecipeType} from '../recipeTypeRegistry'
import {IMAGE_OUTPUT} from './recipeOutput'
import {establishedFor, PIXEL_SEGMENTS, requestGate, sourceRequirementGate} from './sourceRequirements'

// Whether an operation over a recipe may start, assessed from what its type declares it needs of its sources
// (sourceRequirements.js), its current configuration and the current evidence. The action that opens an operation and
// the panel or request carrying it out judge from this one assessment, so they cannot disagree. A type that declares no
// requirement holds nothing back.

// The segment chart: {available, gate, chartable, bands, noChartableBand}. `gate` holds the segments it reads
// (requestGate), `chartable` is what the reference is established to plot, and `bands` the measures among those the
// chart's observations show - those the type's `observedBands(recipe)` names, where it names any. Established, but with
// no band to plot (`noChartableBand`), it is not available either; while what can be plotted is not established, that
// is not known.
export const pixelChartAvailability = ({state, recipe, evidenceOwnerOf, now}) => {
    const request = {state, recipe, operation: PIXEL_SEGMENTS, evidenceOwnerOf, now}
    const gate = requestGate(request)
    const chartable = establishedFor(request)
    const bands = chartable ? chartBands(recipe, chartable.measures) : []
    const noChartableBand = Boolean(chartable) && !bands.length
    return {available: !gate && !noChartableBand, gate, chartable, bands, noChartableBand}
}

// Retrieve of the recipe's image output: {available, gate}, `gate` being why it may not be retrieved
// (sourceRequirementGate), as far as its sources decide that.
export const retrieveAvailability = ({state, recipe, evidenceOwnerOf, now}) => {
    const gate = sourceRequirementGate({state, recipe, operation: IMAGE_OUTPUT, evidenceOwnerOf, now})
    return {available: !gate, gate}
}

const chartBands = (recipe, measures) => {
    const observedBands = getRecipeType(recipe.type)?.observedBands
    return observedBands ? _.intersection(measures, observedBands(recipe)) : measures
}
