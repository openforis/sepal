// Calendar days in UTC, for dates a recipe states as YYYY-MM-DD. Pure, and free of any date library: the shared
// library has none.
//
// Built with setUTCFullYear rather than Date.UTC, which reads years 0 to 99 as 1900 to 1999. A day's parts are
// normalized as Date normalizes them: a day past the end of its month is a day of the next.

export const utcDate = (year, monthIndex, day) => {
    const date = new Date(0)
    date.setUTCFullYear(year, monthIndex, day)
    return date
}

// The day a number of months before the one given by its parts: the same day of that month, or its last day where
// that month is shorter.
export const monthsBefore = (year, monthIndex, day, months) => {
    const month = utcDate(year, monthIndex - months, 1)
    const lastDay = utcDate(month.getUTCFullYear(), month.getUTCMonth() + 1, 0).getUTCDate()
    return utcDate(month.getUTCFullYear(), month.getUTCMonth(), Math.min(day, lastDay))
}

export const daysBefore = (year, monthIndex, day, days) =>
    utcDate(year, monthIndex, day - days)

// The date as YYYY-MM-DD, or null for one that form cannot state: before year 0, after 9999, or no date at all.
export const isoDate = date => {
    const year = date.getUTCFullYear()
    if (!Number.isInteger(year) || year < 0 || year > 9999) {
        return null
    }
    const pad = (value, length = 2) => String(value).padStart(length, '0')
    return `${pad(year, 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
