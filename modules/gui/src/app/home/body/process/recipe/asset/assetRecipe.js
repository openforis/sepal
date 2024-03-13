import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {msg} from '~/translate'
import {publishEvent} from '~/eventPublisher'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import _ from 'lodash'
import api from '~/apiRegistry'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        type: 'ALL_DATES',
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    composite: {
        type: 'MOSAIC'
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
        createFiltersEntry(filtersEntry) {
            return actionBuilder('CREATE_CONSTRAINTS_ENTRY', {filtersEntry})
                .push('model.filter.filtersEntries', filtersEntry)
                .dispatch()
        },
        updateFiltersEntry(filtersEntry) {
            return actionBuilder('UPDATE_CONSTRAINTS_ENTRY', {filtersEntry})
                .set(['model.filter.filtersEntries', {id: filtersEntry.id}], filtersEntry)
                .dispatch()
        },
        removeFiltersEntry(filtersEntryId) {
            return actionBuilder('UPDATE_CONSTRAINTS_ENTRY', {filtersEntryId})
                .del(['model.filter.filtersEntries', {id: filtersEntryId}])
                .dispatch()
        },
        createConstraintsEntry(constraintsEntry) {
            return actionBuilder('CREATE_CONSTRAINTS_ENTRY', {constraintsEntry})
                .push('model.mask.constraintsEntries', constraintsEntry)
                .dispatch()
        },
        updateConstraintsEntry(constraintsEntry) {
            return actionBuilder('UPDATE_CONSTRAINTS_ENTRY', {constraintsEntry})
                .set(['model.mask.constraintsEntries', {id: constraintsEntry.id}], constraintsEntry)
                .dispatch()
        },
        removeConstraintsEntry(constraintsEntryId) {
            return actionBuilder('UPDATE_CONSTRAINTS_ENTRY', {constraintsEntryId})
                .del(['model.mask.constraintsEntries', {id: constraintsEntryId}])
                .dispatch()
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_ASSET_RECIPE_RETRIEVAL', {retrieveOptions})
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
        data_set_type: 'RADAR'
    })
    return api.tasks.submit$(task).subscribe()
}
