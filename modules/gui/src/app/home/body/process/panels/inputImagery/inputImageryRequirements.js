import {MISSING_INPUT_BAND} from '#sepal/recipe/output/diagnostic'
import {SUPPORTED, unsupported} from '#sepal/recipe/requirement/verdict'
import {INPUT_IMAGE, INPUT_IMAGERY_PATH, inputImageryRequirement} from '#sepal/recipe/source/inputImagery'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {referenceFeedback} from '~/app/home/body/process/recipe/referenceFeedback'
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

// The input list, as the one item of its section the requirement that it lists an image is read for.
export const INPUT_IMAGES_ITEM = 'images'

// What every recipe zipping its input images needs of the list, by its shared definition
// (lib/js/shared/src/recipe/source/inputImagery.js), which server readiness evaluates too: one image at least. Judged
// here over the recipe's own model, so it needs no output read, as set-up not yet done (`incomplete`), and read for the
// list as one item (`INPUT_IMAGES_ITEM`), met or not, for what depends on there being inputs to wait on it. An image
// selected but not yet read, unreadable or gone is not this: what its source establishes is said as that.
export const missingInputImageryRequirement = section => ({
    id: MISSING_INPUT_IMAGERY,
    section,
    localFacts: recipe => ({missing: lacksInputImagery(recipe.model)}),
    items: facts => [{id: INPUT_IMAGES_ITEM, path: INPUT_IMAGERY_PATH, label: msg(section.label), facts}],
    requirement: {
        id: MISSING_INPUT_IMAGERY,
        evaluate: ({missing}) => missing
            ? unsupported({code: MISSING_INPUT_IMAGERY, incomplete: true})
            : {status: SUPPORTED},
        describe: () => ({message: noImageryMessage(), details: []})
    },
    summary: () => noImageryMessage(),
    // While the wizard has the section open, the list is being filled: its panel holds Next until it is.
    wizardStepMark: false,
    operations: [IMAGE_OUTPUT]
})

// Whether a model lists no input image, by the shared rule: for its requirement, and for the list panels showing and
// submitting the list.
export const lacksInputImagery = model => inputImageryRequirement.findings(model).length > 0

export const inputImageryRequirements = imageIndexOf => [
    missingInputImageryRequirement(INPUT_IMAGERY),
    inputRecipeFeedback(INPUT_IMAGERY),
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

export const inputRecipeFeedback = section => ({
    ...referenceFeedback({
        section,
        roles: [INPUT_IMAGE],
        itemOf: ({path}, recipe, {recipeNames}) => itemOf(path[3], recipe, recipeNames)
    }),
    editor: {
        panel: 'inputImage',
        input: 'recipe',
        explain: true,
        candidate: (recipe, image) => ({
            ...recipe,
            model: {...recipe.model, inputImagery: {images: [image]}}
        })
    }
})

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
