import {MISSING_INPUT_BAND} from '#sepal/recipe/output/diagnostic'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What Stack and Band Math need of their input images' bands, as their shared output declarations refuse them: each
// band they take from an input is one its source's current description provides. The output read judges it
// (sourceRequirements.js), so the input, its section and the operations over the output all say what that read
// establishes - the input and the section in one sentence each; the editor of one input reads its source itself and
// says which bands it no longer has, beside them (inputImage.jsx).
//
// `imageIndexOf(diagnostic, recipe)` locates a refusal's input in model order: each type locates its refusals where its
// configuration names the band.

export const INPUT_IMAGERY = {id: 'inputImagery', label: 'process.panels.inputImagery.button'}

export const INPUT_BANDS = 'INPUT_BANDS'

export const inputImageryRequirements = imageIndexOf => [
    {
        id: INPUT_BANDS,
        section: INPUT_IMAGERY,
        requirement: {
            id: INPUT_BANDS,
            describe: () => ({message: msg('process.panels.inputImagery.unavailableBands.input'), details: []})
        },
        summary: () => msg('process.panels.inputImagery.unavailableBands.inputs'),
        outputDiagnostics: {
            codes: [MISSING_INPUT_BAND],
            itemOf: (diagnostic, recipe, {recipeNames}) => itemOf(imageIndexOf(diagnostic, recipe), recipe, recipeNames)
        },
        operations: [IMAGE_OUTPUT]
    }
]

// The input image at an index, by its imageId, named as the inputs list names it.
const itemOf = (imageIndex, recipe, recipeNames) => {
    const image = imageIndex >= 0 ? recipe.model?.inputImagery?.images?.[imageIndex] : null
    return image
        ? {
            id: image.imageId,
            path: ['model', 'inputImagery', 'images', imageIndex],
            label: image.type === 'RECIPE_REF' ? recipeNames[image.id] || image.id : image.id
        }
        : null
}
