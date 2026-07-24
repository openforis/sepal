import {simplifyString} from './string.js'

const normalized = value =>
    simplifyString(String(value ?? ''), {
        removeNonAlphanumeric: false,
        removePunctuation: false
    })

const sanitizeSegment = (value, invalidCharacters) =>
    normalized(value).replace(invalidCharacters, '_')

export const sanitizeEarthEngineTaskName = (value, fallback = 'export') => {
    const sanitized = sanitizeSegment(value, /[^0-9A-Za-z_-]+/g)
    return /[0-9A-Za-z]/.test(sanitized) ? sanitized : fallback
}

export const sanitizeEarthEngineAssetId = value =>
    value
        ? String(value)
            .split('/')
            .map(segment => sanitizeSegment(segment, /[^0-9A-Za-z._-]+/g))
            .join('/')
        : value

export const isValidEarthEngineAssetId = value =>
    !value || sanitizeEarthEngineAssetId(value) === value
