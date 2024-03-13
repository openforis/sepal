import {defaultModel as defaultOpticalModel} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {defaultModel as defaultRadarModel} from '~/app/home/body/process/recipe/radarMosaic/radarMosaicRecipe'
import {msg} from '~/translate'
import {publishEvent} from '~/eventPublisher'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import api from '~/apiRegistry'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        startDate: '2000-01-01',
        endDate: moment().format(DATE_FORMAT)
    },
    sources: {
        dataSets: {
            LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
        }
    },
    options: {
        ...defaultOpticalModel.compositeOptions,
        ...defaultRadarModel.options,
        corrections: [],
        cloudDetection: ['QA', 'CLOUD_SCORE'],
        cloudMasking: 'MODERATE',
        snowMasking: 'ON',
        orbits: ['ASCENDING', 'DECENDING'],
        geometricCorrection: 'ELLIPSOID',
        speckleFilter: 'NONE',
        outlierRemoval: 'NONE'
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
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
        setClassification({classificationLegend, classifierType} = {}) {
            actionBuilder('SET_CLASSIFICATION', {classificationLegend, classifierType})
                .set('ui.classification', {classificationLegend, classifierType})
                .dispatch()
        }
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const title = msg(['process.retrieve.form.task.SEPAL'], {name})
    const operation = 'timeseries.download'
    const task = {
        operation,
        params: {
            title,
            description: name,
            recipe,
            ...recipe.ui.retrieveOptions,
            indicator: recipe.ui.retrieveOptions.bands
        }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination: 'SEPAL',
        data_set_type: recipe.model.dataSetType
    })
    return api.tasks.submit$(task).subscribe()
}

export const loadObservations$ = ({recipe, latLng, bands}) =>
    api.gee.loadTimeSeriesObservations$({
        recipe, latLng, bands
    })

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
