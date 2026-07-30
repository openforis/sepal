import {of} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'

const samplingDesign = recipe => {

    return {
        // Sampling Design is export-only: it has no image output and, like every other recipe, no procedural
        // feature output either (no getFeatures$). A completed design is viewed as an ordinary EE table asset.
        getImage$() {
            return of(null)
        },

        getVisParams$(_image) {
            throw new Error('Sampling Design has no image output to visualize.')
        },

        getGeometry$() {
            return toGeometry$(recipe.model.aoi)
        }
    }
}

export default samplingDesign
