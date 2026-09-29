// The calendar dates a Change Alerts recipe states: the monitoring period it watches, and the calibration
// period it compares against. Earth Engine executes over them and the GUI presents them, so both read one
// derivation.
//
// Pure: the calendar arithmetic is the shared calendar's (../calendar.js).

import {daysBefore, isoDate, monthsBefore} from '../calendar.js'

// The fields a complete monitoring period is stated in.
const PERIOD_FIELDS = [
    'monitoringEnd', 'monitoringDuration', 'monitoringDurationUnit', 'calibrationDuration', 'calibrationDurationUnit'
]

// Whether a model states a period at all. A recipe still being configured does not.
export const hasMonitoringDates = model =>
    PERIOD_FIELDS.every(field => stated(model?.date?.[field]))

// The monitoring period ends where the recipe says and runs back by its duration; the calibration period ends
// where the monitoring period starts. Execution is told why a period cannot be computed.
export const monitoringDates = model => {
    const {dates, error} = periodDates(model)
    if (error) {
        throw new Error(error.message)
    }
    return dates
}

// The dates of the period, or - for a consumer that must withhold rather than fail - the field that keeps them from
// being computed, and why: the first one not stated, a unit it cannot count, or a duration reaching a date YYYY-MM-DD
// cannot state.
export const periodDates = model => {
    const date = model?.date
    const missing = PERIOD_FIELDS.find(field => !stated(date?.[field]))
    if (missing) {
        return failure(missing, `A Change Alerts recipe states no complete monitoring period: ${JSON.stringify(date)}`)
    }
    const {
        monitoringEnd, monitoringDuration, monitoringDurationUnit, calibrationDuration, calibrationDurationUnit
    } = date
    if (typeof monitoringEnd !== 'string') {
        return failure('monitoringEnd', `A Change Alerts monitoringEnd is not a date: ${JSON.stringify(monitoringEnd)}`)
    }
    const monitoringStart = subtracted(date, monitoringEnd, monitoringDuration, monitoringDurationUnit, 'monitoring')
    if (monitoringStart.error) {
        return monitoringStart
    }
    const calibrationStart = subtracted(date, monitoringStart.date, calibrationDuration, calibrationDurationUnit, 'calibration')
    if (calibrationStart.error) {
        return calibrationStart
    }
    return {dates: {monitoringEnd, monitoringStart: monitoringStart.date, calibrationStart: calibrationStart.date}}
}

const failure = (field, message) => ({error: {field, message}})

const subtracted = (date, from, amount, unit, period) => {
    if (!MONTHS_PER_UNIT[unit] && !DAYS_PER_UNIT[unit]) {
        return failure(`${period}DurationUnit`, `Unsupported duration unit: ${unit}`)
    }
    const subtractedDate = subtract(from, amount, unit)
    return subtractedDate
        ? {date: subtractedDate}
        : failure(`${period}Duration`, `A Change Alerts ${period}Duration reaches a date that cannot be stated as YYYY-MM-DD: ${JSON.stringify(date)}`)
}

const DAYS_PER_UNIT = {days: 1, weeks: 7}
const MONTHS_PER_UNIT = {months: 1, years: 12}

// Subtracting months keeps the day of month where the target month has one and the last day of that month
// where it does not. Null for a date YYYY-MM-DD cannot state.
const subtract = (date, amount, unit) => {
    const [year, month, day] = date.split('-').map(Number)
    const months = MONTHS_PER_UNIT[unit]
    return isoDate(months
        ? monthsBefore(year, month - 1, day, amount * months)
        : daysBefore(year, month - 1, day, amount * DAYS_PER_UNIT[unit]))
}

const stated = value => value !== undefined && value !== null && value !== ''
