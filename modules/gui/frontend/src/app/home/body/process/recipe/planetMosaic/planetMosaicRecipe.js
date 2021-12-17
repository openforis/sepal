import {getAllVisualizations} from 'app/home/body/process/recipe/visualizations'
import {getRecipeType} from 'app/home/body/process/recipeTypes'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {recipeActionBuilder} from 'app/home/body/process/recipe'
import _ from 'lodash'
import api from 'api'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const NICFI_ASSETS = [
    'projects/planet-nicfi/assets/basemaps/africa',
    'projects/planet-nicfi/assets/basemaps/asia',
    'projects/planet-nicfi/assets/basemaps/americas'
]

export const defaultModel = {
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    sources: {
        source: 'BASEMAPS',
        assets: NICFI_ASSETS,
        histogramMatching: 'DISABLED'
    },
    options: {
        cloudThreshold: 0.15,
        shadowThreshold: 0.4,
        cloudBuffer: 0
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
            return actionBuilder('REQUEST_PLANET_MOSAIC_RETRIEVAL', {retrieveOptions})
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
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const visualizations = getAllVisualizations(recipe)
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
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
                    visualizations,
                    scale,
                    properties: {'system:time_start': timeStart, 'system:time_end': timeEnd}
                }
            }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination,
        data_set_type: 'PLANET'
    })
    return api.tasks.submit$(task).subscribe()
}
