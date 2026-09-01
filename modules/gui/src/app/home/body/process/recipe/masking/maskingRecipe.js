import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {submitObservedRetrieve} from '~/app/home/body/process/recipe/observedRetrieve'
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
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_MASKING_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .dispatch()
        },
    }
}

export const hasError = recipe => {
    const imageToMask = recipe.model.imageToMask
    const imageMask = recipe.model.imageMask
    return imageToMask && imageToMask.errorBand && imageMask && imageMask.errorBand
}

export const submitMaskingRetrieve = ({recipe, retrieveOptions, resolveImageOutput$}) => {
    RecipeActions(recipe.id).retrieve(retrieveOptions)
    return submitObservedRetrieve({
        recipe,
        retrieveOptions,
        resolveImageOutput$,
        fallbackPyramidingPolicy: pyramidingPolicies.changeBased('change')
    })
}
