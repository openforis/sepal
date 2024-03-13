import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {msg} from '~/translate'
import {publishEvent} from '~/eventPublisher'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import _ from 'lodash'
import api from '~/apiRegistry'
import guid from '~/guid'
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
                booleanOperator: 'and',
                constraints: [{
                    id: guid(),
                    description: 'difference < 0',
                    image: 'this-recipe',
                    band: 'difference',
                    operator: '<',
                    value: 0
                }]
            },
            {
                id: guid(),
                color: '#ffffff',
                value: 2,
                label: 'Stable',
                booleanOperator: 'and',
                constraints: [{
                    id: guid(),
                    description: 'difference = 0',
                    image: 'this-recipe',
                    band: 'difference',
                    operator: '=',
                    value: 0
                }]
            },
            {
                id: guid(),
                color: '#1a9850',
                value: 3,
                label: 'Increase',
                booleanOperator: 'and',
                constraints: [{
                    id: guid(),
                    description: 'difference > 0',
                    image: 'this-recipe',
                    band: 'difference',
                    operator: '>',
                    value: 0
                }]
            }
        ]
    },
    options: {
        minConfidence: 2.5
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
    return fromImage && fromImage.errorBand && toImage && toImage.errorBand
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const visualizations = getAllVisualizations(recipe)
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
    const pyramidingPolicy = {}
    bands.forEach(band => pyramidingPolicy[band] = band === 'change' ? 'mode' : 'mean')
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
