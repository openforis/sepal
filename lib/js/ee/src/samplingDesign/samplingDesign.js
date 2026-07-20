import {of} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'

import {samples$} from './samples.js'

const samplingDesign = recipe => {

    return {
        // Sampling Design has no image output; it produces a sample FeatureCollection (see getFeatures$).
        getImage$() {
            return of(null)
        },

        // Finalized sample FeatureCollection for the recipe - an in-memory draw (systematic uses the
        // adaptive per-density selection; random draws directly at the requested counts). Used when this recipe is
        // consumed as a feature source. NOTE: the task export path does NOT use this - it materializes base
        // + optional repair candidate assets and filters those (modules/task systematicExport.js). Returns
        // null when the design isn't ready to sample.
        getFeatures$() {
            return samples$(recipe.model)
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
