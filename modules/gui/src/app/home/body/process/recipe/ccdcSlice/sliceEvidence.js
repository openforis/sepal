import {sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'
import {selectFrom} from '~/stateUtils'

import {OBSERVED, sourceKeyOf, UNAVAILABLE, UNOBSERVED} from '../sourceEvidence'
import {renderableVisualizations} from '../visualizationMatching'
import {OUTPUT_LAYER_ID} from '../visualizations'

// What a CCDC Slice recipe knows about the segments it slices, and what it derives from that.
//
// The segment description is the source's, held in runtime state by the shared evidence lifecycle. Slice
// derives its own output from that description together with its date mode and options - which decide both
// which bands the operation produces and which of the source's templates describe them.
//
// A recipe saved by an older GUI carries a copy of the description beside its source reference. That copy is
// the fallback while nothing has been observed, and never the answer once something has: evidence that could
// not be had leaves the recipe with nothing rather than with a description of the source as it once was.

export const selectedSource = recipe => {
    const {type, id} = selectFrom(recipe, 'model.source') || {}
    return type && id ? {type, id} : null
}

export const segmentDescription = (recipe, resolved) => {
    if (resolved) {
        return {status: OBSERVED, description: resolved}
    }
    const evidence = recipe?.ui?.sourceEvidence
    const key = sourceKeyOf(selectedSource(recipe))
    if (key && evidence?.sourceKey === key) {
        return evidence.status === OBSERVED
            ? {status: OBSERVED, description: evidence.segments}
            : {status: UNAVAILABLE, description: null}
    }
    const copied = selectFrom(recipe, 'model.source') || {}
    return copied.bands || copied.baseBands
        ? {status: UNOBSERVED, description: copiedDescription(copied)}
        : {status: UNOBSERVED, description: null}
}

// The date representation Slice interprets segment times in. For an asset source it is what the user
// configured, which wins over anything read from metadata - the metadata prefilled it, and the user may have
// corrected it. For a recipe source it is the source's. A recipe saved by an older GUI may carry only the
// copy; nothing configured or described at all means the legacy default, Julian days, which the image
// implementation has always assumed.
export const dateFormatOf = (recipe, resolved) => {
    const {type, dateFormat: configured} = selectFrom(recipe, 'model.source') || {}
    if (type === 'ASSET' && isSet(configured)) {
        return configured
    }
    const described = segmentDescription(recipe, resolved).description?.dateFormat
    return isSet(described) ? described : (isSet(configured) ? configured : 0)
}

export const baseBandsOf = (recipe, resolved) =>
    segmentDescription(recipe, resolved).description?.baseBands || []

export const segmentDatesOf = (recipe, resolved) => {
    const {description} = segmentDescription(recipe, resolved)
    return {startDate: description?.startDate, endDate: description?.endDate}
}

// The bands the selected operation produces - the same derivation the image implementation performs, so
// what is offered is what is exported. Interpolating with no harmonics produces no harmonic bands.
export const outputBandsOf = (recipe, resolved) => {
    const {description} = segmentDescription(recipe, resolved)
    return description ? sliceOutputBands(description.bands || [], recipe.model) : []
}

export const availableBandsOf = (recipe, resolved) =>
    Object.fromEntries(outputBandsOf(recipe, resolved).map(name => [name, {}]))

// The source's templates materialized against what this operation actually produces: one naming a band this
// slice does not make - a harmonic it was not asked for, a measure the source never fitted - is not offered.
// Nothing is deleted from the source; a template not applicable to this slice may be to another.
export const materializedTemplates = (recipe, resolved) => {
    const {description} = segmentDescription(recipe, resolved)
    return renderableVisualizations(description?.visualizations || [], availableBandsOf(recipe, resolved))
}

const MEASURE_SUFFIXES = {
    value: '',
    rmse: '_rmse',
    magnitude: '_magnitude',
    breakConfidence: '_breakConfidence',
    intercept: '_intercept',
    slope: '_slope',
    phase_1: '_phase_1',
    phase_2: '_phase_2',
    phase_3: '_phase_3',
    amplitude_1: '_amplitude_1',
    amplitude_2: '_amplitude_2',
    amplitude_3: '_amplitude_3'
}

// What a retrieve selection may be made from: the source's base bands, the measures they carry and their
// segment bands, each kept to what the selected operation produces. Which bands a slice produces depends on
// the operation, so a source that fitted three harmonics is still offered none by a slice producing none.
export const retrievableBands = recipe => {
    const produced = outputBandsOf(recipe)
    const baseBands = baseBandsOf(recipe)
    const carried = carriedMeasures(baseBands)
    const measures = Object.keys(MEASURE_SUFFIXES).filter(measure =>
        carried.has(measure) && baseBands.some(({name}) => produced.includes(measureBand(name, measure)))
    )
    return {
        baseBands: baseBands.filter(({name}) =>
            measures.some(measure => produced.includes(measureBand(name, measure)))
        ),
        measures,
        segmentBands: segmentBandsOf(recipe).filter(({name}) => produced.includes(name))
    }
}

// What a retrieve selection actually resolves to: every measure asked for on every base band asked for, kept
// only where this operation produces it. An empty result is a selection this recipe cannot export.
export const selectedOutputBands = (recipe, {baseBands = [], bandTypes = [], segmentBands = []} = {}) => {
    const produced = outputBandsOf(recipe)
    return [
        ...baseBands.flatMap(name => bandTypes.map(measure => measureBand(name, measure))),
        ...segmentBands
    ].filter(band => produced.includes(band))
}

// The source reference as the pixel-chart endpoint expects it: what the recipe selected, plus the date
// representation an asset source was configured with. Nothing derived travels with it - the endpoint
// resolves what it needs from the source, as the image implementation does.
export const chartSourceReference = recipe => {
    const {type, id, dateFormat} = selectFrom(recipe, 'model.source') || {}
    return type === 'ASSET' && isSet(dateFormat)
        ? {type, id, dateFormat}
        : {type, id}
}

// Failures retain identity provenance without making the previous description available again.
export const knownTemplates = recipe => {
    const evidence = recipe?.ui?.sourceEvidence
    const observed = evidence?.status === OBSERVED ? evidence : evidence?.lastObserved
    if (!observed) {
        return savedLayerTemplates(recipe)
    }
    return observed.sourceKey === sourceKeyOf(selectedSource(recipe))
        ? observed.segments?.visualizations || []
        : []
}

// Opening a Slice binds its restored styles to the original source, before any read can succeed or fail.
// Unopened dependency records have no marker; their model and layers still come from the same saved record.
const savedLayerTemplates = recipe => {
    const savedLayerSource = selectFrom(recipe, 'ui.savedLayerSource')
    if (savedLayerSource !== undefined && savedLayerSource !== sourceKeyOf(selectedSource(recipe))) {
        return []
    }
    return Object.values(selectFrom(recipe, 'layers.areas') || {})
        .map(({imageLayer}) => imageLayer)
        .filter(imageLayer => imageLayer?.sourceId === OUTPUT_LAYER_ID)
        .map(({layerConfig}) => layerConfig?.visParams)
        .filter(visParams => visParams?.id && visParams?.bands)
}

const segmentBandsOf = recipe =>
    segmentDescription(recipe).description?.segmentBands || []

const measureBand = (name, measure) => `${name}${MEASURE_SUFFIXES[measure] ?? ''}`

// Break confidence is not fitted; it is a magnitude over a residual, so a source carrying both carries it.
const carriedMeasures = baseBands => {
    const carried = new Set(baseBands.flatMap(({measures}) => measures || []))
    if (carried.has('rmse') && carried.has('magnitude')) {
        carried.add('breakConfidence')
    }
    return carried
}

const isSet = value => value !== undefined && value !== null

// A copy an older GUI saved spelled the measures of a base band `bandTypes`. Normalized here, at the one
// boundary a legacy shape enters, so every consumer reads one shape.
const copiedDescription = ({bands, baseBands, segmentBands, dateFormat, startDate, endDate, visualizations}) => ({
    bands: bands || [],
    baseBands: (baseBands || []).map(({name, measures, bandTypes}) => ({
        name,
        measures: measures || bandTypes || []
    })),
    segmentBands: segmentBands || [],
    dateFormat,
    startDate,
    endDate,
    visualizations: visualizations || []
})
