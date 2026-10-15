import {defineRecipeType} from '../defineRecipeType.js'
import {CONSTRAINT_BAND_NOT_INCLUDED, MISSING_CONSTRAINT_INPUT} from '../output/diagnostic.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT} from '../output/readiness.js'
import {fromInputImagery, INPUT_IMAGE, inputImageryRequirement} from '../source/inputImagery.js'

// Remapping applies legend constraints to its input images (lib/js/ee/src/remapping/remapping.js). The legend
// describes output values, not sources.

export {INPUT_IMAGE}

export const LEGEND_ENTRIES_PATH = ['model', 'legend', 'entries']

// Each legend entry is a class value, so the band is categorical.
export const REMAPPING_BANDS = [
    {name: 'class', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mode'}
]

// Without entries there is no rule to remap by, and execution builds an image without bands.
export const hasRemappingLegend = model => Boolean(model?.legend?.entries?.length)

export const remappingBands = model => hasRemappingLegend(model) ? REMAPPING_BANDS : []

// Each constraint reads a band of one input, by its imageId (`image`), from the image execution builds of the bands that
// input includes. One naming an input the list no longer holds has nothing to read. One naming a band its input does
// not include reads what the configuration no longer selects: an asset input is built with every band it stores, so
// Earth Engine may still build it, but the configuration no longer says what it reads. Each is found at the constraint,
// from the configuration alone: whether an input's source holds a band it includes is its description's to say.
export const constraintInputRequirement = {
    code: MISSING_CONSTRAINT_INPUT,
    operations: [IMAGE_OUTPUT],
    findings: model => unresolvedConstraints(model, included => !included)
}

export const constraintBandRequirement = {
    code: CONSTRAINT_BAND_NOT_INCLUDED,
    operations: [IMAGE_OUTPUT],
    findings: model => unresolvedConstraints(model, (included, {band}) => included && !included.includes(band))
}

export default defineRecipeType({
    type: 'REMAPPING',
    directSources: model => fromInputImagery(model),
    executionNeeds: {[IMAGE_OUTPUT]: {[INPUT_IMAGE]: IMAGE_OUTPUT}},
    configurationRequirements: [inputImageryRequirement, constraintInputRequirement, constraintBandRequirement],
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => ({bands: remappingBands(recipe.model), evidence: []})
    })
})

// The constraints for which `unresolved(includedBands, constraint)` holds, each located in its entry; `includedBands`
// are those of the input it names, undefined where the list holds none by that imageId.
const unresolvedConstraints = (model, unresolved) => {
    const includedBands = new Map((model?.inputImagery?.images || [])
        .map(({imageId, includedBands}) => [imageId, (includedBands || []).map(({band}) => band)]))
    return (model?.legend?.entries || []).flatMap((entry, entryIndex) =>
        (entry?.constraints || []).flatMap((constraint, constraintIndex) =>
            unresolved(includedBands.get(constraint.image), constraint)
                ? [{path: [...LEGEND_ENTRIES_PATH, entryIndex, 'constraints', constraintIndex]}]
                : []
        )
    )
}
