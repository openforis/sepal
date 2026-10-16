import {INVALID_CALCULATION} from '#sepal/recipe/output/diagnostic'
import {msg} from '~/translate'

import {IMAGE_OUTPUT} from '../recipeOutput'
import {
    CALCULATIONS_REQUIREMENT,
    chainFacts,
    DUPLICATE_OUTPUT_NAME,
    FORWARD_REFERENCE,
    INVALID_ARG_COUNT,
    INVALID_BAND_COUNT,
    INVALID_OUTPUT_NAME,
    MISSING_IMAGE,
    NO_OUTPUT_BANDS,
    NO_OUTPUT_IMAGES,
    OUTPUT_IMAGES_REQUIREMENT,
    OUTPUT_PRESENCE,
    OUTPUT_REFERENCES,
    outputItems,
    OUTPUTS_REQUIREMENT,
    SELF_REFERENCE,
    SYNTAX_ERROR,
    UNKNOWN_BAND,
    UNKNOWN_VARIABLE
} from './chainRequirements'

// Applied calculation problems come from shared readiness. Output-selection rules remain local.
// Both are said on the sections and items they concern. Every calculation is built whenever its output is, read by
// an output or not, so any not met holds the output back - its previews and Retrieve alike.

const CALCULATIONS = {id: 'calculations', label: 'process.bandMath.panel.calculations.button'}
const OUTPUT_BANDS = {id: 'outputBands', label: 'process.bandMath.panel.outputBands.button'}

export const bandMathRequirements = [
    {
        id: CALCULATIONS_REQUIREMENT,
        section: CALCULATIONS,
        requirement: {id: CALCULATIONS_REQUIREMENT, describe: ({diagnostics}) => describeProblems({problems: diagnostics.flatMap(({problems}) => problems)})},
        outputDiagnostics: {
            codes: [INVALID_CALCULATION],
            itemOf: ({path}, recipe) => {
                const calculation = recipe.model?.calculations?.calculations?.[path[3]]
                return calculation ? {id: calculation.imageId, path, label: calculation.name} : null
            }
        },
        operations: [IMAGE_OUTPUT]
    },
    {
        id: OUTPUTS_REQUIREMENT,
        section: OUTPUT_BANDS,
        requirement: {...OUTPUT_REFERENCES, describe: diagnostic => describeProblems(diagnostic)},
        localFacts: chainFacts,
        items: outputItems,
        operations: [IMAGE_OUTPUT]
    },
    {
        id: OUTPUT_IMAGES_REQUIREMENT,
        section: OUTPUT_BANDS,
        requirement: {...OUTPUT_PRESENCE, describe: diagnostic => describeProblems(diagnostic)},
        localFacts: chainFacts,
        operations: [IMAGE_OUTPUT]
    }
]

const describeProblems = ({problems}) => {
    const messages = problems.map(describeProblem)
    return {message: messages[0], details: messages.slice(1)}
}

const describeProblem = problem => msg(`process.bandMath.requirement.${MESSAGES[problem.code]}`, problem)

const MESSAGES = {
    [SYNTAX_ERROR]: 'syntaxError',
    [UNKNOWN_VARIABLE]: 'unknownVariable',
    [UNKNOWN_BAND]: 'unknownBand',
    [FORWARD_REFERENCE]: 'forwardReference',
    [SELF_REFERENCE]: 'selfReference',
    [MISSING_IMAGE]: 'missingImage',
    [INVALID_ARG_COUNT]: 'invalidArgCount',
    [INVALID_BAND_COUNT]: 'invalidBandCount',
    [NO_OUTPUT_BANDS]: 'noOutputBands',
    [NO_OUTPUT_IMAGES]: 'noOutputImages',
    [INVALID_OUTPUT_NAME]: 'invalidOutputName',
    [DUPLICATE_OUTPUT_NAME]: 'duplicateOutputName'
}
