import {MISSING_INPUT_BAND} from '#sepal/recipe/output/diagnostic'
import {msg} from '~/translate'

import {ASSET_UNAVAILABLE, IMAGE_OUTPUT} from './recipeOutput'
import {MISSING_SOURCE} from './sourceRequirements'

// What Class Change and Index Change need of the two images they compare, as their shared output declarations refuse
// them (lib/js/shared/src/recipe/selectedBands.js), and of the recipes they select: each band an image names is one its
// source's current description provides, and a recipe selected is one storage still holds for the user. The output read
// judges it (sourceRequirements.js), so the image's toolbar button, and the operations over the output, say what that
// read establishes - the button in one sentence; the panel editing the image judges its values by the same rule before
// they are applied, and says beside each field what it lacks. A selected asset found missing is said the same way.
//
// `images` are [{section, role, key}]: the section editing each image, the role it fills and the model key it is kept
// under.

export const changeImageRequirements = images => images.map(({section, role, key}) => ({
    id: `${key}.selection`,
    section,
    requirement: {id: `${key}.selection`, describe: ({diagnostics}) => ({message: summaryOf(diagnostics), details: []})},
    summary: reads => summaryOf(reads.flatMap(({verdict}) => verdict.diagnostic.diagnostics)),
    outputDiagnostics: {
        codes: [MISSING_INPUT_BAND],
        references: [role],
        itemOf: ({path}) => path?.[1] === key ? {id: key, path: ['model', key], label: section.label} : null
    },
    editor: {
        panel: section.id,
        input: ({code, path}, values) => SOURCE_GONE.includes(code) ? sourceInputOf(values) : path[2],
        describe: (diagnostics, values) => fieldMessageOf(diagnostics, values),
        candidate: (recipe, model) => ({...recipe, model: {...recipe.model, [key]: model}})
    },
    operations: [IMAGE_OUTPUT]
}))

// The field the panel selects its source in.
const sourceInputOf = ({section}) => section === 'RECIPE_REF' ? 'recipe' : 'asset'

const SOURCE_GONE = [MISSING_SOURCE, ASSET_UNAVAILABLE]

const summaryOf = diagnostics => {
    const codes = diagnostics.map(({code}) => code)
    return codes.includes(MISSING_SOURCE) ? msg('process.requirement.inputImage.missingRecipe')
        : codes.includes(ASSET_UNAVAILABLE) ? msg('process.requirement.inputImage.missingAsset')
            : msg('process.requirement.inputImage.unavailableBands')
}

const fieldMessageOf = (diagnostics, values) => {
    const codes = diagnostics.map(({code}) => code)
    return codes.includes(MISSING_SOURCE) ? msg('process.requirement.inputImage.field.missingRecipe')
        : codes.includes(ASSET_UNAVAILABLE) ? msg('process.requirement.inputImage.field.missingAsset')
            : msg('process.requirement.inputImage.field.unavailableBand', {band: values[diagnostics[0].path[2]]})
}
