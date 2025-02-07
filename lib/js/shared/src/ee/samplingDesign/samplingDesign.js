const {toGeometry$} = require('#sepal/ee/aoi')
const {of} = require('rxjs')
const _ = require('lodash')

const samplingDesign = recipe => {
    
    return {
        getImage$() {
            return of(null)
        },

        getVisParams$(_image) {
            throw new Error('Time-series cannot be visualized directly.')
        },

        getGeometry$() {
            return toGeometry$(recipe.model.aoi)
        }
    }
}

module.exports = samplingDesign
