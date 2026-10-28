const hoursBetween = (from, to) => (to.getTime() - from.getTime()) / 1000 / 60 / 60

const firstOfMonth = date =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

const firstOfYearMonth = (year, month) =>
    new Date(Date.UTC(year, month - 1, 1))

const plusOneMonth = date =>
    new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds()
    ))

const year = date => date.getUTCFullYear()

const monthOfYear = date => date.getUTCMonth() + 1

// Day 0 of the next month is the last day of this (1-based) month.
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate()

const sameYearAndMonth = (date1, date2) =>
    year(date1) === year(date2) && monthOfYear(date1) === monthOfYear(date2)

export {
    daysInMonth,
    firstOfMonth,
    firstOfYearMonth,
    hoursBetween,
    monthOfYear,
    plusOneMonth,
    sameYearAndMonth,
    year,
}
