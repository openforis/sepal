import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

export const getDefaultModel = () => ({
    inputImagery: {images: []},
    calculations: {calculations: []},
    outputBands: {outputImages: []},
})

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)
    return {
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_BAND_MATH_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
        syncBandNames(bandNames) {
            return actionBuilder('SYNC_BAND_NAMES', {bandNames})
                .set('model.bandNames.bandNames', bandNames)
                .dispatch()
        }
    }
}

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        includeTimeRange: false
    })

