const {addDays} = require('date-fns/addDays')
const {differenceInMilliseconds} = require('date-fns/differenceInMilliseconds')
const {format} = require('date-fns/format')
const {intervalToDuration} = require('date-fns/intervalToDuration')
const {parse} = require('date-fns/parse')
const {set} = require('date-fns/set')

const formatDurationShort = duration => {
    const parts = []
    if (duration.years) parts.push(`${duration.years}y`)
    if (duration.months) parts.push(`${duration.months}mo`)
    if (duration.days) parts.push(`${duration.days}d`)
    if (duration.hours) parts.push(`${duration.hours}h`)
    if (duration.minutes) parts.push(`${duration.minutes}m`)
    if (duration.seconds) parts.push(`${duration.seconds}s`)
    return parts.join(' ')
}

const formatInterval = (start, end = Date.now()) =>
    formatDurationShort(intervalToDuration({start, end})) || `${end - start}ms`

const formatDuration = duration =>
    formatInterval(0, duration)

const getMillisecondsUntilTime = (hours, minutes = 0, seconds = 0) => {
    if (hours !== undefined) {
        const now = new Date()
        const target = set(now, {hours, minutes, seconds, milliseconds: 0})
        const correctedTarget = target <= now
            ? addDays(target, 1)
            : target
        return differenceInMilliseconds(correctedTarget, now)
    }
    return 0
}

const parseTime = (timeString, format = 'HH:mm') => {
    const date = parse(timeString, format, new Date(0))
    return {
        hours: date.getHours(),
        minutes: date.getMinutes(),
        seconds: date.getSeconds()
    }
}

const formatTime = ({hours, minutes, seconds = 0}, fmt = 'HH:mm') => {
    const date = new Date(0)
    date.setHours(hours, minutes, seconds, 0)
    return format(date, fmt)
}

module.exports = {formatInterval, formatDuration, getMillisecondsUntilTime, parseTime, formatTime}
