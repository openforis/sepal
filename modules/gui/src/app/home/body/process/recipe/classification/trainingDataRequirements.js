import _ from 'lodash'

import {MISSING_TRAINING_FEATURES, NO_TRAINING_DATA} from '#sepal/recipe/trainingData'
import {TRAINING_DATA_SOURCE} from '#sepal/recipe/type/classification'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

import {listed} from '../fieldRequirement'
import {referenceFeedback} from '../referenceFeedback'

// What Classification and Regression need of their training data, as their shared output declarations refuse it
// (lib/js/shared/src/recipe/trainingData.js): a classifier that is trained has something to train on. The output read
// judges it (sourceRequirements.js), so the Training data section and the operations over the output say what that read
// establishes, of the training data as a whole - and, where a data set reuses another recipe's training data, which
// that recipe cannot produce (TRAINING_DATA), at that data set, naming the recipe whose own sections say why; and where
// a recipe in its reuse samples without features this recipe trains on, at that data set, naming that recipe and them.
// Those two are said in the data set's editor too, beside the recipe it reuses (REUSED_RECIPE_EDITOR), as one
// instruction naming the recipes at fault (`referenceFeedback`) - after what they lack, where that is known.
//
// No training data at all is set-up not yet done rather than a data set that cannot be used: it holds the operations as
// any finding does, and the Training data panel says how to add some (`missing`, a message key), but its toolbar button
// is not marked for it.

export const TRAINING_DATA = {id: 'trainingData', label: 'process.classification.panel.trainingData.button'}

// The item of the Training data section that no training data at all is said of: the list of data sets as a whole.
export const TRAINING_DATA_LIST = 'dataSets'

// The editor of one data set (trainingDataSet.jsx), judged as the recipe built from that data set alone, as edited: what is
// said of the recipe it reuses is said beside it, about the recipe now chosen, and what other data sets reuse stays on
// their own items, as the repair - the recipe at fault fixed, or another selected. What it confirms holds Apply, by the
// form's own submission (recipeFormPanel.jsx): another recipe, Cancel, and Close of a data set opened unchanged stay
// open, and what is still being read, or cannot be, holds nothing.
const REUSED_RECIPE_EDITOR = {
    panel: 'trainingDataSet',
    input: 'recipe',
    explain: true,
    candidate: (recipe, dataSet) => ({
        ...recipe,
        model: {...recipe.model, trainingData: {...recipe.model.trainingData, dataSets: [dataSet]}}
    }),
    message: ({referenceFeedback}) => repairMessage(referenceFeedback)
}

// The features a reused recipe samples without are said before the repair; that a reused recipe needs attention, the
// repair says itself.
const MISSING_FEATURES_EDITOR = {
    ...REUSED_RECIPE_EDITOR,
    message: ({message, referenceFeedback}) => `${message} ${repairMessage(referenceFeedback)}`
}

// Classification's, whose points can also be collected on its map, and Regression's.
export const classificationTrainingDataRequirements = trainingDataRequirements('process.classification.panel.trainingData.missing')

export const regressionTrainingDataRequirements = trainingDataRequirements('process.regression.panel.trainingData.missing')

function trainingDataRequirements(missing) {
    return [{
        id: NO_TRAINING_DATA,
        section: TRAINING_DATA,
        requirement: {id: NO_TRAINING_DATA, describe: () => ({message: msg(missing), details: []})},
        summary: () => msg(missing),
        outputDiagnostics: {
            codes: [NO_TRAINING_DATA],
            itemOf: () => ({
                id: TRAINING_DATA_LIST,
                path: ['model', 'trainingData', 'dataSets'],
                label: msg(TRAINING_DATA.label)
            })
        },
        operations: [IMAGE_OUTPUT],
        toolbarMark: false
    },
    {
        id: MISSING_TRAINING_FEATURES,
        section: TRAINING_DATA,
        requirement: {
            id: MISSING_TRAINING_FEATURES,
            describe: ({diagnostics, item}) => ({
                message: missingFeaturesMessage(diagnostics, item),
                details: [],
                referenceFeedback: providersOf(diagnostics, item)
            })
        },
        summary: reads => reads.map(({ownVerdict: {diagnostic}}) => missingFeaturesMessage(diagnostic.diagnostics, diagnostic.item)).join(' '),
        outputDiagnostics: {
            codes: [MISSING_TRAINING_FEATURES],
            itemOf: ({path}, recipe, {recipeNames}) => {
                const item = dataSetItem(recipe, path?.[3])
                return item && {...item, recipeNames}
            }
        },
        editor: MISSING_FEATURES_EDITOR,
        operations: [IMAGE_OUTPUT]
    },
    {
        ...referenceFeedback({
            section: TRAINING_DATA,
            roles: [TRAINING_DATA_SOURCE],
            itemOf: ({path}, recipe) => dataSetItem(recipe, path?.[3])
        }),
        editor: REUSED_RECIPE_EDITOR
    }]
}

// Each recipe reused through a data set whose samples lack features, by name, and those features.
const missingFeaturesMessage = (diagnostics, {recipeNames}) => diagnostics
    .map(({provider, features}) => msg('process.classification.panel.trainingData.missingFeatures', {
        recipe: recipeNames[provider] || provider,
        features: listed(features, 'process.source.segments.andMore')
    }))
    .join(' ')

const repairMessage = ({origins}) => msg('process.classification.panel.trainingData.reusedRecipe.repair', {
    recipes: origins.map(({name}) => name).join(', '),
    count: origins.length
})

// The recipes in a reuse whose samples lack features, as the recipes at fault (referenceFeedback.js).
const providersOf = (diagnostics, {recipeNames}) => {
    const providers = _.uniq(diagnostics.map(({provider}) => provider))
        .map(id => ({id, name: recipeNames[id] || id}))
    return {reference: providers[0], origins: providers}
}

// The data set at an index, by its dataSetId, named as the training data list names it.
const dataSetItem = (recipe, index) => {
    const dataSet = index >= 0 ? recipe.model?.trainingData?.dataSets?.[index] : null
    return dataSet
        ? {id: dataSet.dataSetId, path: ['model', 'trainingData', 'dataSets', index], label: dataSet.name}
        : null
}
