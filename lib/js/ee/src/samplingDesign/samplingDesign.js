import {of} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'

const samplingDesign = recipe => {

    return {
        getImage$() {
            return of(null)
        },

        getFeatures$() {
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

export default samplingDesign
