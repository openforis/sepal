import _ from 'lodash'

import {ccdcOutputBands, fittedMeasures, measuresFor, SEGMENT_BANDS} from '#sepal/recipe/type/ccdc'

import {inOrderOf} from '../retrieveOutput'

// CCDC is asked for measures, not bands. What may be chosen is the measures its described output holds; what a
// choice exports is every band those measures and the configured breakpoint bands produce - the rule CCDC itself
// fits by - so a breakpoint band the collection no longer carries is named, and blocks, like any other. The request
// CCDC's own export is given stays the measures chosen, in the order they are offered.
export const ccdcMeasureSelection = {
    request: ({recipe, output, retrieveOptions}) => {
        const measures = inOrderOf(ccdcMeasureSelection.choices(output), retrieveOptions.bands || [])
        return {
            names: ccdcOutputBands(fittedMeasures(recipe.model, measures)),
            retrieveOptions: {...retrieveOptions, bands: measures}
        }
    },
    choices: output => measuresFor(measureBands(output.bands.map(({name}) => name))),
    unavailable: missingBandNames => _.uniq([
        ...measuresFor(measureBands(missingBandNames)),
        ...missingBandNames.filter(name => SEGMENT_BANDS.includes(name))
    ])
}

const measureBands = names => names.filter(name => !SEGMENT_BANDS.includes(name))
