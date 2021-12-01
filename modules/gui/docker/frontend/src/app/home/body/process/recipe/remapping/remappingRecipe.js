import {getAllVisualizations} from 'app/home/body/process/recipe/visualizations'
import {msg} from 'translate'
import {recipeActionBuilder} from 'app/home/body/process/recipe'
import {removeImageLayerSource} from 'app/home/body/process/mapLayout/imageLayerSources'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'

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

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const bands = recipe.ui.retrieveOptions.bands
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const pyramidingPolicy = {}
    bands.forEach(band => pyramidingPolicy[band] = band === 'class' ? 'mode' : 'mean')
    const operation = `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`
    const task = {
        operation,
        'params':
            {
                title: taskTitle,
                description: name,
                image: {
                    recipe: _.omit(recipe, ['ui']),
                    bands: {selection: bands},
                    visualizations: getAllVisualizations(recipe),
                    scale,
                    pyramidingPolicy
                }
            }
    }
    return api.tasks.submit$(task).subscribe()
}

export const bandsAvailableToAdd = (bands, includedBands) =>
    (Object.keys(bands || {}))
        .filter(band => !(includedBands || []).find(({band: b}) => band === b))

export const defaultBand = (bandName, bands) => {
    const id = guid()
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
            id: guid(),
            color: (visualization.palette && visualization.palette[i]) || '#000000',
            value,
            label: (visualization.labels && visualization.labels[i]) || `${value}`
        }))
}
