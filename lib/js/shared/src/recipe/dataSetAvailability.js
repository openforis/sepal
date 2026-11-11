import _ from 'lodash'

import {daysBefore, isoDate, utcDate} from './calendar.js'
import {OPTICAL_COLLECTION_DATES} from './optical/collectionDates.js'
import dataSetSpecs from './optical/dataSetSpecs.js'
import {toDataSets} from './optical/opticalBands.js'
import {RADAR_COLLECTION_DATES, RADAR_COLLECTIONS} from './radar/collectionDates.js'

// Whether the data sets a recipe's Sources choose may hold imagery for the period its execution reads, by the days the
// catalogue gives the collections execution reads for them (optical/collectionDates.js, radar/collectionDates.js). A
// day in range says imagery is possible, not that a scene covers the area or that enough do. A data set the catalogue
// gives no days - a Planet source, whose imagery is its assets' - and a period not fully stated judge nothing.
//
// Each type states the period it reads (`dataSetPeriod` of its type): the days [startDate, endDate), its end excluded, the
// years they fall in, and the correction its processing reads the collections under (`reflectance`, SR or TOA), or null
// while that is not known - a data set is then excluded only where neither correction's collections may hold imagery.
// Its Sources judge what can be chosen by it, and its readiness what can run. A type comparing periods also states each
// (`dataSetWindows`), which its readiness judges separately.

// Data sets were chosen, none of which may hold imagery in the period read.
export const NO_PERIOD_OVERLAP = 'NO_PERIOD_OVERLAP'

// The days a data set may hold imagery for under `reflectance`, {fromDate, toDate}, the latter for one that has ended,
// with the years they fall in, {fromYear, toYear}: from the first day of the collections execution reads for it to the
// last, Landsat 4-5 as Landsat 4 and 5, either correction's where `reflectance` is null. Null where the catalogue does
// not say.
export const dataSetDates = (dataSet, reflectance) => {
    const dates = collectionDates(dataSet, reflectance)
    if (!dates?.length) {
        return null
    }
    const fromDate = _.min(dates.map(({fromDate}) => fromDate))
    const toDate = dates.every(({toDate}) => toDate) ? _.max(dates.map(({toDate}) => toDate)) : undefined
    return {fromDate, fromYear: yearOf(fromDate), ...(toDate && {toDate, toYear: yearOf(toDate)})}
}

// Whether a data set may hold imagery for some day of `period`: one of its collections does, under its correction.
export const mayContribute = (dataSet, {startDate, endDate, reflectance}) => {
    const dates = collectionDates(dataSet, reflectance)
    return !dates || dates.some(({fromDate, toDate}) => fromDate < endDate && (toDate === undefined || startDate <= toDate))
}

// Of `dataSets`, those that may hold no imagery in `period`: none while there is no period.
export const excludedDataSets = (dataSets, period) => period
    ? dataSets.filter(dataSet => !mayContribute(dataSet, period))
    : []

// The complete calendar years from `startYear` through `endYear`, or null unless both are whole years in that order.
// `reflectance` is the correction its collections are read under, null while not known; omitted, top of atmosphere, as
// execution defaults.
export const periodOfYears = (startYear, endYear, {reflectance} = {}) =>
    Number.isInteger(startYear) && Number.isInteger(endYear) && startYear <= endYear
        ? {
            startDate: isoDate(utcDate(startYear, 0, 1)),
            endDate: isoDate(utcDate(endYear + 1, 0, 1)),
            startYear,
            endYear,
            reflectance: readUnder(reflectance)
        }
        : null

// The days from `startDate` until `endDate`, which is excluded, as a collection is filtered by them, with the years they
// fall in: null unless both are YYYY-MM-DD dates and some day lies between them. `reflectance` as for a period of years.
export const periodOfDates = (startDate, endDate, {reflectance} = {}) => {
    const start = dayOf(startDate)
    const end = dayOf(endDate)
    return start && end && startDate < endDate
        ? {
            startDate,
            endDate,
            startYear: start.year,
            endYear: daysBefore(end.year, end.month - 1, end.day, 1).getUTCFullYear(),
            reflectance: readUnder(reflectance)
        }
        : null
}

// What a finding says of a period: its days and years, not the correction it was judged under.
export const periodFacts = ({startDate, endDate, startYear, endYear}) => ({startDate, endDate, startYear, endYear})

// What an operation reading the chosen data sets' imagery over `period(model)` needs: one of them that may hold imagery
// in it. Refused at the data sets, naming the period; nothing is judged while none is chosen, or there is no period.
export const dataSetPeriodRequirement = ({period, operations}) => ({
    code: NO_PERIOD_OVERLAP,
    operations,
    findings: model => {
        const dataSets = chosenDataSets(model)
        const judged = dataSets.length ? period(model) : null
        return judged && excludedDataSets(dataSets, judged).length === dataSets.length
            ? [{path: ['model', 'sources', 'dataSets'], ...periodFacts(judged)}]
            : []
    }
})

// The same for an operation comparing imagery of several named periods (`windows(model)`, [{window, ...period}], null
// while they are not stated): each needs one of the chosen data sets that may hold imagery in it, whichever does. Refused
// at the data sets in one finding naming every window none may cover, in their order.
export const dataSetWindowsRequirement = ({windows, operations}) => ({
    code: NO_PERIOD_OVERLAP,
    operations,
    findings: model => {
        const dataSets = chosenDataSets(model)
        const judged = dataSets.length ? windows(model) || [] : []
        const uncovered = judged.filter(window => excludedDataSets(dataSets, window).length === dataSets.length)
        return uncovered.length
            ? [{path: ['model', 'sources', 'dataSets'], windows: uncovered.map(({window, ...period}) => ({window, ...periodFacts(period)}))}]
            : []
    }
})

const readUnder = reflectance => reflectance === undefined ? 'TOA' : reflectance

// The dates of each collection execution reads for a data set under `reflectance`, or under either where it is null:
// null where it reads one the catalogue gives no dates, or the data set is not one it gives any for.
const collectionDates = (dataSet, reflectance) => {
    const corrections = reflectance === null ? ['SR', 'TOA'] : [reflectance === 'SR' ? 'SR' : 'TOA']
    const collections = Object.hasOwn(RADAR_COLLECTIONS, dataSet)
        ? [RADAR_COLLECTIONS[dataSet]]
        : corrections.flatMap(correction => toDataSets(dataSet).map(executed => dataSetSpecs[correction][executed]?.collectionName))
    const dates = collections.map(collection => Object.hasOwn(COLLECTION_DATES, collection) ? COLLECTION_DATES[collection] : null)
    return dates.every(Boolean) ? dates : null
}

// Every group as a list, a single identifier as a list of one.
const chosenDataSets = model => _.uniq(Object.values(model?.sources?.dataSets || {}).flatMap(chosen => [chosen].flat()))
    .filter(Boolean)

const yearOf = date => Number(date.slice(0, 4))

const dayOf = date => {
    const match = typeof date === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (!match) {
        return null
    }
    const [year, month, day] = match.slice(1).map(Number)
    return isoDate(utcDate(year, month - 1, day)) === date ? {year, month, day} : null
}

const COLLECTION_DATES = {...OPTICAL_COLLECTION_DATES, ...RADAR_COLLECTION_DATES}
