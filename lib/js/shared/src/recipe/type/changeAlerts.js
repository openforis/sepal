import {periodDates} from '../changeAlerts/monitoringDates.js'
import {MOSAIC_DATA_SET_TYPES, mosaicRecipe} from '../changeAlerts/mosaicRecipe.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {calendarDate, durationUnit, isMissing, wholeNumber} from '../output/dateFields.js'
import {INCOMPLETE_IMAGE_OUTPUT, MALFORMED_IMAGE_OUTPUT} from '../output/diagnostic.js'
import {mapProduct} from '../output/product.js'
import {imageOutputProvider} from '../output/provider.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'
import {fromSelection} from '../source/extract.js'
import {PLANET_SOURCES} from './planetMosaic.js'

// Change alerts monitors a CCDC reference against a freshly built collection
// (lib/js/ee/src/timeSeries/changeAlerts.js). Two independent halves:
//
//   model.reference  the selected CCDC source, recipe OR asset. imageFactory resolves it either way, and its
//                    geometry is what the recipe is clipped to - there is no separate AOI.
//   model.sources    the collection Change Alerts monitors against, seeded from the producer of the
//                    referenced segments and editable afterwards. So this recipe owns the same
//                    classification and asset dependencies CCDC does.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'
export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

// The changes: the bands the algorithm selects last, in that order (lib/js/ee/src/timeSeries/changeAlertsAlgorithm.js),
// whatever the source type, the confidence settings or the observations found - those decide masks and values, never
// which bands exist. Earth Engine's catalogue and the GUI's presentation take their names from here too. The schema follows from the
// type alone, so it is known before a period or a reference is chosen; whether such a recipe can execute is a separate
// question, which execution answers by refusing it. Dates are fractional years, and the dates and counts are no
// average of neighbours, so every band is sampled at coarser pyramid levels, as Retrieve has always exported them. No
// encoding is declared. The monitoring and calibration mosaics a layer can show instead are a separate product, not
// this output.
export const CHANGE_ALERT_BANDS = [
    'last_stable_date',
    'first_detection_date',
    'confirmation_date',
    'last_detection_date',
    'confidence',
    'difference',
    'detection_count',
    'monitoring_observation_count',
    'calibration_observation_count'
].map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'sample'}))

// The mosaic a layer can show instead: the collection a period is compared on, built from Change Alerts' own sources
// and options over its monitoring or calibration period, as the latest observations or their median. Optical, radar
// or Planet, as its sources state, and described by that mosaic type's own declaration. The reference only places it:
// execution clips it to the reference's geometry, which describing it never resolves.
export const COLLECTION_MOSAIC = 'COLLECTION_MOSAIC'

const PERIODS = ['monitoring', 'calibration']
const MOSAIC_TYPES = ['latest', 'median']

// A layer names both, so neither is assumed.
export const collectionMosaicParameters = ({period, mosaicType, ...unknown} = {}) => {
    const diagnostics = [
        ...(PERIODS.includes(period) ? [] : [{path: ['period']}]),
        ...(MOSAIC_TYPES.includes(mosaicType) ? [] : [{path: ['mosaicType']}]),
        ...Object.keys(unknown).map(name => ({path: [name]}))
    ]
    return diagnostics.length
        ? {diagnostics}
        : {parameters: {period, mosaicType}}
}

export default defineRecipeType({
    type: 'CHANGE_ALERTS',
    directSources: model => [
        ...fromSelection({model, keys: ['reference'], role: PRIMARY_IMAGE}),
        ...fromCollectionSources(model)
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: CHANGE_ALERT_BANDS, evidence: []})
    }),
    mapProducts: {
        [COLLECTION_MOSAIC]: mapProduct({
            parameters: ({parameters}) => collectionMosaicParameters(parameters),
            delegatesTo: ['MOSAIC', 'RADAR_MOSAIC', 'PLANET_MOSAIC'],
            describe: ({recipe, parameters: {period, mosaicType}, delegate}) => {
                const diagnostics = [...periodRefusals(recipe.model?.date), ...sourceRefusals(recipe.model?.sources)]
                return diagnostics.length
                    ? {diagnostics}
                    : delegate(mosaicRecipe({model: recipe.model, period, mosaicType}))
            }
        })
    }
})

// Every mosaic is built from the complete period, whichever part of it the mosaic covers: its end, both durations and
// their units, as the form writes them, reaching dates YYYY-MM-DD can state. Execution counts what the form does not
// offer; this describes only what it does.
const PERIOD_FIELDS = [
    ['monitoringEnd', calendarDate],
    ['monitoringDuration', wholeNumber],
    ['monitoringDurationUnit', durationUnit],
    ['calibrationDuration', wholeNumber],
    ['calibrationDurationUnit', durationUnit]
]

const periodRefusals = date => {
    const refusals = PERIOD_FIELDS.flatMap(([field, read]) => {
        const {code} = read(date?.[field])
        return code ? [refused(code, ['date', field])] : []
    })
    if (refusals.length) {
        return refusals
    }
    const {error} = periodDates({date})
    return error ? [refused(MALFORMED_IMAGE_OUTPUT, ['date', error.field])] : []
}

// The data-set type decides which mosaic is built. A Planet mosaic is built from the first Planet data set, which has
// to be a collection it selects from.
const sourceRefusals = sources => {
    const dataSetType = sources?.dataSetType
    if (isMissing(dataSetType)) {
        return [refused(INCOMPLETE_IMAGE_OUTPUT, ['sources', 'dataSetType'])]
    }
    if (!MOSAIC_DATA_SET_TYPES.includes(dataSetType)) {
        return [refused(MALFORMED_IMAGE_OUTPUT, ['sources', 'dataSetType'])]
    }
    if (dataSetType !== 'PLANET') {
        return []
    }
    const planet = sources.dataSets?.PLANET
    if (isMissing(planet) || (Array.isArray(planet) && planet.length === 0)) {
        return [refused(INCOMPLETE_IMAGE_OUTPUT, ['sources', 'dataSets', 'PLANET'])]
    }
    return Array.isArray(planet) && PLANET_SOURCES.includes(planet[0])
        ? []
        : [refused(MALFORMED_IMAGE_OUTPUT, ['sources', 'dataSets', 'PLANET'])]
}

const refused = (code, path) => ({code, path: ['model', ...path]})
