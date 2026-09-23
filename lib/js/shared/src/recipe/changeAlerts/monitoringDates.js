// The calendar dates a Change Alerts recipe states: the monitoring period it watches, and the calibration
// period it compares against. Earth Engine executes over them and the GUI presents them, so both read one
// derivation.
//
// Pure, and free of any date library: the shared library has none, and this is the whole of the arithmetic.

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
    if (months) {
        const target = new Date(Date.UTC(year, month - 1 - amount * months, 1))
        const targetYear = target.getUTCFullYear()
        const targetMonth = target.getUTCMonth()
        const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
        return format(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
    }
    const days = DAYS_PER_UNIT[unit]
    if (!days) {
        throw new Error(`Unsupported duration unit: ${unit}`)
    }
    return format(Date.UTC(year, month - 1, day - amount * days))
}

const format = millis => new Date(millis).toISOString().substring(0, 10)

const stated = value => value !== undefined && value !== null && value !== ''
