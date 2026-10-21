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

export const TRAINING_DATA = {id: 'trainingData', label: 'process.classification.panel.trainingData.button'}

export const trainingDataRequirements = [
    {
        id: NO_TRAINING_DATA,
        section: TRAINING_DATA,
        requirement: {id: NO_TRAINING_DATA, describe: () => ({message: missingMessage(), details: []})},
        summary: () => missingMessage(),
        outputDiagnostics: {
            codes: [NO_TRAINING_DATA],
            itemOf: () => ({
                id: 'dataSets',
                path: ['model', 'trainingData', 'dataSets'],
                label: msg(TRAINING_DATA.label)
            })
        },
        operations: [IMAGE_OUTPUT]
    },
    {
        id: MISSING_TRAINING_FEATURES,
        section: TRAINING_DATA,
        requirement: {
            id: MISSING_TRAINING_FEATURES,
            describe: ({diagnostics, item}) => ({message: missingFeaturesMessage(diagnostics, item), details: []})
        },
        summary: reads => reads.map(({ownVerdict: {diagnostic}}) => missingFeaturesMessage(diagnostic.diagnostics, diagnostic.item)).join(' '),
        outputDiagnostics: {
            codes: [MISSING_TRAINING_FEATURES],
            itemOf: ({path}, recipe, {recipeNames}) => {
                const item = dataSetItem(recipe, path?.[3])
                return item && {...item, recipeNames}
            }
        },
        operations: [IMAGE_OUTPUT]
    },
    referenceFeedback({
        section: TRAINING_DATA,
        roles: [TRAINING_DATA_SOURCE],
        itemOf: ({path}, recipe) => dataSetItem(recipe, path?.[3])
    })
]

// Classification's, whose TRN button does not say that it has no training data: its layer, Retrieve and every recipe
// over it still do, as they hold it. Regression's TRN does say it.
export const unmarkedTrainingDataRequirements = trainingDataRequirements
    .map(declaration => ({...declaration, toolbarMark: false}))

const missingMessage = () => msg('process.classification.panel.trainingData.missing')

// Each recipe reused through a data set whose samples lack features, by name, and those features.
const missingFeaturesMessage = (diagnostics, {recipeNames}) => diagnostics
    .map(({provider, features}) => msg('process.classification.panel.trainingData.missingFeatures', {
        recipe: recipeNames[provider] || provider,
        features: listed(features, 'process.source.segments.andMore')
    }))
    .join(' ')

// The data set at an index, by its dataSetId, named as the training data list names it.
const dataSetItem = (recipe, index) => {
    const dataSet = index >= 0 ? recipe.model?.trainingData?.dataSets?.[index] : null
    return dataSet
        ? {id: dataSet.dataSetId, path: ['model', 'trainingData', 'dataSets', index], label: dataSet.name}
        : null
}
