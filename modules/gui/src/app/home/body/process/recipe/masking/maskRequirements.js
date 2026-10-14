import {MISSING_ROLE} from '#sepal/recipe/output/diagnostic'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What Masking needs of its mask, as its shared definition finds it (lib/js/shared/src/recipe/type/masking.js): one is
// selected. Its output read judges that (sourceRequirements.js), so the mask's section and the operations over the
// output say what that read establishes.

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
        operations: [IMAGE_OUTPUT]
    }
]

const isMaskPath = (path = []) => path.length === MASK_PATH.length && path.every((step, index) => step === MASK_PATH[index])

const missingMessage = () => msg('process.masking.panel.inputImage.imageMask.missing')
