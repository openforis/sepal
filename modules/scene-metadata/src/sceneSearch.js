// Parse a 'yyyy-MM-dd' string or Date into {year, month (1-12), day}.
const toUtcParts = date => {
    if (typeof date === 'string') {
        // yyyy-MM-dd — treat as UTC
        const [year, month, day] = date.split('-').map(Number)
        return {year, month, day}
    }
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate()
    }
}

// Build a Date at midnight UTC from parts.
const fromUtcParts = ({year, month, day}) =>
    new Date(Date.UTC(year, month - 1, day))

const toDateString = date => {
    const {year, month, day} = toUtcParts(date)
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const isLeapYearUTC = year =>
    (year % 400 === 0) || (year % 4 === 0 && year % 100 !== 0)

// 1-based day of year (UTC).

const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

const getDayOfYearUTC = (year, month, day) => {
    const base = DAYS_BEFORE_MONTH[month - 1] + day
    if (isLeapYearUTC(year) && month >= 3) {
        return base + 1
    }
    return base
}

// dayOfYearIgnoringLeapDay — in a leap year, days after Feb 29 (dayOfYear > 60) shift back by 1.

const dayOfYearIgnoringLeapDay = date => {
    const {year, month, day} = toUtcParts(date)
    let doy = getDayOfYearUTC(year, month, day)
    if (isLeapYearUTC(year) && doy > 60) {
        doy -= 1
    }
    return doy
}

// Distance in days around the year: min(diff, 365 - diff).

const daysFromDayOfYear = (date, dayOfYear) => {
    const {year, month, day} = toUtcParts(date)
    const doy = getDayOfYearUTC(year, month, day)
    const diff = Math.abs(doy - dayOfYear)
    return Math.min(diff, 365 - diff)
}

// Calendar-year arithmetic, UTC-stable. Clamps to the last day of the month when the resulting
// month has fewer days (Feb 29 2020 - 1 year = Feb 28 2019).

const _addYearsToDate = (year, month, day, n) => {
    const newYear = year + n
    const DAYS_IN_MONTH = [
        0, 31,
        isLeapYearUTC(newYear) ? 29 : 28,
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31
    ]
    const clampedDay = Math.min(day, DAYS_IN_MONTH[month])
    return fromUtcParts({year: newYear, month, day: clampedDay})
}

const addYears = (date, n) => {
    const {year, month, day} = toUtcParts(date)
    return _addYearsToDate(year, month, day, n)
}

const subYears = (date, n) => addYears(date, -n)

const parseBestScenesQuery = clientQuery => {
    const {sources, dates, sceneSelectionOptions, cloudCoverTarget, sceneCount, sceneAreaIds} = clientQuery
    const dataSetsMap = sources.dataSets
    const source = Object.keys(dataSetsMap)[0]
    const dataSets = Object.values(dataSetsMap).flat()
    const fromDate = toDateString(subYears(dates.seasonStart, Number(dates.yearsBefore)))
    const toDate = toDateString(addYears(dates.seasonEnd, Number(dates.yearsAfter)))
    const targetDayOfYear = dayOfYearIgnoringLeapDay(dates.targetDate)
    const targetDayOfYearWeight = sceneSelectionOptions.targetDateWeight
    return {
        source,
        sceneAreaIds,
        dataSets,
        fromDate,
        toDate,
        targetDayOfYear,
        targetDayOfYearWeight,
        cloudCoverTarget,
        minScenes: Number(sceneCount.min),
        maxScenes: Number(sceneCount.max)
    }
}

const parseSceneAreaQuery = (sceneAreaId, clientQuery) => {
    const {sources, dates, sceneSelectionOptions} = clientQuery
    const dataSetsMap = sources.dataSets
    const source = Object.keys(dataSetsMap)[0]
    const dataSets = Object.values(dataSetsMap).flat()
    const fromDate = toDateString(subYears(dates.seasonStart, Number(dates.yearsBefore)))
    const toDate = toDateString(addYears(dates.seasonEnd, Number(dates.yearsAfter)))
    const targetDayOfYear = dayOfYearIgnoringLeapDay(dates.targetDate)
    const targetDayOfYearWeight = Number(sceneSelectionOptions.targetDateWeight)
    return {
        sceneAreaId,
        source,
        dataSets,
        fromDate,
        toDate,
        targetDayOfYear,
        targetDayOfYearWeight
    }
}

// wrap=true when start >= end (the season crosses the year boundary).

const seasonDayOfYearConstraint = (seasonStartDoy, seasonEndDoy) => ({
    wrap: seasonStartDoy >= seasonEndDoy
})

export {
    addYears,
    dayOfYearIgnoringLeapDay,
    daysFromDayOfYear,
    parseBestScenesQuery,
    parseSceneAreaQuery,
    seasonDayOfYearConstraint,
    subYears,
    toDateString,
}
