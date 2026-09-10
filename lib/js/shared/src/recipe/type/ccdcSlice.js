import {defineRecipeType} from '../defineRecipeType.js'
import {oneInputTransformation} from '../output/transformation.js'
import {fromSelection} from '../source/extract.js'

// CCDC Slice selects one source - a CCDC recipe, an asset-mosaic recipe over a segments asset, or a
// segments asset - and stores it in `model.source` as {type, id} plus, for an asset, the date
// representation the user configured. Older GUIs also saved a copy of the source's description beside the
// reference; those fields are compatibility for readers that have not moved on, never structure.
//
// Slice is a TRANSFORMATION, not preservation: segment arrays become scalar bands for one date or one
// range. WHICH scalar bands depends on the operation selected, so the output is derived from the source's
// physical bands together with this recipe's date mode and options.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'

export const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']

const DEFAULT_HARMONICS = 3

// The harmonics the segment-slice operation always emits phase and amplitude for, whatever `harmonics`
// says: lib/js/ee/src/timeSeries/ccdcSlice.js calls phaseAndAmplitude with a literal 3 there, while the
// value bands it slices do follow the option.
const SEGMENT_SLICE_HARMONICS = 3

const sequence = count => Array.from({length: Math.max(0, count)}, (_value, index) => index + 1)

const harmonicsOf = harmonics =>
    Number.isInteger(harmonics) && harmonics >= 0 ? harmonics : DEFAULT_HARMONICS

// Averaging over a range, and interpolating between segments, both select `sliceBandNames` in
// temporalSegmentation.js: timing bands first, then one group per measure, then phases and amplitudes for
// as many harmonics as were asked for - none at all when `harmonics` is zero.
const interpolatedBands = ({baseBands, segmentBands, harmonics}) => {
    const per = suffix => baseBands.map(band => `${band}${suffix}`)
    const count = harmonicsOf(harmonics)
    return [
        ...segmentBands,
        ...baseBands,
        ...per('_rmse'),
        ...per('_magnitude'),
        ...per('_breakConfidence'),
        ...per('_intercept'),
        ...per('_slope'),
        ...sequence(count).flatMap(harmonic => per(`_phase_${harmonic}`)),
        ...sequence(count).flatMap(harmonic => per(`_amplitude_${harmonic}`))
    ]
}

// Slicing one segment adds its bands in a different order, and pairs each harmonic's phase with its
// amplitude.
const segmentSliceBands = ({baseBands, segmentBands}) => {
    const per = suffix => baseBands.map(band => `${band}${suffix}`)
    return [
        ...baseBands,
        ...per('_intercept'),
        ...per('_slope'),
        ...sequence(SEGMENT_SLICE_HARMONICS).flatMap(harmonic => [
            ...per(`_phase_${harmonic}`),
            ...per(`_amplitude_${harmonic}`)
        ]),
        ...per('_rmse'),
        ...per('_magnitude'),
        ...per('_breakConfidence'),
        ...segmentBands
    ]
}

// The operation the model selects, which decides both the bands and their order.
export const sliceOperation = model => {
    const dateType = model?.date?.dateType
    const gapStrategy = model?.options?.gapStrategy
    return dateType === 'RANGE'
        ? 'RANGE'
        : gapStrategy === 'INTERPOLATE'
            ? 'INTERPOLATE'
            : 'SEGMENT'
}

export const sliceOutputBands = (physicalBandNames, model) => {
    const names = physicalBandNames || []
    const baseBands = names
        .filter(name => name.endsWith('_coefs'))
        .map(name => name.substring(0, name.length - '_coefs'.length))
    const segmentBands = SEGMENT_BANDS.filter(name => names.includes(name))
    return sliceOperation(model) === 'SEGMENT'
        ? segmentSliceBands({baseBands, segmentBands})
        : interpolatedBands({baseBands, segmentBands, harmonics: model?.options?.harmonics})
}

export default defineRecipeType({
    type: 'CCDC_SLICE',
    directSources: model =>
        fromSelection({model, keys: ['source'], role: PRIMARY_IMAGE}),
    imageOutput: oneInputTransformation({
        role: PRIMARY_IMAGE,
        // Every derived band is scalar: a slice is one value per pixel, whatever arrays it came from, so
        // the source's export policy does not carry over.
        transform: ({recipe, input: {description}}) => ({
            bands: sliceOutputBands(description.output.bands.map(({name}) => name), recipe.model)
                .map(name => ({name, dataType: {arrayDimensions: 0}})),
            evidence: description.evidence
        })
    })
})
