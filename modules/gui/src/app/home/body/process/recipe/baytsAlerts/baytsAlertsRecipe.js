import {defaultModel as defaultHistoricalModel} from 'app/home/body/process/recipe/baytsHistorical/baytsHistoricalRecipe'
import {getRecipeType} from 'app/home/body/process/recipeTypes'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {recipeActionBuilder} from 'app/home/body/process/recipe'
import {selectFrom} from 'stateUtils'
import {visualizationOptions} from './visualizations'
import _ from 'lodash'
import api from 'api'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    reference: {},
    date: {
        monitoringDuration: 2,
        monitoringDurationUnit: 'months'
        
    },
    options: {...defaultHistoricalModel.options},
    baytsAlertsOptions: {
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        setBands(selection, baseBands) {
            return actionBuilder('SET_BANDS', {selection, baseBands})
                .set('ui.bands.selection', selection)
                .set('ui.bands.baseBands', baseBands)
                .dispatch()
        },
        setChartPixel(latLng) {
            return actionBuilder('SET_CHART_PIXEL', latLng)
                .set('ui.chartPixel', latLng)
                .dispatch()
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_BAYTS_ALERTS_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        }
    }
}

export const toDates = recipe => {
    const model = recipe.model
    const monitoringEnd = model.date.monitoringEnd
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT).subtract(model.date.monitoringDuration, model.date.monitoringDurationUnit).format(DATE_FORMAT)
    return {monitoringEnd, monitoringStart}
}

export const getAllVisualizations = recipe => {
    const alertsVisualizations = visualizationOptions(recipe, 'alerts')
        .map(option => option.options ? option.options : option)
        .flat()
        .map(({visParams}) => visParams)
    return recipe.ui.initialized
        ? [
            ...Object.values((selectFrom(recipe, ['layers.userDefinedVisualizations', 'this-recipe']) || {})),
            ...alertsVisualizations,
            ...selectFrom(recipe, 'model.reference.visualizations') || []
        ]
        : []
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const visualizations = getAllVisualizations(recipe)
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
    const pyramidingPolicy = {'.default': 'sample'}
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
