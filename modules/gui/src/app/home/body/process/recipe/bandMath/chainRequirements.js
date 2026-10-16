import _ from 'lodash'

import {MISSING_IMAGE, UNKNOWN_BAND, UNRESOLVED_REFERENCES} from '#sepal/recipe/bandMath/calculationReferences'
import {SUPPORTED, unsupported} from '#sepal/recipe/requirement/verdict'

import {allOutputNames, isUniqueOutputName, isValidOutputName, outputNameOf} from './panels/outputBands/outputImages'

export * from '#sepal/recipe/bandMath/calculationReferences'

// Output-selection rules remain local; applied calculation rules are shared execution readiness.
export const OUTPUTS_REQUIREMENT = 'bandMath.outputs'
export const OUTPUT_IMAGES_REQUIREMENT = 'bandMath.outputImages'
export const NO_OUTPUT_BANDS = 'NO_OUTPUT_BANDS'
export const INVALID_OUTPUT_NAME = 'INVALID_OUTPUT_NAME'
export const DUPLICATE_OUTPUT_NAME = 'DUPLICATE_OUTPUT_NAME'
export const NO_OUTPUT_IMAGES = 'NO_OUTPUT_IMAGES'

export const chainFacts = ({model}) => ({
    images: model?.inputImagery?.images || [],
    calculations: model?.calculations?.calculations || [],
    outputImages: model?.outputBands?.outputImages || []
})

export const outputItems = ({images, calculations, outputImages}) => {
    const outputNames = allOutputNames(outputImages)
    return outputImages.map(outputImage => {
        const calculation = calculations.find(({imageId}) => imageId === outputImage.imageId)
        const image = calculation || images.find(({imageId}) => imageId === outputImage.imageId)
        return {
            id: outputImage.imageId,
            path: ['outputBands.outputImages', {imageId: outputImage.imageId}],
            label: image?.name || outputImage.name,
            facts: {
                name: outputImage.name,
                bands: image ? (image.includedBands || []).map(({name}) => name) : null,
                outputBands: (outputImage.outputBands || []).map(({name}) => name),
                customNames: (outputImage.outputBands || []).map(({outputName}) => outputName).filter(Boolean),
                outputNames: (outputImage.outputBands || []).map(outputNameOf).filter(Boolean),
                allOutputNames: outputNames
            }
        }
    })
}

// UNRESOLVED_REFERENCES with every problem, each once: MISSING_IMAGE, UNKNOWN_BAND, NO_OUTPUT_BANDS,
// INVALID_OUTPUT_NAME or DUPLICATE_OUTPUT_NAME.
export const OUTPUT_REFERENCES = {
    id: OUTPUTS_REQUIREMENT,
    evaluate: ({name, bands, outputBands, customNames, outputNames, allOutputNames}) => verdictOf([
        ...bands
            ? outputBands.filter(band => !bands.includes(band)).map(band => ({code: UNKNOWN_BAND, variable: name, band}))
            : [{code: MISSING_IMAGE, variable: name}],
        ...outputBands.length ? [] : [{code: NO_OUTPUT_BANDS, variable: name}],
        ...customNames.filter(outputName => !isValidOutputName(outputName))
            .map(outputName => ({code: INVALID_OUTPUT_NAME, outputName})),
        ...outputNames.filter(outputName => !isUniqueOutputName(outputName, allOutputNames))
            .map(outputName => ({code: DUPLICATE_OUTPUT_NAME, outputName}))
    ])
}

// UNRESOLVED_REFERENCES with NO_OUTPUT_IMAGES where nothing is output at all: judged once, for the section.
export const OUTPUT_PRESENCE = {
    id: OUTPUT_IMAGES_REQUIREMENT,
    evaluate: ({outputImages}) => verdictOf(outputImages.length ? [] : [{code: NO_OUTPUT_IMAGES}])
}

const verdictOf = problems => {
    const unique = _.uniqWith(problems, _.isEqual)
    return unique.length
        ? unsupported({code: UNRESOLVED_REFERENCES, problems: unique})
        : {status: SUPPORTED}
}
