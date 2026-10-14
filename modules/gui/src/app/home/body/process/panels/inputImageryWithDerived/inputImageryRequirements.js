import {bandSetLocation} from '#sepal/recipe/bandSets'
import {INSUFFICIENT_INPUT_BANDS, MISSING_INPUT_BAND, UNDERIVABLE_INPUT_INDEX} from '#sepal/recipe/output/diagnostic'
import {missingInputImageryRequirement} from '~/app/home/body/process/panels/inputImagery/inputImageryRequirements'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What Classification, Regression and Unsupervised Classification need of their input images' band sets, as their
// shared output declarations refuse them (lib/js/shared/src/recipe/bandSets.js): each image's band sets select only
// what its source's current description provides. The output read judges it (sourceRequirements.js), so the input,
// its section and the operations over the output all say what that read establishes - the input and the section in
// one sentence each; the editor of one input judges its values by the same rule before they are applied, the input
// alone, and says what each band set and selection lacks (imageForm.jsx).

export const INPUT_IMAGERY = {id: 'inputImagery', label: 'process.classification.panel.inputImagery.button'}

export const INPUT_BAND_SETS = 'INPUT_BAND_SETS'

export const inputImageryRequirements = [
    missingInputImageryRequirement(INPUT_IMAGERY),
    {
        id: INPUT_BAND_SETS,
        section: INPUT_IMAGERY,
        requirement: {id: INPUT_BAND_SETS, describe: diagnostic => describeFindings(diagnostic)},
        summary: reads => summarize(reads),
        outputDiagnostics: {
            codes: [MISSING_INPUT_BAND, UNDERIVABLE_INPUT_INDEX, INSUFFICIENT_INPUT_BANDS],
            itemOf: (diagnostic, recipe, {recipeNames}) => itemOf(diagnostic, recipe, recipeNames)
        },
        editor: {
            panel: 'inputImage',
            input: 'bandSetSpecs',
            candidate: (recipe, image) => ({...recipe, model: {...recipe.model, inputImagery: {images: [image]}}})
        },
        operations: [IMAGE_OUTPUT]
    }
]

// The input image a refusal is about, by its imageId, named as the inputs list names it.
const itemOf = ({path}, recipe, recipeNames) => {
    const location = bandSetLocation(path)
    const image = location && recipe.model?.inputImagery?.images?.[location.imageIndex]
    return image
        ? {
            id: image.imageId,
            path: ['model', 'inputImagery', 'images', location.imageIndex],
            label: image.type === 'RECIPE_REF' ? recipeNames[image.id] || image.id : image.id,
            image
        }
        : null
}

// An input's mark and its section's summarize: what each selection lacks is said beside it, in the input's editor. A
// band combination short of bands, where nothing is unavailable, is said as that.
const describeFindings = ({diagnostics}) => ({
    message: incompleteOnly(diagnostics)
        ? msg('process.classification.panel.inputImagery.unavailableSelections.incompleteCombination')
        : msg('process.classification.panel.inputImagery.unavailableSelections.input'),
    details: []
})

const summarize = reads =>
    incompleteOnly(reads.flatMap(({verdict}) => verdict.diagnostic.diagnostics))
        ? msg('process.classification.panel.inputImagery.unavailableSelections.incompleteCombination')
        : msg('process.classification.panel.inputImagery.unavailableSelections.inputs')

const incompleteOnly = diagnostics =>
    diagnostics.every(({code}) => code === INSUFFICIENT_INPUT_BANDS)
