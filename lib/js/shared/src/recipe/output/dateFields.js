import {utcDate} from '../calendar.js'
import {INCOMPLETE_IMAGE_OUTPUT, MALFORMED_IMAGE_OUTPUT} from './diagnostic.js'

// The date fields a recipe's period form writes, as a map product placed by them reads them: a field that is missing
// is incomplete, and one that is there but states nothing the form could have written is malformed. Each answers its
// value, or the code to refuse it with.

// The units the period forms offer.
export const DURATION_UNITS = ['days', 'weeks', 'months']

export const isMissing = value => value === undefined || value === null || value === ''

// A date as the form writes it, YYYY-MM-DD, naming a day its month has.
export const calendarDate = value => {
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
export const wholeNumber = value => {
    if (isMissing(value)) {
        return {code: INCOMPLETE_IMAGE_OUTPUT}
    }
    const number = typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value
    return Number.isInteger(number)
        ? {value: number}
        : {code: MALFORMED_IMAGE_OUTPUT}
}

export const durationUnit = value => {
    if (isMissing(value)) {
        return {code: INCOMPLETE_IMAGE_OUTPUT}
    }
    return DURATION_UNITS.includes(value)
        ? {value}
        : {code: MALFORMED_IMAGE_OUTPUT}
}
