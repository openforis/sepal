import {collectionType} from '../collectionType.js'

// Processing that defines the reference's measurements, separate from the observations the consumer chooses.
// Pure facts: acquisition/currency and operation holds remain the caller's existing responsibility.
export const REFERENCE = 'REFERENCE'
export const RECORDED = 'RECORDED'
export const NOT_RECORDED = 'NOT_RECORDED'
export const UNREADABLE = 'UNREADABLE'
export const PENDING = 'PENDING'
export const UNAVAILABLE = 'UNAVAILABLE'
export const UNREADABLE_PROCESSING = 'UNREADABLE_REFERENCE_PROCESSING'

const DEFAULTS = {
    SR: false, BRDF: false, brdfMultiplier: 4, histogramMatching: 'DISABLED',
    geometricCorrection: 'ELLIPSOID', spatialSpeckleFilter: 'NONE', kernelSize: 5, sigma: 0.9,
    strongScattererValues: [0, -5], snicSize: 3, snicCompactness: 0.15,
    multitemporalSpeckleFilter: 'NONE', numberOfImages: 10, minNumberOfImages: 0
}
export const PROCESSING_FIELDS = [...Object.keys(DEFAULTS), 'dateFormat']
export const MONITORING_SOURCES = ['dataSetType', 'dataSets', 'cloudPercentageThreshold', 'assets', 'band']
export const MONITORING_OPTIONS = [
    'includedCloudMasking', 'sentinel2CloudProbabilityMaxCloudProbability', 'sentinel2CloudScorePlusBand',
    'sentinel2CloudScorePlusMaxCloudProbability', 'landsatCFMaskCloudMasking', 'landsatCFMaskCloudShadowMasking',
    'landsatCFMaskCirrusMasking', 'landsatCFMaskDilatedCloud', 'sepalCloudScoreMaxCloudProbability',
    'holes', 'cloudBuffer', 'shadowMasking', 'snowMasking', 'orbitOverlap', 'tileOverlap',
    'orbits', 'orbitNumbers', 'outlierRemoval', 'mask', 'minAngle', 'maxAngle', 'minObservations',
    'cloudThreshold', 'shadowThreshold'
]
const OPTIONS = [...Object.keys(DEFAULTS).filter(key => !['SR', 'BRDF'].includes(key)), 'corrections', ...MONITORING_OPTIONS]
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const pick = (value, keys) => Object.fromEntries(keys.filter(key => own(value, key)).map(key => [key, value[key]]))
const parse = value => {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value
        return object(parsed) ? parsed : null
    } catch {
        return null
    }
}
const fromOptions = (options, field) => ['SR', 'BRDF'].includes(field)
    ? Array.isArray(options.corrections) && options.corrections.includes(field)
    : options[field] === undefined ? DEFAULTS[field] : options[field]
const hasField = (options, field) => own(options, ['SR', 'BRDF'].includes(field) ? 'corrections' : field)
const enumerated = values => value => values.includes(value)
const finite = value => typeof value === 'number' && Number.isFinite(value)
const valid = {
    SR: value => typeof value === 'boolean', BRDF: value => typeof value === 'boolean',
    histogramMatching: enumerated(['DISABLED', 'ENABLED']),
    geometricCorrection: enumerated(['NONE', 'ELLIPSOID', 'TERRAIN']),
    spatialSpeckleFilter: enumerated(['NONE', 'BOXCAR', 'GAMMA_MAP', 'LEE', 'REFINED_LEE', 'LEE_SIGMA', 'SNIC']),
    multitemporalSpeckleFilter: enumerated(['NONE', 'QUEGAN', 'RABASAR']),
    strongScattererValues: value => Array.isArray(value) && value.length === 2 && value.every(finite),
    dateFormat: enumerated([0, 1, 2])
}
const fieldOf = (options, field, state) => {
    const correctionsValid = !['SR', 'BRDF'].includes(field) || !own(options, 'corrections')
        || (Array.isArray(options.corrections) && options.corrections.every(value => typeof value === 'string'))
    const value = correctionsValid ? fromOptions(options, field) : undefined
    return correctionsValid && (valid[field] || finite)(value) ? {state, value} : {state: UNREADABLE}
}

// The writer's complete, bounded record is constructed from executed configuration, never request provenance.
export const processingOfProducer = model => {
    const record = {...pick(model?.sources, MONITORING_SOURCES), options: pick(model?.options, OPTIONS)}
    if (record.dataSets && Object.keys(record.dataSets).length) {
        record.dataSetType = collectionType(record.dataSets)
    }
    return {
        state: REFERENCE,
        fields: Object.fromEntries(Object.keys(DEFAULTS).map(field => [field, fieldOf(record.options, field, REFERENCE)])),
        defaults: {sources: pick(record, MONITORING_SOURCES), options: pick(record.options, MONITORING_OPTIONS)},
        record
    }
}

// Per-field precedence: complete records govern omitted fields, partial imports govern only stated fields.
// A malformed governing form blocks its fields; a valid higher form shields them from malformed lower forms.
export const assetProcessing = (properties = {}) => {
    const parsedCanonical = own(properties, 'processing') ? parse(properties.processing) : undefined
    const canonical = parsedCanonical && !validSources(parsedCanonical) ? null : parsedCanonical
    const nested = own(properties, 'formattedProperties') ? parse(properties.formattedProperties) : undefined
    const complete = properties.recipe_type === 'CCDC'
    const legacy = (container, complete) => {
        if (!container || !own(container, 'recipe_options')) {
            return null
        }
        return {options: parse(container.recipe_options), complete}
    }
    const forms = [
        ...(canonical !== undefined ? [{options: canonical && parse(canonical.options), complete: true}] : []),
        legacy(properties, complete),
        ...(nested === null ? [{options: null, complete: true}] : [legacy(nested, nested?.recipe_type === 'CCDC' || complete)])
    ].filter(Boolean)
    const fields = Object.fromEntries(Object.keys(DEFAULTS).map(field => {
        const governing = forms.find(form => !form.options || form.complete || hasField(form.options, field))
        if (governing) {
            return [field, governing.options ? fieldOf(governing.options, field, RECORDED) : {state: UNREADABLE}]
        }
        if (field === 'SR' && own(properties, 'surfaceReflectance')) {
            return [field, [1, true, 0, false].includes(properties.surfaceReflectance)
                ? {state: RECORDED, value: Boolean(properties.surfaceReflectance)} : {state: UNREADABLE}]
        }
        return [field, {state: NOT_RECORDED}]
    }))
    fields.dateFormat = own(properties, 'dateFormat')
        ? valid.dateFormat(properties.dateFormat) ? {state: RECORDED, value: properties.dateFormat} : {state: UNREADABLE}
        : {state: NOT_RECORDED}
    const sourceForm = canonical !== undefined ? canonical
        : own(properties, 'recipe_sources') ? parse(properties.recipe_sources)
            : nested && own(nested, 'recipe_sources') ? parse(nested.recipe_sources) : undefined
    const optionsForm = forms[0]?.options
    const unreadableDefaults = sourceForm === null || (sourceForm && !validSources(sourceForm))
    return {
        state: RECORDED, fields,
        ...(unreadableDefaults && {defaultsState: UNREADABLE}),
        defaults: {
            ...(sourceForm && {sources: pick(sourceForm, MONITORING_SOURCES)}),
            ...(optionsForm && {options: pick(optionsForm, MONITORING_OPTIONS)})
        }
    }
}

// No effective fallback while evidence is pending/unavailable or authoritative metadata is unreadable.
export const effectiveSettings = (model, processing = {state: PENDING}) => {
    const options = model?.options || {}
    const fields = Object.fromEntries(PROCESSING_FIELDS.map(field => {
        const fact = processing.fields?.[field] || {state: processing.state === REFERENCE && field === 'dateFormat' ? NOT_RECORDED : processing.state}
        const fallback = field === 'dateFormat' ? model?.reference?.dateFormat : fromOptions(options, field)
        return [field, fact.state === NOT_RECORDED ? {...fact, value: fallback} : fact]
    }))
    const blocked = processing.defaultsState === UNREADABLE || Object.values(fields).some(({state}) => [UNREADABLE, PENDING, UNAVAILABLE].includes(state))
    const effectiveOptions = {
        ...options,
        ...Object.fromEntries(Object.keys(DEFAULTS).filter(key => !['SR', 'BRDF'].includes(key)).map(key => [key, fields[key].value])),
        corrections: ['SR', 'BRDF'].filter(key => fields[key].value)
    }
    return {
        fields,
        model: blocked ? null : {...model, options: effectiveOptions,
            reference: {...model?.reference, ...(fields.dateFormat.value !== undefined && {dateFormat: fields.dateFormat.value})}}
    }
}

export const seedMonitoring = processing => {
    if (!processing || ![REFERENCE, RECORDED].includes(processing.state) || processing.defaultsState === UNREADABLE || Object.values(processing.fields || {}).some(({state}) => state === UNREADABLE)) {
        return {}
    }
    const defaults = Object.fromEntries(Object.entries(processing.defaults || {}).filter(([, value]) => Object.keys(value).length))
    return defaults.sources?.dataSets ? {...defaults, sources: {...defaults.sources, dataSetType: collectionType(defaults.sources.dataSets)}} : defaults
}

const validSources = sources => (!own(sources, 'dataSets') || (object(sources.dataSets)
    && Object.values(sources.dataSets).every(values => Array.isArray(values) && values.every(value => typeof value === 'string'))))
    && (!own(sources, 'dataSetType') || ['OPTICAL', 'RADAR', 'PLANET'].includes(sources.dataSetType))
    && (!own(sources, 'assets') || (Array.isArray(sources.assets) && sources.assets.every(value => typeof value === 'string')))
    && (!own(sources, 'cloudPercentageThreshold') || finite(sources.cloudPercentageThreshold))
