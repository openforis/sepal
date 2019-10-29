const ee = require('@google/earthengine')

const allScenes = (
    {
        region,
        dates: {
            targetDate = null,
            seasonStart = null,
            seasonEnd = null,
            yearsBefore = 0,
            yearsAfter = 0
        } = {},
        sources = null,
        compositeOptions: {
            corrections = null,
            mask = null,
            cloudBuffer = null
        } = {}
    }) => {
    return ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
        .filterBounds(region)
        .filterDate('2018-07-01', '2018-08-01')
}

const selectedScenes = ({}) => {
}

module.exports = {allScenes, selectedScenes}
