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

// One path segment made from user text, such as a recipe title: a Drive or bucket folder, or a file name prefix.
export const exportFolderName = text => {
    const name = String(text ?? '').replace(/[/\\"]/g, '_').trim()
    return name === '' || name === '.' || name === '..' ? 'export' : name
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
