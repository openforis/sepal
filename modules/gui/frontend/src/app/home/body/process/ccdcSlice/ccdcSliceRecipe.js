import {msg} from 'translate'
import {recipeActionBuilder} from '../recipe'
import api from 'api'
import moment from 'moment'
import _ from 'lodash'

const DATE_FORMAT = 'YYYY-MM-DD'


export const defaultModel = {
    date: {
        date: moment().format(DATE_FORMAT)
    },
    source: {
        asset: ''
    },
    options: {
        harmonics: 3,
        gapStrategy: 'INTERPOLATE',
        extrapolateSegment: 'CLOSEST',
        extrapolateMaxDays: 30
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {

        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_CCDC_SLICE_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .build()
        }
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.ccdcSlice.panel.retrieve.form.task', destination], {name})
    const {baseBands, bandTypes} = recipe.ui.retrieveOptions
    const bandTypeSuffixes = {
        VALUE: '',
        RMSE: '_rmse',
        INTERCEPT: '_intercept',
        SLOPE: '_slope',
        PHASE1: '_phase_1',
        PHASE2: '_phase_2',
        PHASE3: '_phase_3',
        AMPLITUDE1: '_amplitude_1',
        AMPLITUDE2: '_amplitude_2',
        AMPLITUDE3: '_amplitude_3',
    }
    const bands = baseBands
        .map(baseBand => bandTypes.map(bandType => `${baseBand}${bandTypeSuffixes[bandType]}`))
        .flat()
    console.log({bands})
    const task = {
        'operation': `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`,
        'params':
            {
                title: taskTitle,
                description: name,
                image: {recipe: _.omit(recipe, ['ui']), bands: {selection: bands}, scale}
            }
    }
    return api.tasks.submit$(task).subscribe()
}
