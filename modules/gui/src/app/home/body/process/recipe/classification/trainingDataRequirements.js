import {NO_TRAINING_DATA} from '#sepal/recipe/output/diagnostic'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What Classification and Regression need of their training data, as their shared output declarations refuse it
// (lib/js/shared/src/recipe/trainingData.js): a classifier that is trained has something to train on. The output read
// judges it (sourceRequirements.js), so the Training data section and the operations over the output say what that read
// establishes, of the training data as a whole.

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
    }
]

// Classification's, whose TRN button does not say that it has no training data: its layer, Retrieve and every recipe
// over it still do, as they hold it. Regression's TRN does say it.
export const unmarkedTrainingDataRequirements = trainingDataRequirements
    .map(declaration => ({...declaration, toolbarMark: false}))

const missingMessage = () => msg('process.classification.panel.trainingData.missing')
