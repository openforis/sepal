import {MISSING_INPUT_BAND, MISSING_ROLE} from '#sepal/recipe/output/diagnostic'
import {INPUT_IMAGERY_PATH} from '#sepal/recipe/source/inputImagery'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What Stack, Band Math and Remapping need of their input images' bands, as their shared output/readiness declarations
// judge them: each required band is one its source's current description provides. The output read judges it
// (sourceRequirements.js), so the input, its section and the operations over the output all say what that read
// establishes - the input and the section in one sentence each; the editor of one input reads its source itself and
// says which bands it no longer has, beside them (inputImage.jsx).
//
// `imageIndexOf(diagnostic, recipe)` locates a refusal's input in model order: each type locates its refusals where its
// configuration names the band.

export const INPUT_IMAGERY = {id: 'inputImagery', label: 'process.panels.inputImagery.button'}

export const INPUT_BANDS = 'INPUT_BANDS'

export const MISSING_INPUT_IMAGERY = 'MISSING_INPUT_IMAGERY'

// What every recipe zipping its input images needs of the list, as its shared definition finds it
// (lib/js/shared/src/recipe/source/inputImagery.js): one image at least. Its output read judges that, so the section
// and the operations over the output say what that read establishes. An image selected but not yet read, unreadable or
// gone is not this: what its source establishes is said as that.
export const missingInputImageryRequirement = section => ({
    id: MISSING_INPUT_IMAGERY,
    section,
    requirement: {id: MISSING_INPUT_IMAGERY, describe: () => ({message: noImageryMessage(), details: []})},
    summary: () => noImageryMessage(),
    outputDiagnostics: {
        codes: [MISSING_ROLE],
        itemOf: ({path}) => isImageryPath(path)
            ? {id: 'images', path: INPUT_IMAGERY_PATH, label: msg(section.label)}
            : null
    },
    // While the wizard has the section open, the list is being filled: its form holds Next until it is.
    wizardStepMark: false,
    operations: [IMAGE_OUTPUT]
})

export const inputImageryRequirements = imageIndexOf => [
    missingInputImageryRequirement(INPUT_IMAGERY),
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

const isImageryPath = (path = []) =>
    path.length === INPUT_IMAGERY_PATH.length && path.every((step, index) => step === INPUT_IMAGERY_PATH[index])

const noImageryMessage = () => msg('process.panels.inputImagery.form.noImagery')

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
