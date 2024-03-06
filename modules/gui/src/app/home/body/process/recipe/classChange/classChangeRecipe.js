import {getAllVisualizations} from 'app/home/body/process/recipe/visualizations'
import {getRecipeType} from 'app/home/body/process/recipeTypeRegistry'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {recipeActionBuilder} from 'app/home/body/process/recipe'
import _ from 'lodash'
import api from 'apiRegistry'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    options: {
        cloudThreshold: 0.15,
        shadowThreshold: 0.4
    }
}

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
            return actionBuilder('REQUEST_CLASS_CHANGE_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

export const hasConfidence = recipe => {
    const fromImage = recipe.model.fromImage
    const toImage = recipe.model.toImage
    if (!fromImage || !toImage) {
        return false
    }
    const fromBands = Object.keys(fromImage.bands)
    const fromValues = fromImage.bands[fromImage.band].values
    const toBands = Object.keys(toImage.bands)
    const toValues = fromImage.bands[toImage.band].values

    if (!_.isEqual(new Set(fromValues), new Set(toValues))) {
        return false
    } else {
        const probabilityBands = fromValues.map(value => `probability_${value}`)
        return probabilityBands.every(band => fromBands.includes(band))
            && probabilityBands.every(band => toBands.includes(band))
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const visualizations = getAllVisualizations(recipe)
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
    const pyramidingPolicy = {}
    bands.forEach(band => pyramidingPolicy[band] = band === 'transition' ? 'mode' : 'mean')
    const operation = `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`
    const recipeProperties = {
        recipe_id: recipe.id,
        recipe_projectId: recipe.projectId,
        recipe_type: recipe.type,
        recipe_title: recipe.title || recipe.placeholder,
        ..._(recipe.model)
            .mapValues(value => JSON.stringify(value))
            .mapKeys((_value, key) => `recipe_${key}`)
            .value()
    }
    const task = {
        operation,
        params: {
            title: taskTitle,
            description: name,
            image: {
                recipe: _.omit(recipe, ['ui']),
                ...recipe.ui.retrieveOptions,
                bands: {selection: bands},
                visualizations,
                pyramidingPolicy,
                properties: {...recipeProperties, 'system:time_start': timeStart, 'system:time_end': timeEnd}
            }
        }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination
    })
    return api.tasks.submit$(task).subscribe()
}
