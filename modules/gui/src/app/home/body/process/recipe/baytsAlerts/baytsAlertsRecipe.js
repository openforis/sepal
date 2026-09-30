import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {defaultModel as defaultHistoricalModel} from '~/app/home/body/process/recipe/baytsHistorical/baytsHistoricalRecipe'

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
    }
}

export const toDates = recipe => {
    const model = recipe.model
    const monitoringEnd = model.date.monitoringEnd
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT).subtract(model.date.monitoringDuration, model.date.monitoringDurationUnit).format(DATE_FORMAT)
    return {monitoringEnd, monitoringStart}
}
