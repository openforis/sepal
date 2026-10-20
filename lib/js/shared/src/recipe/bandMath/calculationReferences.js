import _ from 'lodash'

import {SUPPORTED, unsupported} from '../requirement/verdict.js'
import {
    analyzeExpression,
    INVALID_ARG_COUNT,
    INVALID_BAND,
    INVALID_BAND_COUNT,
    SYNTAX_ERROR,
    UNDEFINED_VARIABLE
} from './expressionAnalysis.js'

// Calculation scope and diagnostics shared by execution readiness and draft/synchronization reads.
// Only inputs and earlier calculations are in scope; self and forward references cannot form a valid cycle.

// An applied Band Math calculation cannot resolve its expression or selected bands in the configured scope.
// The finding's problems identify the reference or syntax issue; its path identifies the originating calculation.
export const INVALID_CALCULATION = 'INVALID_CALCULATION'

export {INVALID_ARG_COUNT, INVALID_BAND_COUNT, SYNTAX_ERROR}

export const CALCULATIONS_REQUIREMENT = 'bandMath.calculations'

export const UNRESOLVED_REFERENCES = 'UNRESOLVED_REFERENCES'

export const UNKNOWN_VARIABLE = 'UNKNOWN_VARIABLE'
export const UNKNOWN_BAND = 'UNKNOWN_BAND'
export const FORWARD_REFERENCE = 'FORWARD_REFERENCE'
export const SELF_REFERENCE = 'SELF_REFERENCE'
export const MISSING_IMAGE = 'MISSING_IMAGE'

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

// Execution builds every calculation, including intermediate ones. Only originating problems are findings: a later
// calculation reading one of them is held by the recipe's readiness, without inventing another problem there.
export const calculationReferenceFindings = model => calculationItems({
    images: model?.inputImagery?.images || [],
    calculations: model?.calculations?.calculations || []
}).flatMap((item, index) => {
    const {diagnostic} = CALCULATION_REFERENCES.evaluate(item.facts)
    return diagnostic ? [{path: ['model', 'calculations', 'calculations', index], problems: diagnostic.problems}] : []
})
