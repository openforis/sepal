import {msg} from 'translate'
import {recipeActionBuilder} from 'app/home/body/process/recipe'
import {selectFrom} from 'stateUtils'
import {visualizations} from './visualizations'
import _ from 'lodash'
import api from 'api'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    options: {
        orbits: ['ASCENDING'],
        geometricCorrection: 'ELLIPSOID',
        speckleFilter: 'NONE',
        outlierRemoval: 'MODERATE',
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
            return actionBuilder('REQUEST_RADAR_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

export const getAllVisualizations = recipe => {
    const type = selectFrom(recipe, 'model.dates').targetDate
        ? 'POINT_IN_TIME'
        : 'TIME_SCAN'
    return [
        ...Object.values((selectFrom(recipe, ['layers.userDefinedVisualizations', 'this-recipe']) || {})),
        ...visualizations[type],
        ...(type === 'POINT_IN_TYPE' ? visualizations.metadata : [])
    ]
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const visualizations = getAllVisualizations(recipe)
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
                    scale
                }
            }
    }
    return api.tasks.submit$(task).subscribe()
}
