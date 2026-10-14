import {NO_TRAINING_DATA} from '#sepal/recipe/output/diagnostic'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What Classification needs of its training data, as its shared output declaration refuses it
// (lib/js/shared/src/recipe/type/classification.js): a classifier that is trained has something to train on. The
// output read judges it (sourceRequirements.js), so the Training data section and the operations over the output say
// what that read establishes, of the training data as a whole.

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

const missingMessage = () => msg('process.classification.panel.trainingData.missing')
