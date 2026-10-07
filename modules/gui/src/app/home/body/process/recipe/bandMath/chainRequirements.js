import _ from 'lodash'

import {SUPPORTED, unsupported} from '#sepal/recipe/requirement/verdict'
import {
    analyzeExpression,
    INVALID_ARG_COUNT,
    INVALID_BAND,
    INVALID_BAND_COUNT,
    SYNTAX_ERROR,
    UNDEFINED_VARIABLE
} from '~/widget/codeEditor/expressionAnalysis'

// What Band Math's configuration needs of itself (lib/js/ee/src/bandMath/bandMath.js builds it): pure, judged from the
// model alone. Execution builds every calculation in order, over the inputs and the calculations before it, so each one
// must read only those - an expression by variable name and physical band name, a function by the image id and
// physical band name it selects - and every output band must be a band of the image it is taken from. Whether an
// input's bands exist upstream is not judged here.
//
// A calculation that reads an earlier calculation depends on it, and an output taken from a calculation depends on that
// calculation (`prerequisites`, sourceRequirements.js): neither repeats what the other finds.

export {INVALID_ARG_COUNT, INVALID_BAND_COUNT, SYNTAX_ERROR}

export const CALCULATIONS_REQUIREMENT = 'bandMath.calculations'
export const OUTPUTS_REQUIREMENT = 'bandMath.outputs'

export const UNRESOLVED_REFERENCES = 'UNRESOLVED_REFERENCES'

export const UNKNOWN_VARIABLE = 'UNKNOWN_VARIABLE'
export const UNKNOWN_BAND = 'UNKNOWN_BAND'
export const FORWARD_REFERENCE = 'FORWARD_REFERENCE'
export const SELF_REFERENCE = 'SELF_REFERENCE'
export const MISSING_IMAGE = 'MISSING_IMAGE'

export const chainFacts = ({model}) => ({
    images: model?.inputImagery?.images || [],
    calculations: model?.calculations?.calculations || [],
    outputImages: model?.outputBands?.outputImages || []
})

export const calculationItems = ({images, calculations}) =>
    calculations.map((_calculation, index) => calculationItem({images, calculations}, index))

// A calculation as its position lets it read: the inputs and the calculations before it, as configured.
export const calculationItem = ({images, calculations}, index) => {
    const calculation = calculations[index]
    const earlier = calculations.slice(0, index)
    const scope = [...images, ...earlier]
    const analysis = calculation.type === 'EXPRESSION'
        ? analyzeExpression(calculation.expression || '', scope)
        : null
    const read = analysis
        ? analysis.usedBands
        : calculation.type === 'FUNCTION' ? calculation.usedBands || [] : []
    const earlierIds = earlier.map(({imageId}) => imageId)
    return {
        id: calculation.imageId,
        path: ['calculations.calculations', {imageId: calculation.imageId}],
        label: calculation.name,
        facts: {
            type: calculation.type,
            analysis,
            usedBands: calculation.type === 'FUNCTION' ? calculation.usedBands || [] : [],
            scope: scope.map(({imageId, name, includedBands}) => ({imageId, name, bands: (includedBands || []).map(({name}) => name)})),
            later: calculations.slice(index + 1).map(({imageId, name}) => ({imageId, name})),
            self: {imageId: calculation.imageId, name: calculation.name}
        },
        prerequisites: _.uniq(read.map(({imageId}) => imageId).filter(imageId => earlierIds.includes(imageId)))
            .map(item => ({declaration: CALCULATIONS_REQUIREMENT, item}))
    }
}

export const outputItems = ({images, calculations, outputImages}) =>
    outputImages.map(outputImage => {
        const calculation = calculations.find(({imageId}) => imageId === outputImage.imageId)
        const image = calculation || images.find(({imageId}) => imageId === outputImage.imageId)
        return {
            id: outputImage.imageId,
            path: ['outputBands.outputImages', {imageId: outputImage.imageId}],
            label: image?.name || outputImage.name,
            facts: {
                name: outputImage.name,
                bands: image ? (image.includedBands || []).map(({name}) => name) : null,
                outputBands: (outputImage.outputBands || []).map(({name}) => name)
            },
            prerequisites: calculation
                ? [{declaration: CALCULATIONS_REQUIREMENT, item: calculation.imageId}]
                : []
        }
    })

// UNRESOLVED_REFERENCES with every problem, each once: SYNTAX_ERROR, UNKNOWN_VARIABLE, UNKNOWN_BAND, FORWARD_REFERENCE,
// SELF_REFERENCE, MISSING_IMAGE, INVALID_ARG_COUNT or INVALID_BAND_COUNT.
export const CALCULATION_REFERENCES = {
    id: CALCULATIONS_REQUIREMENT,
    evaluate: facts => verdictOf(
        facts.type === 'EXPRESSION' ? expressionProblems(facts)
            : facts.type === 'FUNCTION' ? functionProblems(facts)
                : []
    )
}

export const OUTPUT_REFERENCES = {
    id: OUTPUTS_REQUIREMENT,
    evaluate: ({name, bands, outputBands}) => verdictOf(bands
        ? outputBands.filter(band => !bands.includes(band)).map(band => ({code: UNKNOWN_BAND, variable: name, band}))
        : [{code: MISSING_IMAGE, variable: name}]
    )
}

const expressionProblems = ({analysis, later, self}) =>
    analysis.diagnostics.map(({code, values}) => {
        if (code === UNDEFINED_VARIABLE) {
            return variableProblem(values.variableName, later, self)
        }
        if (code === INVALID_BAND) {
            return {code: UNKNOWN_BAND, variable: values.imageName, band: values.bandName}
        }
        return {code, ...values}
    })

const variableProblem = (variable, later, self) => {
    if (variable === self.name) {
        return {code: SELF_REFERENCE, variable}
    }
    const laterCalculation = later.find(({name}) => name === variable)
    return laterCalculation
        ? {code: FORWARD_REFERENCE, variable, item: laterCalculation.imageId}
        : {code: UNKNOWN_VARIABLE, variable}
}

const functionProblems = ({usedBands, scope, later, self}) =>
    usedBands.map(({imageId, imageName, name: band}) => {
        const image = scope.find(image => image.imageId === imageId)
        if (image) {
            return image.bands.includes(band) ? null : {code: UNKNOWN_BAND, variable: image.name, band}
        }
        if (imageId === self.imageId) {
            return {code: SELF_REFERENCE, variable: self.name}
        }
        const laterCalculation = later.find(calculation => calculation.imageId === imageId)
        return laterCalculation
            ? {code: FORWARD_REFERENCE, variable: laterCalculation.name, item: imageId}
            : {code: MISSING_IMAGE, variable: imageName, band}
    }).filter(Boolean)

const verdictOf = problems => {
    const unique = _.uniqWith(problems, _.isEqual)
    return unique.length
        ? unsupported({code: UNRESOLVED_REFERENCES, problems: unique})
        : {status: SUPPORTED}
}
