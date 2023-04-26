import {getAllVisualizations} from 'app/home/body/process/recipe/visualizations'
import {getAvailableBands} from './bands'
import {getRecipeType} from 'app/home/body/process/recipeTypes'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {recipeActionBuilder} from 'app/home/body/process/recipe'
import _ from 'lodash'
import api from 'api'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().subtract(1, 'year').format(DATE_FORMAT),
        toDate: moment().format(DATE_FORMAT)
    },
    options: {
        orbits: ['ASCENDING', 'DESCENDING'],
        orbitNumbers: 'DOMINANT',
        geometricCorrection: 'ELLIPSOID',
        spatialSpeckleFilter: 'LEE',
        kernelSize: 9,
        sigma: 0.9,
        strongScatterers: 'RETAIN',
        strongScattererValues: [0, -5],
        snicSize: 5,
        snicCompactness: 0.15,
        multitemporalSpeckleFilter: 'NONE',
        numberOfImages: 10,
        outlierRemoval: 'MODERATE',
        mask: ['SIDES', 'FIRST_LAST'],
        minAngle: 30.88,
        maxAngle: 45.35,
        minObservations: 1,
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
            return actionBuilder('REQUEST_BAYTS_HISTORICAL_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = Object.keys(getAvailableBands(recipe))
    console.log({bands})
    const visualizations = getAllVisualizations(recipe)
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
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
                properties: {...recipeProperties, 'system:time_start': timeStart, 'system:time_end': timeEnd}
            }
        }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination,
        data_set_type: 'RADAR'
    })
    return api.tasks.submit$(task).subscribe()
}
