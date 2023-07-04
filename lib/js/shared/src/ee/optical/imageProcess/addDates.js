const ee = require('#sepal/ee')
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
        ).int16().rename('dayOfYear').updateMask(image.select(0).mask())

const daysFromTarget = targetDate =>
    image => {
        if (!targetDate)
            return ee.Image(0)
                .int16()
                .rename('daysFromTarget')
        const targetDay = parseInt(moment(targetDate, 'YYYY-MM-DD').format('DDD'))
        const delta = image
            .selfExpression('abs(targetDay - i.dayOfYear)', {targetDay})
            .rename('delta')
        return delta
            .selfExpression('min(i.delta, 365 - i.delta)')
            .int16()
            .rename('daysFromTarget')
            .updateMask(image.select(0).mask())
    }

const targetDayCloseness = () =>
    image => image
        .select('daysFromTarget')
        .multiply(-1)
        .int16()
        .rename('targetDayCloseness')
        .updateMask(image.select(0).mask())

const unixTimeDays = () =>
    image =>
        ee.Image(
            image.date().millis().divide(MILLIS_PER_DAY)
        ).int16().rename('unixTimeDays').updateMask(image.select(0).mask())

module.exports = addDates
