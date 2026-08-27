import {selectFrom} from '~/stateUtils'

// Just enough of a MOSAIC recipe for the optical band and visualization
// helpers, which only read model.sources.dataSets and model.compositeOptions -
// hence no type, aoi, dates or scene selection here.
//
// The mosaic that actually gets rendered is built by toMosaicRecipe() in
// lib/js/ee/src/timeSeries/landTrendr.js. Keep `compose` and the corrections
// in step with it: opticalBands() drops the metadata bands only when compose
// is MEDIAN, so if the two drift apart this offers bands the image lacks.
export const toMosaicRecipe = recipe => ({
    model: {
        sources: {
            dataSets: selectFrom(recipe, 'model.sources.dataSets') || {}
        },
        compositeOptions: {
            ...selectFrom(recipe, 'model.options'),
            compose: 'MEDIAN'
        }
    }
})
