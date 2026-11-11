import moment from 'moment'

import {NO_PERIOD_OVERLAP} from '#sepal/recipe/dataSetAvailability'
import format from '~/format'
import {msg} from '~/translate'

import {sourcesFieldRequirement} from '../requirements/fieldRequirement'

// What a recipe whose Sources choose the data sets of a date-filtered collection needs of them, as its shared definition
// finds it (dataSetPeriodRequirement, lib/js/shared/src/recipe/dataSetAvailability.js): one that may hold imagery on some
// day its execution reads. Said at the data sets, naming the period, with the repairs. A Sources draft leaving none
// cannot be applied, judged against the dates applied; a Dates Apply leaving none is not refused, and Sources are marked,
// and what reads the imagery held, until either section repairs it. Only this refusal is said through it: an output held
// for anything else, a reference or an AOI, is said where that lies. `sources` is the recipe's Sources section.
//
// A type comparing several periods (dataSetWindowsRequirement) is found to leave windows uncovered instead, each said in
// its own words: `windowLabel({window, ...period})`.
export const dataSetPeriodRequirement = (sources, {windowLabel} = {}) => ({
    ...sourcesFieldRequirement({
        id: `${sources.id}.dataSets.period`,
        section: sources,
        field: 'dataSets',
        code: NO_PERIOD_OVERLAP,
        message: ({windows, ...period} = {}) => windows
            ? msg('process.source.dataSets.noWindowOverlap', {windows: windows.map(windowLabel).join(', ')})
            : msg('process.source.dataSets.noPeriodOverlap', {period: periodLabel(period)})
    }),
    outputState: false
})

// A period a finding names, {startDate, endDate, startYear, endYear}: by its years where it is whole calendar years, and
// otherwise by its days, the last the day before its exclusive end.
export const periodLabel = ({startDate, endDate, startYear, endYear}) =>
    startDate === `${startYear}-01-01` && endDate === `${endYear + 1}-01-01`
        ? format.yearRange(startYear, endYear)
        : format.dateRange(startDate, moment(endDate).subtract(1, 'day'))
