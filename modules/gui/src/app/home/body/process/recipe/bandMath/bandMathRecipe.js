import {recipeActionBuilder} from '~/app/home/body/process/recipe'

export const getDefaultModel = () => ({
    inputImagery: {images: []},
    calculations: {calculations: []},
    outputBands: {outputImages: []},
})

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)
    return {
        syncBandNames(bandNames) {
            return actionBuilder('SYNC_BAND_NAMES', {bandNames})
                .set('model.bandNames.bandNames', bandNames)
                .dispatch()
        }
    }
}

export const retrieveTask = {
    includeTimeRange: false
}

