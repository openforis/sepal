import moment from 'moment'

import {dataSetPeriod} from '#sepal/recipe/type/dias'
import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'

const DATE_FORMAT = 'YYYY-MM-DD'

export const DEFAULT_FOREST_THRESHOLD = 30

// The data sets a new recipe's Sources start with, as far as its dates let them contribute (initialSources.js).
export const initialSources = {dataSets: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'SENTINEL_2'], period: dataSetPeriod}

export const defaultModel = {
    aoi: {},
    dates: {
        startDate: moment().subtract(3, 'months').format(DATE_FORMAT),
        endDate: moment().format(DATE_FORMAT)
    },
    sources: {},
    diasPreprocess: {
        orbits: ['ASCENDING', 'DESCENDING'],
        cloudMasking: 'MODERATE'
    },
    diasOptions: {
        threshold: 3,
        consecutiveObservations: 3,
        forestMask: {type: 'HANSEN', threshold: DEFAULT_FOREST_THRESHOLD}
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        setChartPixel(latLng) {
            return actionBuilder('SET_CHART_PIXEL', latLng)
                .set('ui.chartPixel', latLng)
                .build()
                .dispatch()
        }
    }
}

export const retrieveTask = {}

export const getDateRange = recipe => {
    const {startDate, endDate} = recipe.model.dates
    return [moment(startDate, DATE_FORMAT), moment(endDate, DATE_FORMAT)]
}

export const loadObservations$ = ({recipe, latLng}) =>
    api.gee.loadDiasObservations$({recipe, latLng})
