const ee = require('#sepal/ee/ee')

function addDateBands({targetDate}) {
    return image => {
        if (!targetDate)
            return image
        const date = image.date()
        const millisPerDay = 1000 * 60 * 60 * 24
        const daysFromTarget = ee.Image(date.difference(ee.Date(targetDate), 'day').abs()).int16().rename('daysFromTarget')
        const quality = daysFromTarget.multiply(-1).rename('quality')
        const dayOfYear = ee.Image(date.getRelative('day', 'year')).uint16().rename('dayOfYear')
        const unixTimeDays = ee.Image(date.millis().divide(millisPerDay)).uint16().rename('unixTimeDays')
        return image
            .addBands(daysFromTarget)
            .addBands(quality)
            .addBands(dayOfYear)
            .addBands(unixTimeDays)
            .updateMask(image.mask().reduce(ee.Reducer.min()))
    }
}

module.exports = {addDateBands}
