import {toGeometry} from '#sepal/ee/aoi'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {map, of} from 'rxjs'
import _ from 'lodash'
import ee from '#sepal/ee/ee'

const timeSeries = recipe => {
    const geometry = toGeometry(recipe.model.aoi)
    return {
        getImage$() {
            const count = collection => collection
                .select(0)
                .reduce(ee.Reducer.count())
                .rename('count')

            return getCollection$({recipe, bands: [0]}).pipe(
                map(count)
            )
        },

        getVisParams$(_image) {
            throw new Error('Time-series cannot be visualized directly.')
        },

        getGeometry$() {
            return of(geometry)
        }
    }
}

export default timeSeries
