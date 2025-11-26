import _ from 'lodash'

import {removeImageLayerSource} from '~/app/home/body/process/mapLayout/imageLayerSources'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {pyramidingPolicies, submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {uuid} from '~/uuid'

export const getDefaultModel = () => ({
})

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_REMAPPING_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
        removeInputImage(imageToRemove) {
            removeImageLayerSource({sourceId: imageToRemove.id, recipeId: id})
            actionBuilder('REMOVE_INPUT_IMAGE', {imageToRemove})
                .del(['model.inputImagery.images', {id: imageToRemove.id}])
                .del(['ui.inputImagery.images', {id: imageToRemove.id}])
                .dispatch()
        }
    }
}

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        pyramidingPolicy: pyramidingPolicies.classBased,
        includeTimeRange: false
    })

export const bandsAvailableToAdd = (bands, includedBands) =>
    (Object.keys(bands || {}))
        .filter(band => !(includedBands || []).find(({band: b}) => band === b))

export const defaultBand = (bandName, bands) => {
    const id = uuid()
    const values = bands[bandName].values
    const type = values && values.length ? 'categorical' : 'continuous'
    const legendEntries = type === 'categorical'
        ? defaultLegendEntries(bandName, bands)
        : []
    return {id, band: bandName, type, legendEntries}
}

export const defaultLegendEntries = (bandName, bands) => {
    const visualization = bands[bandName]
    return ((visualization && visualization.values) || [])
        .map((value, i) => ({
            id: uuid(),
            color: (visualization.palette && visualization.palette[i]) || '#000000',
            value,
            label: (visualization.labels && visualization.labels[i]) || `${value}`
        }))
}
