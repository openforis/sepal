import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {pyramidingPolicies} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

export const defaultModel = {}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setBands(bands) {
            return setAll('SET_BANDS', {
                'ui.bands.selection': bands
            }, {bands})
        },
    }
}

export const hasError = recipe => {
    const imageToMask = recipe.model.imageToMask
    const imageMask = recipe.model.imageMask
    return imageToMask && imageToMask.errorBand && imageMask && imageMask.errorBand
}

// Masking has no policy of its own: its output's policies are its source's. The fallback applies only where its
// source states none, to bands verified scalar - from the description, or, over a source that declares nothing,
// from the evidence its lifecycle currently vouches for.
export const retrieveTask = {
    fallbackPyramidingPolicy: pyramidingPolicies.changeBased('change')
}
