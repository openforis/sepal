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

// Whether a model states a period at all. A recipe still being configured does not, and a consumer of its
// output has to withhold rather than fail; execution asks monitoringDates and is told why it cannot.
export const hasMonitoringDates = model =>
    PERIOD_FIELDS.every(field => stated(model?.date?.[field]))

// The monitoring period ends where the recipe says and runs back by its duration; the calibration period ends
// where the monitoring period starts.
export const monitoringDates = model => {
    if (!hasMonitoringDates(model)) {
        throw new Error(
            `A Change Alerts recipe states no complete monitoring period: ${JSON.stringify(model?.date)}`
        )
    }
    const {
        monitoringEnd, monitoringDuration, monitoringDurationUnit, calibrationDuration, calibrationDurationUnit
    } = model.date
    const monitoringStart = subtract(monitoringEnd, monitoringDuration, monitoringDurationUnit)
    const calibrationStart = subtract(monitoringStart, calibrationDuration, calibrationDurationUnit)
    return {monitoringEnd, monitoringStart, calibrationStart}
}

const DAYS_PER_UNIT = {days: 1, weeks: 7}
const MONTHS_PER_UNIT = {months: 1, years: 12}

// Subtracting months keeps the day of month where the target month has one and the last day of that month
// where it does not.
const subtract = (date, amount, unit) => {
    const [year, month, day] = date.split('-').map(Number)
    const months = MONTHS_PER_UNIT[unit]
    const days = DAYS_PER_UNIT[unit]
    if (!months && !days) {
        throw new Error(`Unsupported duration unit: ${unit}`)
    }
    const subtracted = isoDate(months
        ? monthsBefore(year, month - 1, day, amount * months)
        : daysBefore(year, month - 1, day, amount * days))
    if (!subtracted) {
        throw new Error(`${amount} ${unit} before ${date} cannot be stated as YYYY-MM-DD`)
    }
    return subtracted
}

const stated = value => value !== undefined && value !== null && value !== ''
