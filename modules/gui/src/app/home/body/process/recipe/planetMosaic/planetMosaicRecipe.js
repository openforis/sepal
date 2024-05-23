import _ from 'lodash'
import moment from 'moment'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {publishEvent} from '~/eventPublisher'
import {msg} from '~/translate'

const DATE_FORMAT = 'YYYY-MM-DD'

export const NICFI_ASSETS = [
    'projects/planet-nicfi/assets/basemaps/africa',
    'projects/planet-nicfi/assets/basemaps/asia',
    'projects/planet-nicfi/assets/basemaps/americas'
]

const defaultFromDate = moment().subtract(2, 'month').startOf('year')
export const defaultModel = {
    dates: {
        fromDate: defaultFromDate.format(DATE_FORMAT),
        toDate: moment.min(
            moment(),
            defaultFromDate.add(1, 'year')
        ).format(DATE_FORMAT)
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
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
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
        data_set_type: 'PLANET'
    })
    return api.tasks.submit$(task).subscribe()
}
