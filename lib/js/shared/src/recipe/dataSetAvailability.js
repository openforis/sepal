import _ from 'lodash'

import {daysBefore, isoDate, utcDate} from './calendar.js'
import {OPTICAL_DATA_SET_YEARS} from './optical/dataSetYears.js'
import {RADAR_DATA_SET_YEARS} from './radar/dataSetYears.js'

// Whether the data sets a recipe's Sources choose may hold imagery for the period its execution reads, by the years the
// catalogue gives each (optical/dataSetYears.js, radar/dataSetYears.js). A year in range says imagery is possible, not
// that a scene covers the area or that enough do. A data set the catalogue gives no years - a Planet source, whose
// imagery is its assets' - and a period not fully stated judge nothing.
//
// Each type states the period it reads as years (`dataSetPeriod` of its type): its Sources judge what can be chosen by
// it, and its readiness what can run.

// Data sets were chosen, none of which may hold imagery in the period read.
export const NO_PERIOD_OVERLAP = 'NO_PERIOD_OVERLAP'

// The years a data set may hold imagery for, {fromYear, toYear}, the latter for one that has ended; null where the
// catalogue does not say.
export const dataSetYears = dataSet => Object.hasOwn(DATA_SET_YEARS, dataSet) ? DATA_SET_YEARS[dataSet] : null

// Whether a data set may hold imagery for some year of `period`.
export const mayContribute = (dataSet, {startYear, endYear}) => {
    const years = dataSetYears(dataSet)
    return !years || ((years.toYear === undefined || startYear <= years.toYear) && endYear >= years.fromYear)
}

// Of `dataSets`, those that may hold no imagery in `period`: none while there is no period.
export const excludedDataSets = (dataSets, period) => period
    ? dataSets.filter(dataSet => !mayContribute(dataSet, period))
    : []

// The years from `startYear` through `endYear`, or null unless both are whole years in that order.
export const periodOfYears = (startYear, endYear) =>
    Number.isInteger(startYear) && Number.isInteger(endYear) && startYear <= endYear
        ? {startYear, endYear}
        : null

// The years of the days from `startDate` until `endDate`, which is excluded, as a collection is filtered by them: null
// unless both are YYYY-MM-DD dates and some day lies between them.
export const periodOfDates = (startDate, endDate) => {
    const start = dayOf(startDate)
    const end = dayOf(endDate)
    return start && end && startDate < endDate
        ? periodOfYears(start.year, daysBefore(end.year, end.month - 1, end.day, 1).getUTCFullYear())
        : null
}

// What an operation reading the chosen data sets' imagery over `period(model)` needs: one of them that may hold imagery
// in it. Refused at the data sets, naming the years; nothing is judged while none is chosen, or there is no period.
export const dataSetPeriodRequirement = ({period, operations}) => ({
    code: NO_PERIOD_OVERLAP,
    operations,
    findings: model => {
        const dataSets = chosenDataSets(model)
        const judged = dataSets.length ? period(model) : null
        return judged && excludedDataSets(dataSets, judged).length === dataSets.length
            ? [{path: ['model', 'sources', 'dataSets'], ...judged}]
            : []
    }
})

// Every group as a list, a single identifier as a list of one.
const chosenDataSets = model => _.uniq(Object.values(model?.sources?.dataSets || {}).flatMap(chosen => [chosen].flat()))
    .filter(Boolean)

const dayOf = date => {
    const match = typeof date === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (!match) {
        return null
    }
    const [year, month, day] = match.slice(1).map(Number)
    return isoDate(utcDate(year, month - 1, day)) === date ? {year, month, day} : null
}

const DATA_SET_YEARS = {...OPTICAL_DATA_SET_YEARS, ...RADAR_DATA_SET_YEARS}
