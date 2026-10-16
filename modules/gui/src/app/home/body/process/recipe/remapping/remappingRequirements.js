import _ from 'lodash'

import {CONSTRAINT_BAND_NOT_INCLUDED, MISSING_CONSTRAINT_INPUT} from '#sepal/recipe/output/diagnostic'
import {LEGEND_ENTRIES_PATH} from '#sepal/recipe/type/remapping'
import {INPUT_BANDS, inputImageryRequirements} from '~/app/home/body/process/panels/inputImagery/inputImageryRequirements'
import {msg} from '~/translate'

import {IMAGE_OUTPUT} from '../recipeOutput'

// What Remapping's mapping needs of its own configuration as applied, as its shared definition finds it
// (lib/js/shared/src/recipe/type/remapping.js): each constraint reads an input still there, and a band that input
// includes. Its output read judges that (sourceRequirements.js), so each legend entry holding such a constraint, the
// Mapping section and the operations over the output say what that read establishes, and so does every recipe whose
// image builds it. The constraint editor judges an edit itself, against the inputs and bands it offers, before it is
// applied (imageConstraints.jsx).

export const CONSTRAINT_REFERENCES_REQUIREMENT = 'remapping.constraintReferences'

const MAPPING = {id: 'mapping', label: 'process.remapping.panel.mapping.button.label'}

export const remappingInputRequirements = inputImageryRequirements(({path}) => path[3])

export const constraintSourceRequirement = remappingInputRequirements.find(({id}) => id === INPUT_BANDS)
constraintSourceRequirement.editor = {
    candidate: (recipe, {entryId, constraints}) => ({
        ...recipe,
        model: {...recipe.model, legend: {...recipe.model.legend, entries: recipe.model.legend.entries.map(entry =>
            entry.id === entryId ? {...entry, constraints} : entry)}}
    })
}

// Present the input findings only on draft constraints reading those bands. Other entries' failures do not prevent
// applying this entry's repair. The candidate uses the same rule, observations and currency as the applied output.
export const constraintSourceErrors = (diagnostics, constraints, images) => Object.fromEntries(constraints.flatMap(constraint => {
    const missing = diagnostics.some(({path}) => {
        const image = images[path[3]]
        return image?.imageId === constraint.image && image.includedBands?.[path[5]]?.band === constraint.band
    })
    return missing ? [[constraint.id, msg('process.remapping.requirement.sourceBandMissing', {band: constraint.band})]] : []
}))

export const remappingRequirements = [
    {
        id: CONSTRAINT_REFERENCES_REQUIREMENT,
        section: MAPPING,
        requirement: {id: CONSTRAINT_REFERENCES_REQUIREMENT, describe: diagnostic => describeProblems(diagnostic)},
        outputDiagnostics: {
            codes: [MISSING_CONSTRAINT_INPUT, CONSTRAINT_BAND_NOT_INCLUDED],
            itemOf: (diagnostic, recipe) => entryOf(diagnostic, recipe)
        },
        operations: [IMAGE_OUTPUT]
    }
]

// The legend entry a finding's constraint lies in, with its constraints, to name what they read.
const entryOf = ({path = []}, recipe) => {
    const isConstraint = path.length === LEGEND_ENTRIES_PATH.length + 3
        && LEGEND_ENTRIES_PATH.every((step, index) => path[index] === step)
    const entry = isConstraint ? recipe.model?.legend?.entries?.[path[LEGEND_ENTRIES_PATH.length]] : null
    return entry
        ? {id: entry.id, path: path.slice(0, LEGEND_ENTRIES_PATH.length + 1), label: entry.label, constraints: entry.constraints || []}
        : null
}

// Every problem of the entry, each once, in the order of its constraints.
const describeProblems = ({diagnostics, item}) => {
    const messages = _.uniq(_.sortBy(diagnostics, ({path}) => path.at(-1))
        .map(({code, path}) => code === CONSTRAINT_BAND_NOT_INCLUDED
            ? msg('process.remapping.requirement.bandNotIncluded', {band: item.constraints[path.at(-1)]?.band})
            : msg('process.remapping.requirement.missingInput')))
    return {message: messages[0], details: messages.slice(1)}
}
