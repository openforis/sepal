import _ from 'lodash'
import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

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

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        dataSetType: 'RADAR'
    })
