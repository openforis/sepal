import format from '~/format'

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

export const fromT = (t, dateFormat) => {
    function fromJDays() {
        const epochDay = 719529
        return new Date((t - epochDay) * 1000 * 3600 * 24)
    }

    switch (dateFormat) {
        case J_DAYS:
            return fromJDays()
        case FRACTIONAL_YEARS:
            return format.fractionalYearsToDate(t)
        case UNIX_TIME_MILLIS:
            return new Date(t)
        default:
            throw Error('Only dateFormat 0 (Julian days), 1 (Fractional years), and 2 (Unix time milliseconds) is supported')
    }
}

export const toT = (date, dateFormat) => {
    function toJDay() {
        const epochDay = 719529
        return date.getTime() / 1000 / 3600 / 24 + epochDay
    }

    function toFractionalYears() {
        const firstOfYear = new Date(Date.UTC(date.getFullYear(), 0, 1, 0, 0, 0))
        const firstOfNextYear = new Date(Date.UTC(date.getFullYear() + 1, 0, 1, 0, 0, 0))
        const fraction = (date - firstOfYear) / (firstOfNextYear - firstOfYear)
        return date.getFullYear() + fraction
    }

    switch (dateFormat) {
        case J_DAYS:
            return toJDay()
        case FRACTIONAL_YEARS:
            return toFractionalYears()
        case UNIX_TIME_MILLIS:
            return date.getTime()
        default:
            throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
    }
}
