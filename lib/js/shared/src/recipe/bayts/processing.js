import {
    enumerated,
    finite,
    isObject,
    NOT_RECORDED,
    own,
    parseObject,
    PENDING,
    pick,
    RECORDED,
    REFERENCE,
    UNREADABLE,
    UNUSABLE_STATES
} from '../referenceProcessing.js'
import {baytsHistoricalRefusals} from '../type/baytsHistorical.js'

export {NOT_RECORDED, PENDING, RECORDED, REFERENCE, UNREADABLE}
export {UNAVAILABLE} from '../referenceProcessing.js'

export const UNREADABLE_PROCESSING = 'UNREADABLE_REFERENCE_PROCESSING'

// BAYTS Alerts scores each monitored observation against the history's per-pass mean and deviation
// (lib/js/ee/src/bayts/bayts.js), so what transforms the backscatter both are built from is the history's: its
// geometric correction and spatial speckle filtering. One a history's options leave out is what its radar collection
// executes by default (lib/js/ee/src/radar/collection.js), never what the alerts would.
const REFERENCE_DEFAULTS = {
    geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'NONE',
    kernelSize: 5,
    sigma: 0.9,
    strongScatterers: 'RETAIN',
    strongScattererValues: [0, -5],
    snicSize: 3,
    snicCompactness: 0.15
}

// What monitoring itself executes where the alerts' options leave one out (bayts.js): an asset that records none of
// these monitors with the alerts' own, as before.
const MONITORING_DEFAULTS = {
    geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'LEE',
    kernelSize: 9,
    sigma: 0.9,
    strongScatterers: 'RETAIN',
    strongScattererValues: [0, -5],
    snicSize: 5,
    snicCompactness: 0.15
}

export const REFERENCE_FIELDS = Object.keys(REFERENCE_DEFAULTS)

// Which observations are monitored: the alerts' own, seeded from the reference once, as a recipe is created.
export const MONITORING_FIELDS = ['orbits', 'mask', 'minAngle', 'maxAngle']

// What monitoring forces whatever is saved (bayts.js): the history's speckle statistics stand for multitemporal
// filtering, its orbit band for relative orbits. The saved options keep them, unread.
export const FORCED_OPTIONS = {outlierRemoval: 'NONE', multitemporalSpeckleFilter: 'NONE', orbitNumbers: 'ALL', minObservations: 1}

export const UNUSED_FIELDS = [...Object.keys(FORCED_OPTIONS), 'numberOfImages']

const VALID = {
    geometricCorrection: enumerated(['NONE', 'ELLIPSOID', 'TERRAIN']),
    spatialSpeckleFilter: enumerated(['NONE', 'BOXCAR', 'GAMMA_MAP', 'LEE', 'REFINED_LEE', 'LEE_SIGMA', 'SNIC']),
    strongScatterers: enumerated(['RETAIN', 'FILTER']),
    strongScattererValues: value => Array.isArray(value) && value.length === 2 && value.every(finite)
}

const valid = (field, value) => (VALID[field] || finite)(value)

const factOf = (options, field, state) => {
    const value = own(options, field) ? options[field] : REFERENCE_DEFAULTS[field]
    return valid(field, value) ? {state, value} : {state: UNREADABLE}
}

// A history's own options, complete: what it leaves out, it executes by default.
export const processingOfProducer = model => {
    const options = isObject(model?.options) ? model.options : {}
    return {
        state: REFERENCE,
        fields: Object.fromEntries(REFERENCE_FIELDS.map(field => [field, factOf(options, field, REFERENCE)])),
        defaults: pick(options, MONITORING_FIELDS)
    }
}

// What an asset's properties record: the options exported with it (`recipe_options`). Exported from a BAYTS Historical
// they are complete, as its own are; otherwise they record only what they state. Options that cannot be read govern
// every field and make it unreadable - neither another form nor the alerts' own settings stand in.
export const assetProcessing = (properties = {}) => {
    const recorded = own(properties, 'recipe_options')
    const options = recorded ? parseObject(properties.recipe_options) : null
    const complete = properties.recipe_type === 'BAYTS_HISTORICAL'
    const fieldOf = field => !recorded ? {state: NOT_RECORDED}
        : !options ? {state: UNREADABLE}
            : complete || own(options, field) ? factOf(options, field, RECORDED) : {state: NOT_RECORDED}
    return {
        state: RECORDED,
        fields: Object.fromEntries(REFERENCE_FIELDS.map(field => [field, fieldOf(field)])),
        defaults: options ? pick(options, MONITORING_FIELDS) : {}
    }
}

// Each reference-owned field's state and value, and the model monitoring runs: the reference's processing, the alerts'
// own where the reference records none - monitoring's default where they hold none that monitoring takes - and what
// monitoring forces. None while any field is pending, unavailable or unreadable.
export const effectiveSettings = (model, processing = {state: PENDING}) => {
    const options = isObject(model?.options) ? model.options : {}
    const fields = Object.fromEntries(REFERENCE_FIELDS.map(field => {
        const fact = processing.fields?.[field] || {state: processing.state}
        return [field, fact.state === NOT_RECORDED
            ? {...fact, value: own(options, field) && valid(field, options[field]) ? options[field] : MONITORING_DEFAULTS[field]}
            : fact]
    }))
    const usable = !Object.values(fields).some(({state}) => UNUSABLE_STATES.includes(state))
    return {
        fields,
        model: usable
            ? {
                ...model,
                options: {
                    ...options,
                    ...Object.fromEntries(REFERENCE_FIELDS.map(field => [field, fields[field].value])),
                    ...FORCED_OPTIONS
                }
            }
            : null
    }
}

// The monitoring choices a new recipe starts from: the reference's, where it states them and they are usable. None from
// a reference whose processing cannot be read.
export const seedMonitoring = processing => {
    const readable = [REFERENCE, RECORDED].includes(processing?.state)
        && !Object.values(processing.fields || {}).some(({state}) => state === UNREADABLE)
    if (!readable) {
        return {}
    }
    const seeded = Object.fromEntries(Object.entries(processing.defaults || {})
        .filter(([field, value]) => SEEDABLE[field](value)))
    return Object.keys(seeded).length ? {options: seeded} : {}
}

const SEEDABLE = {
    orbits: orbits => Array.isArray(orbits) && orbits.length > 0 && !baytsHistoricalRefusals({options: {orbits}}).length,
    mask: mask => Array.isArray(mask) && mask.every(value => typeof value === 'string'),
    minAngle: finite,
    maxAngle: finite
}
