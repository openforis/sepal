import {NO_PERIOD_OVERLAP} from '#sepal/recipe/dataSetAvailability'
import {msg} from '~/translate'

import {sourcesFieldRequirement} from './fieldRequirement'

// What a recipe whose Sources choose the data sets of a date-filtered collection needs of them, as its shared definition
// finds it (dataSetPeriodRequirement, lib/js/shared/src/recipe/dataSetAvailability.js): one that may hold imagery in the
// years its execution reads. Said at the data sets, naming the years, with the repairs. A Sources draft leaving none
// cannot be applied, judged against the dates applied; a Dates Apply leaving none is not refused, and Sources are marked,
// and what reads the imagery held, until either section repairs it. Only this refusal is said through it: an output held
// for anything else, a reference or an AOI, is said where that lies. `sources` is the recipe's Sources section.
export const dataSetPeriodRequirement = sources => ({
    ...sourcesFieldRequirement({
        id: `${sources.id}.dataSets.period`,
        section: sources,
        field: 'dataSets',
        code: NO_PERIOD_OVERLAP,
        message: ({startYear, endYear} = {}) => msg('process.source.dataSets.noPeriodOverlap', {startYear, endYear})
    }),
    outputState: false
})
