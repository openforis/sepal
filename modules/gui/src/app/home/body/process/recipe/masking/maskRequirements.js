import {MISSING_ROLE} from '#sepal/recipe/output/diagnostic'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What Masking needs of its mask, as its shared definition finds it (lib/js/shared/src/recipe/type/masking.js): one is
// selected. Its output read judges that (sourceRequirements.js), so the mask's section and the operations over the
// output say what that read establishes, and so does the mask's editor, beside the selector of the kind its draft shows,
// for a draft choosing none (outputCandidate.js). The selector's own rule already holds Apply. While the set-up wizard
// has the mask open as its step, neither its toolbar button nor an untouched selector says it yet.

export const IMAGE_MASK = {id: 'imageMask', label: 'process.masking.panel.inputImage.imageMask.button.label'}

const MASK_PATH = ['model', 'imageMask']

export const maskRequirements = [
    {
        id: MISSING_ROLE,
        section: IMAGE_MASK,
        requirement: {id: MISSING_ROLE, describe: () => ({message: missingMessage(), details: []})},
        summary: () => missingMessage(),
        outputDiagnostics: {
            codes: [MISSING_ROLE],
            itemOf: ({path}) => isMaskPath(path) ? {id: IMAGE_MASK.id, path: MASK_PATH, label: msg(IMAGE_MASK.label)} : null
        },
        wizardStepMark: false,
        editor: {
            panel: IMAGE_MASK.id,
            input: (_diagnostic, {section}) => section === 'RECIPE_REF' ? 'recipe' : 'asset',
            describe: () => missingMessage(),
            blocksApply: false,
            // A kind shown with nothing chosen of it selects no mask.
            candidate: (recipe, mask) => ({...recipe, model: {...recipe.model, imageMask: mask.id ? mask : undefined}})
        },
        operations: [IMAGE_OUTPUT]
    }
]

const isMaskPath = (path = []) => path.length === MASK_PATH.length && path.every((step, index) => step === MASK_PATH[index])

const missingMessage = () => msg('process.masking.panel.inputImage.imageMask.missing')
