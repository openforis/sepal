import moment from 'moment'

import {dataSetPeriod} from '#sepal/recipe/type/timeSeries'
import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {defaultModel as defaultOpticalModel} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {defaultModel as defaultPlanetModel} from '~/app/home/body/process/recipe/planetMosaic/planetMosaicRecipe'
import {defaultModel as defaultRadarModel} from '~/app/home/body/process/recipe/radarMosaic/radarMosaicRecipe'
import {getTaskInfo} from '~/app/home/body/process/recipe/retrieve/recipeOutputPath'
import {submitExportTask} from '~/app/home/body/process/recipe/retrieve/recipeTaskSubmitter'
import {publishEvent} from '~/eventPublisher'
import {msg} from '~/translate'

const DATE_FORMAT = 'YYYY-MM-DD'

// The data sets a new recipe's Sources start with, as far as the years it reads let them contribute (initialSources.js).
export const initialSources = {dataSets: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM'], period: dataSetPeriod}

export const defaultModel = {
    dates: {
        startDate: '2000-01-01',
        endDate: moment().format(DATE_FORMAT)
    },
    sources: {},
    options: {
        ...defaultOpticalModel.compositeOptions,
        ...defaultRadarModel.options,
        ...defaultPlanetModel.options,
        corrections: [],
        orbits: ['ASCENDING', 'DESCENDING'],
        geometricCorrection: 'ELLIPSOID',
        spatialSpeckleFilter: 'NONE',
        outlierRemoval: 'NONE',
        orbitOverlap: 'KEEP',
        tileOverlap: 'QUICK_REMOVE',
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
        }
    }
}

export const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const destination = 'SEPAL'
    const taskTitle = msg(['process.retrieve.form.task.SEPAL'], {name})
    const operation = 'timeseries.download'
    
    const task = {
        operation,
        params: {
            title: taskTitle,
            description: name,
            image: {
                ...recipe.ui.retrieveOptions,
                recipe,
                indicators: recipe.ui.retrieveOptions.bands
            },
            taskInfo: getTaskInfo({
                recipe,
                destination,
                retrieveOptions: recipe.ui.retrieveOptions
            })
        }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination,
        data_set_type: recipe.model.dataSetType
    })
    return submitExportTask(task)
}

export const loadObservations$ = ({recipe, latLng, bands}) =>
    api.gee.loadTimeSeriesObservations$({
        recipe, latLng, bands
    })

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
