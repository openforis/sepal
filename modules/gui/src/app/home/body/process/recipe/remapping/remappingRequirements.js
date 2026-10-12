import _ from 'lodash'

import {SUPPORTED, unsupported} from '#sepal/recipe/requirement/verdict'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {IMAGE_OUTPUT} from '../recipeOutput'

// What Remapping's mapping needs of its own configuration as applied, judged from the model alone: each constraint reads
// a band of one input by its imageId, so the input must still be there and include the band, as the constraint editor
// offers it. Any constraint that does not holds the image output back - its previews and Retrieve alike - even where
// Earth Engine would build it: execution (lib/js/ee/src/remapping/remapping.js) builds an asset input with every band it
// stores, so a constraint reading one its input does not include would still execute. Whether an input's source holds
// its bands is not judged here.

export const CONSTRAINT_REFERENCES_REQUIREMENT = 'remapping.constraintReferences'
export const UNRESOLVED_CONSTRAINTS = 'UNRESOLVED_CONSTRAINTS'
export const MISSING_INPUT = 'MISSING_INPUT'
export const BAND_NOT_INCLUDED = 'BAND_NOT_INCLUDED'

const MAPPING = {id: 'mapping', label: 'process.remapping.panel.mapping.button.label'}

export const constraintFacts = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || [],
    entries: selectFrom(recipe, 'model.legend.entries') || []
})

// One item per legend entry, with the bands each input includes, by imageId.
export const constraintItems = ({images, entries}) => {
    const includedBands = Object.fromEntries(images.map(({imageId, includedBands = []}) =>
        [imageId, includedBands.map(({band}) => band)]
    ))
    return entries.map(entry => ({
        id: entry.id,
        path: ['legend.entries', {id: entry.id}],
        label: entry.label,
        facts: {
            constraints: (entry.constraints || []).map(({image, band}) => ({image, band})),
            includedBands
        }
    }))
}

// UNRESOLVED_CONSTRAINTS with every problem, each once: MISSING_INPUT or BAND_NOT_INCLUDED.
export const CONSTRAINT_REFERENCES = {
    id: CONSTRAINT_REFERENCES_REQUIREMENT,
    evaluate: ({constraints, includedBands}) => {
        const problems = _.uniqWith(constraints.flatMap(({image, band}) =>
            !includedBands[image]
                ? [{code: MISSING_INPUT}]
                : includedBands[image].includes(band) ? [] : [{code: BAND_NOT_INCLUDED, band}]
        ), _.isEqual)
        return problems.length
            ? unsupported({code: UNRESOLVED_CONSTRAINTS, problems})
            : {status: SUPPORTED}
    }
}

export const remappingRequirements = [
    {
        id: CONSTRAINT_REFERENCES_REQUIREMENT,
        section: MAPPING,
        requirement: {...CONSTRAINT_REFERENCES, describe: diagnostic => describeProblems(diagnostic)},
        localFacts: constraintFacts,
        items: constraintItems,
        operations: [IMAGE_OUTPUT]
    }
]

const describeProblems = ({problems}) => {
    const messages = problems.map(problem => msg(`process.remapping.requirement.${MESSAGES[problem.code]}`, problem))
    return {message: messages[0], details: messages.slice(1)}
}

const MESSAGES = {
    [MISSING_INPUT]: 'missingInput',
    [BAND_NOT_INCLUDED]: 'bandNotIncluded'
}
