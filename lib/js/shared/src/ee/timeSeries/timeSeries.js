const {toGeometry} = require('#sepal/ee/aoi')
const {of} = require('rxjs')
const _ = require('lodash')
const ee = require('#sepal/ee')

const timeSeries = recipe => {
    const geometry = toGeometry(recipe.model.aoi)
    return {
        getImage$() {
            return of(ee.Image())
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
