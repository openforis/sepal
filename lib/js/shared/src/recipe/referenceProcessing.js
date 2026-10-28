// The states of a processing setting a recipe takes from the reference it monitors against, and the small readers of
// what records them. Which settings, their defaults and the metadata forms recording them are each recipe's own
// (changeAlerts/processing.js, bayts/processing.js). Pure facts: acquisition, currency and operation holds remain the
// caller's.
export const REFERENCE = 'REFERENCE'
export const RECORDED = 'RECORDED'
export const NOT_RECORDED = 'NOT_RECORDED'
export const UNREADABLE = 'UNREADABLE'
export const PENDING = 'PENDING'
export const UNAVAILABLE = 'UNAVAILABLE'

// Without a value to use: an operation over it waits for, or is held by, the reference.
export const UNUSABLE_STATES = [UNREADABLE, PENDING, UNAVAILABLE]

export const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)

export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

export const pick = (value, keys) => Object.fromEntries(keys.filter(key => own(value, key)).map(key => [key, value[key]]))

// An object as recorded - itself, or JSON of it - or null where what is recorded is not one.
export const parseObject = value => {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value
        return isObject(parsed) ? parsed : null
    } catch {
        return null
    }
}

export const enumerated = values => value => values.includes(value)

export const finite = value => typeof value === 'number' && Number.isFinite(value)
