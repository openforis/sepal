import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export default (from, to) => {
    const fromDayOfYear = moment(from, DATE_FORMAT).dayOfYear()
    const toDayOfYear = moment(to, DATE_FORMAT).dayOfYear()
    let diff = toDayOfYear - fromDayOfYear
    if (diff >= 183)
        return diff - 365
    else if (diff <= -183)
        return diff + 365
    else
        return diff
}