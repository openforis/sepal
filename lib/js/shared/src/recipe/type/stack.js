import {defineRecipeType} from '../defineRecipeType.js'
import {DUPLICATE_BAND_NAME, INCOMPLETE_IMAGE_OUTPUT, MISSING_INPUT_BAND, UNMAPPED_INPUT} from '../output/diagnostic.js'
import {imageOutputProvider} from '../output/provider.js'
import {isBlank} from '../source/extract.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'

// Stack renames and concatenates its input images in model order (lib/js/ee/src/stack/stack.js). The output
// band names are a mapping over that list, not references.
//
// Each output band corresponds to one band of one input: the input images in model order, and within each the bands
// its `bandNames` entry maps, found by the image's id, in that entry's order. Selecting and renaming change neither
// values nor representation, so an output band takes its input band's dimensionality, pyramiding policy and encoding
// from that input's current description - never from the band lists copied into the model when it was selected. A
// scalar its input states no policy for is averaged at coarser levels, as Earth Engine's default always exported it;
// an array gets no policy it was not given.
//
// The mapping is checked before any input is read: an image without an entry, a blank name, or a final name already
// taken is known from the configuration alone, whatever the inputs turn out to hold.

export {INPUT_IMAGE}

const IMAGES_PATH = ['model', 'inputImagery', 'images']
const BAND_NAMES_PATH = ['model', 'bandNames', 'bandNames']

// Per input image, in model order: the bands its entry maps, or null for an image with no entry.
export const stackBandCorrespondence = model => {
    const entries = model?.bandNames?.bandNames || []
    return (model?.inputImagery?.images || []).map((image, imageIndex) => {
        const entryIndex = entries.findIndex(({imageId}) => imageId === image.imageId)
        return {
            image,
            path: [...IMAGES_PATH, imageIndex],
            bands: entryIndex < 0
                ? null
                : (entries[entryIndex].bands || []).map(({originalName, outputName}, bandIndex) => ({
                    originalName,
                    outputName,
                    path: [...BAND_NAMES_PATH, entryIndex, 'bands', bandIndex]
                }))
        }
    })
}

export const stackOutputNames = model =>
    stackBandCorrespondence(model).flatMap(({bands}) => (bands || []).map(({outputName}) => outputName))

export default defineRecipeType({
    type: 'STACK',
    directSources: model => fromInputImagery(model),
    imageOutput: imageOutputProvider({
        describe: ({recipe, inputs}) => {
            const correspondence = stackBandCorrespondence(recipe.model)
            const refusals = mappingRefusals(correspondence)
            if (refusals.length) {
                return {diagnostics: refusals}
            }
            const described = inputs()
            if (!described) {
                return null
            }
            const missing = []
            const bands = correspondence.flatMap(({image, bands}) => {
                const input = described.find(({description: {executionReference}}) =>
                    executionReference.type === image.type && executionReference.id === image.id
                )
                return bands.flatMap(({originalName, outputName, path}) => {
                    const source = input?.description.output.bands.find(({name}) => name === originalName)
                    if (!source) {
                        missing.push({code: MISSING_INPUT_BAND, path: [...path, 'originalName']})
                        return []
                    }
                    return [outputBand(outputName, source)]
                })
            })
            return missing.length
                ? {diagnostics: missing}
                : {bands, evidence: []}
        }
    })
})

const mappingRefusals = correspondence => {
    const refusals = []
    const taken = new Set()
    correspondence.forEach(({bands, path: imagePath}) => {
        if (!bands) {
            refusals.push({code: UNMAPPED_INPUT, path: imagePath})
            return
        }
        bands.forEach(({originalName, outputName, path}) => {
            if (isBlank(originalName) || isBlank(outputName)) {
                refusals.push({code: INCOMPLETE_IMAGE_OUTPUT, path})
            } else if (taken.has(outputName)) {
                refusals.push({code: DUPLICATE_BAND_NAME, path: [...path, 'outputName']})
            } else {
                taken.add(outputName)
            }
        })
    })
    return refusals
}

const outputBand = (name, {dataType, pyramidingPolicy, encoding}) => {
    const policy = pyramidingPolicy ?? (dataType.arrayDimensions === 0 ? 'mean' : undefined)
    return {
        name,
        dataType,
        ...(policy && {pyramidingPolicy: policy}),
        ...(encoding && {encoding})
    }
}
