const ee = require('@google/earthengine')
const moment = require('moment')

const MILLIS_PER_DAY = 1000 * 60 * 60 * 24

const addDates = targetDate =>
    image =>
        image.compose(
            dayOfYear(),
            daysFromTarget(targetDate),
            targetDayCloseness(),
            unixTimeDays()
        )

const dayOfYear = () =>
    image =>
        ee.Image(
            image.date().getRelative('day', 'year')
        ).rename('dayOfYear')

const daysFromTarget = targetDate =>
    image => {
        const targetDay = parseInt(moment(targetDate, 'YYYY-MM-DD').format('DDD'))
        const delta = image
            .selfExpression('abs(targetDay - i.dayOfYear)', {targetDay})
            .rename('delta')
        return delta
            .selfExpression('min(i.delta, 365 - i.delta)')
            .rename('daysFromTarget')
    }

const targetDayCloseness = () =>
    image => image.select('daysFromTarget').multiply(-1).rename('targetDayCloseness')


const unixTimeDays = () =>
    image =>
        ee.Image(
            image.date().millis().divide(MILLIS_PER_DAY)
        ).rename('unixTimeDays')

module.exports = addDates
