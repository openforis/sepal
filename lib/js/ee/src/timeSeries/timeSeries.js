const {toGeometry} = require('#sepal/ee/aoi')
const {getCollection$} = require('#sepal/ee/timeSeries/collection')
const {map, of} = require('rxjs')
const _ = require('lodash')
const ee = require('#sepal/ee/ee')

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

module.exports = timeSeries
