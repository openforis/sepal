import _ from 'lodash'
import {map, of} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {TIME_SERIES_BANDS} from '#sepal/recipe/type/timeSeries'

const BAND_NAMES = TIME_SERIES_BANDS.map(({name}) => name)

// The count is built whatever is asked for: neither a selection nor `outputBands` is read.
const timeSeries = recipe => {
    return {
        getImage$() {
            const count = collection => collection
                .select(0)
                .reduce(ee.Reducer.count())
                .rename(BAND_NAMES)

            return getCollection$({recipe, bands: [0]}).pipe(
                map(count)
            )
        },

        // The declared output, answered without building the collection.
        getBands$() {
            return of(BAND_NAMES)
        },

        getVisParams$(_image) {
            throw new Error('Time-series cannot be visualized directly.')
        },

        getGeometry$() {
            return toGeometry$(recipe.model.aoi)
        }
    }
}

export default timeSeries
