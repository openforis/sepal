import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {defaultModel as defaultHistoricalModel} from '~/app/home/body/process/recipe/baytsHistorical/baytsHistoricalRecipe'
import {pyramidingPolicies, submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {selectFrom} from '~/stateUtils'

import {visualizationOptions} from './visualizations'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    reference: {},
    date: {
        monitoringDuration: 2,
        monitoringDurationUnit: 'months'
        
    },
    options: {...defaultHistoricalModel.options},
    baytsAlertsOptions: {
        wetlandMaskAsset: 'users/wiell/SepalResources/wetlandMask_v1',
        normalization: 'DISABLED',
        sensitivity: 1,
        maxDays: 90,
        highConfidenceThreshold: 0.975,
        lowConfidenceThreshold: 0.85,
        minNonForestProbability: 0.6,
        minChangeProbability: 0.5
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

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        pyramidingPolicy: pyramidingPolicies.sample
    })
