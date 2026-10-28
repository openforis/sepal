import moment from 'moment'

import {sequence} from '#sepal/utils/array'

const DATE_DELTA = 3
const DATE_DELTA_UNIT = 'months'

export const chunkDateRanges = ({startDate, endDate}) => {
    const from = moment(startDate)
    const to = moment(endDate)
    const duration = moment(to).subtract(1, 'day').diff(from, DATE_DELTA_UNIT)
    return sequence(0, duration, DATE_DELTA).map(offset => {
        const start = moment(from).add(offset, DATE_DELTA_UNIT)
        const end = moment.min(moment(start).add(DATE_DELTA, DATE_DELTA_UNIT), to)
        return {startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD')}
    })
}
