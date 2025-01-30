const {toGeometry$} = require('#sepal/ee/aoi')
const {getCollection$} = require('#sepal/ee/timeSeries/collection')
const {map} = require('rxjs')
const _ = require('lodash')
const ee = require('#sepal/ee')

const timeSeries = recipe => {
    
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
            return toGeometry$(recipe.model.aoi)
        }
    }
}

module.exports = timeSeries
