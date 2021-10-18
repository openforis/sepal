import {getAllVisualizations} from 'app/home/body/process/recipe/visualizations'
import {getRecipeType} from 'app/home/body/process/recipeTypes'
import {msg} from 'translate'
import {recipeActionBuilder} from 'app/home/body/process/recipe'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    legend: {
        entries: [
            {
                id: guid(),
                color: '#d73027',
                value: 1,
                label: 'Decrease',
                from: undefined,
                to: 0
            },
            {
                id: guid(),
                color: '#ffffff',
                value: 2,
                label: 'Stable',
                from: 0,
                to: 0
            },
            {
                id: guid(),
                color: '#1a9850',
                value: 3,
                label: 'Increase',
                from: 0,
                to: undefined
            }
        ]
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
            return actionBuilder('REQUEST_INDEX_CHANGE_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

export const hasError = recipe => {
    const fromImage = recipe.model.fromImage
    const toImage = recipe.model.toImage
    if (!fromImage || !toImage) {
        return false
    }
    // TODO: Implement...
    return true
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const visualizations = getAllVisualizations(recipe)
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
    const task = {
        'operation': `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`,
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
    return api.tasks.submit$(task).subscribe()
}