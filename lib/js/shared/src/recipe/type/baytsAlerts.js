import {ALERT_BANDS} from '../bayts/alertBands.js'
import {daysBefore, isoDate, monthsBefore, utcDate} from '../calendar.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {INCOMPLETE_IMAGE_OUTPUT, MALFORMED_IMAGE_OUTPUT} from '../output/diagnostic.js'
import {mapProduct} from '../output/product.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromId, fromSelection} from '../source/extract.js'
import {assetReference} from '../source/reference.js'

// BAYTS alerts monitors a historical reference and carries its state forward
// (lib/js/ee/src/bayts/baytsAlerts.js):
//
//   model.reference                            the selected BAYTS historical source, recipe OR asset
//   baytsAlertsOptions.previousAlertsAsset      the alerts an earlier run produced, continued rather than
//                                               recomputed
//   baytsAlertsOptions.wetlandMaskAsset         where a low-confidence flag is resolved against wetland
//
// The two option fields are both Earth Engine assets and are persisted in DIFFERENT shapes by one writer
// (recipe/baytsAlerts/panels/options/options.jsx valuesToModel), so they need different extraction:
//
//   previousAlertsAsset is written as a canonical {type, id} selection, or undefined when cleared, and
//   baytsAlerts.js hands it straight to imageFactory. A selection written without an id is a broken
//   dependency and must say so.
//
//   wetlandMaskAsset is written as a bare id and read as ee.Image(wetlandMaskAsset || 0), so a blank one is
//   a constant image rather than a reference. Diagnosing it would invent a dependency with nothing to
//   resolve.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'
export const PREVIOUS_ALERTS = 'PREVIOUS_ALERTS'
export const WETLAND_MASK = 'WETLAND_MASK'

// The alerts: the bands the algorithm selects last, in that order, whether it starts from its own initial alerts or
// continues a previous run's, and whatever the layer's confidence filters mask. All are sampled at coarser pyramid
// levels, as Retrieve has always exported them: flags and orbits are categories, dates are dates no average of
// neighbours would hold, and the probabilities are kept as the pixels detected them. No encoding is declared. The
// first and last radar observations a layer can show instead are a separate product, not this output.
export const BAYTS_ALERT_BANDS = ALERT_BANDS
    .map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'sample'}))

// The radar observation a layer can show instead: a point-in-time Radar Mosaic of the same radar options around the
// start (first) or end (last) of the monitoring period, over the reference's geometry. Each pixel holds the valid
// observation whose whole number of days from that date is smallest, within Radar Mosaic's window either side of it,
// so pixels can come from different dates, before or after the period. Observations are not required to recur there.
export const RADAR_OBSERVATION = 'RADAR_OBSERVATION'

const POSITIONS = ['first', 'last']

// A layer always names its position, so none is assumed.
export const radarObservationParameters = ({position, ...unknown} = {}) => {
    const diagnostics = [
        ...(POSITIONS.includes(position) ? [] : [{path: ['position']}]),
        ...Object.keys(unknown).map(name => ({path: [name]}))
    ]
    return diagnostics.length
        ? {diagnostics}
        : {parameters: {position}}
}

// The date a position is shown at, of the monitoring period execution computes: its end for the last, its start for
// anything else.
export const radarObservationTargetDate = (position, {startDate, endDate}) =>
    position === 'last' ? endDate : startDate

// The mosaic both described and executed, given its target date. Only execution holds the reference's geometry.
export const radarObservationRecipe = ({recipe, targetDate, aoi}) => ({
    type: 'RADAR_MOSAIC',
    model: {
        ...(aoi && {aoi}),
        dates: {targetDate},
        options: {
            ...recipe.model.options,
            minObservations: 1
        }
    }
})

export default defineRecipeType({
    type: 'BAYTS_ALERTS',
    directSources: model => [
        ...fromSelection({model, keys: ['reference'], role: PRIMARY_IMAGE}),
        ...fromSelection({model, keys: ['baytsAlertsOptions', 'previousAlertsAsset'], role: PREVIOUS_ALERTS}),
        ...fromId({
            model,
            keys: ['baytsAlertsOptions', 'wetlandMaskAsset'],
            toReference: assetReference,
            role: WETLAND_MASK
        })
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: BAYTS_ALERT_BANDS, evidence: []})
    }),
    mapProducts: {
        [RADAR_OBSERVATION]: mapProduct({
            parameters: ({parameters}) => radarObservationParameters(parameters),
            delegatesTo: 'RADAR_MOSAIC',
            describe: ({recipe, parameters: {position}, delegate}) => {
                const {targetDate, diagnostics} = placedTarget(recipe.model?.date, position)
                return diagnostics
                    ? {diagnostics}
                    : delegate(radarObservationRecipe({recipe, targetDate}))
            }
        })
    }
})

const DATE_PATH = ['model', 'date']
const DURATION_UNITS = ['days', 'weeks', 'months']

// Where a position's target date falls, from the fields it depends on, or why it cannot be placed. Only whether a
// date can be placed decides the description; execution computes the date itself.
const placedTarget = (date, position) => {
    const end = calendarDate(date?.monitoringEnd)
    if (!end.date) {
        return refused(end.code, 'monitoringEnd')
    }
    if (position === 'last') {
        return {targetDate: date.monitoringEnd}
    }
    const duration = wholeNumber(date.monitoringDuration)
    if (duration.code) {
        return refused(duration.code, 'monitoringDuration')
    }
    const unit = date.monitoringDurationUnit
    if (isMissing(unit)) {
        return refused(INCOMPLETE_IMAGE_OUTPUT, 'monitoringDurationUnit')
    }
    if (!DURATION_UNITS.includes(unit)) {
        return refused(MALFORMED_IMAGE_OUTPUT, 'monitoringDurationUnit')
    }
    const targetDate = isoDate(before(end.date, duration.value, unit))
    return targetDate
        ? {targetDate}
        : refused(MALFORMED_IMAGE_OUTPUT, 'monitoringDuration')
}

const refused = (code, field) => ({diagnostics: [{code, path: [...DATE_PATH, field]}]})

const isMissing = value => value === undefined || value === null || value === ''

// A date as the form writes it, YYYY-MM-DD, naming a day its month has.
const calendarDate = value => {
    if (isMissing(value)) {
        return {code: INCOMPLETE_IMAGE_OUTPUT}
    }
    const [, year, month, day] = (/^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '') || [])
        .map(Number)
    const date = year !== undefined && utcDate(year, month - 1, day)
    return date && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? {date}
        : {code: MALFORMED_IMAGE_OUTPUT}
}

// A whole number, as a number or as the digits the form's number input keeps.
const wholeNumber = value => {
    if (isMissing(value)) {
        return {code: INCOMPLETE_IMAGE_OUTPUT}
    }
    const number = typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value
    return Number.isInteger(number)
        ? {value: number}
        : {code: MALFORMED_IMAGE_OUTPUT}
}

// A month back keeps the day, or the last day of a shorter month.
const before = (date, duration, unit) => {
    const parts = [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()]
    return unit === 'months'
        ? monthsBefore(...parts, duration)
        : daysBefore(...parts, duration * (unit === 'weeks' ? 7 : 1))
}
