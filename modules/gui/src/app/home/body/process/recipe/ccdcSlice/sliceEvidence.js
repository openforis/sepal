import {PRIMARY_IMAGE, SEGMENT_BANDS, sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'
import {selectFrom} from '~/stateUtils'

import {inOrderOf} from '../retrieveOutput'
import {dateFormatOf as describedDateFormat, segmentDescription} from '../segmentEvidence'
import {OBSERVED, selectedSourceOf, sourceKeyOf} from '../sourceEvidence'
import {visualizationsWithAvailableBands} from '../visualizationMatching'
import {OUTPUT_LAYER_ID} from '../visualizations'

// What a CCDC Slice recipe derives from the segments it slices, read from the source it selects
// (segmentEvidence.js) together with its date mode and options - which decide both which bands the operation
// produces and which of the source's templates describe them. `resolved` is a description the caller already holds.

// The date representation Slice interprets segment times in (segmentEvidence.js). Nothing configured or described at
// all means the legacy default, Julian days, which the image implementation has always assumed.
export const dateFormatOf = (recipe, resolved) => {
    const dateFormat = describedDateFormat(recipe, PRIMARY_IMAGE, resolved)
    return isSet(dateFormat) ? dateFormat : 0
}

// The bands the selected operation produces - the same derivation the image implementation performs, so
// what is offered is what is exported. Interpolating with no harmonics produces no harmonic bands.
export const outputBandsOf = (recipe, resolved) => {
    const {description} = segmentDescription(recipe, PRIMARY_IMAGE, resolved)
    return description ? sliceOutputBands(description.bands || [], recipe.model) : []
}

// The source's templates materialized against what this operation actually produces: one naming a band this
// slice does not make - a harmonic it was not asked for, a measure the source never fitted - is not offered.
// Nothing is deleted from the source; a template not applicable to this slice may be to another.
export const materializedTemplates = (recipe, resolved) => {
    const {description} = segmentDescription(recipe, PRIMARY_IMAGE, resolved)
    return visualizationsWithAvailableBands(description?.visualizations || [], outputBandsOf(recipe, resolved))
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

// What a retrieve selection may be made from, read from the names this recipe's output holds by the rule the slice
// names its bands with: `b` with a measure's suffix is that measure of base band `b`, a segment band is one of the
// segment bands, and a base band carries its value under its own name. A name can be both - `red_phase_1` is a phase
// of `red`, and is also a base band where the source fitted a measure of that name - so a name is a base band unless
// it is a measure of another band and has no measures of its own. Every name the output holds can be chosen; a
// combination it does not hold is for the request to name.
export const retrievableBands = outputBandNames => {
    const names = outputBandNames.filter(name => !SEGMENT_BANDS.includes(name))
    const present = new Set(names)
    const measuresOf = name => Object.keys(MEASURE_SUFFIXES).filter(measure => present.has(measureBand(name, measure)))
    const isMeasureOfAnother = name => Object.entries(MEASURE_SUFFIXES).some(([measure, suffix]) =>
        measure !== 'value' && name.endsWith(suffix) && present.has(name.slice(0, -suffix.length))
    )
    const hasMeasures = name => measuresOf(name).some(measure => measure !== 'value')
    const baseBands = names.filter(name => !isMeasureOfAnother(name) || hasMeasures(name))
    return {
        baseBands: baseBands.map(name => ({name})),
        measures: Object.keys(MEASURE_SUFFIXES).filter(measure =>
            baseBands.some(name => measuresOf(name).includes(measure))
        ),
        segmentBands: SEGMENT_BANDS.filter(name => outputBandNames.includes(name)).map(name => ({name}))
    }
}

// The bands a retrieve selection asks for, as a Retrieve request: every measure asked for on every base band asked
// for, and the segment bands, in the output's order. Every combination is kept - one the output does not hold is for
// the caller to name and refuse, never to drop - and a measure this vocabulary does not know is no band at all,
// returned as unrecognized rather than read as another.
export const sliceRequest = ({output, retrieveOptions}) => {
    const {baseBands = [], bandTypes = [], segmentBands = []} = retrieveOptions
    const unrecognized = bandTypes.filter(measure => !Object.hasOwn(MEASURE_SUFFIXES, measure))
    const recognized = bandTypes.filter(measure => Object.hasOwn(MEASURE_SUFFIXES, measure))
    const names = inOrderOf(output.bands.map(({name}) => name), [
        ...baseBands.flatMap(name => recognized.map(measure => measureBand(name, measure))),
        ...segmentBands
    ])
    return {names, unrecognized, retrieveOptions: {...retrieveOptions, bands: names}}
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
    return observed.sourceKey === sourceKeyOf(selectedSourceOf(recipe, PRIMARY_IMAGE))
        ? observed.segments?.visualizations || []
        : []
}

// Opening a Slice binds its restored styles to the original source, before any read can succeed or fail.
// Unopened dependency records have no marker; their model and layers still come from the same saved record.
const savedLayerTemplates = recipe => {
    const savedLayerSource = selectFrom(recipe, 'ui.savedLayerSource')
    if (savedLayerSource !== undefined && savedLayerSource !== sourceKeyOf(selectedSourceOf(recipe, PRIMARY_IMAGE))) {
        return []
    }
    return Object.values(selectFrom(recipe, 'layers.areas') || {})
        .map(({imageLayer}) => imageLayer)
        .filter(imageLayer => imageLayer?.sourceId === OUTPUT_LAYER_ID)
        .map(({layerConfig}) => layerConfig?.visParams)
        .filter(visParams => visParams?.id && visParams?.bands)
}

const measureBand = (name, measure) => `${name}${MEASURE_SUFFIXES[measure]}`

const isSet = value => value !== undefined && value !== null
