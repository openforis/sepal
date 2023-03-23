const ee = require('#sepal/ee')

function removeOutliers({outlierRemoval, bandNames}) {
    return collection => {
        const stdDevs = {
            CONSERVATIVE: 4,
            MODERATE: 3,
            AGGRESSIVE: 2.6
        }[outlierRemoval] || 0
        if (!stdDevs) {
            return collection
        }
        const stats = collection
            .select(bandNames)
            .reduce({
                reducer: ee.Reducer.stdDev().combine(ee.Reducer.median(), null, true),
                parallelScale: 4
            })
        return collection
            .map(image => {
                const median = stats.select('.*_median')
                const threshold = stats.select('.*_stdDev').multiply(stdDevs)
                return image
                    .updateMask(
                        image.select(bandNames).subtract(median).abs().lte(threshold).or(ee.Number(stdDevs).eq(0))
                            .reduce(ee.Reducer.min())
                    )
            })

        // TODO: By-orbit outlier detection is running out of memory

        // var relativeOrbitNumbers = ee.FeatureCollection(collection.aggregate_array('relativeOrbitNumber_start')
        //     .distinct()
        //     .map(function (relativeOrbitNumber) {
        //         return ee.Feature(null, {relativeOrbitNumber_start: relativeOrbitNumber})
        //     })
        // )
        // var relativeOrbitStatsCollection = ee.ImageCollection(ee.Join.saveAll('images')
        //     .apply({
        //         primary: relativeOrbitNumbers,
        //         secondary: collection.select(bandNames),
        //         condition: ee.Filter.equals({leftField: 'relativeOrbitNumber_start', rightField: 'relativeOrbitNumber_start'})
        //     })
        //     .map(function (feature) {
        //         var images = ee.ImageCollection(ee.List(feature.get('images')))
        //         return images.reduce(ee.Reducer.stdDev().combine(ee.Reducer.median(), null, true), 4)
        //             .copyProperties(feature)
        //     })
        // )
        // var relativeOrbitStatsCollection = ee.ImageCollection(relativeOrbitNumbers
        //     .map(function (feature) {
        //         var images = collection.filter(ee.Filter.eq('relativeOrbitNumber_start', feature.get('relativeOrbitNumber_start')))
        //         return images
        //             .select(bandNames)
        //             .reduce({
        //                 reducer: ee.Reducer.stdDev().combine(ee.Reducer.median(), null, true),
        //                 parallelScale: 4
        //             })
        //             .copyProperties(feature)
        //     })
        // )
        // return collection
        //     .map(image => {
        //         const relativeOrbitNumber = image.get('relativeOrbitNumber_start')
        //         const stats = relativeOrbitStatsCollection
        //             .filter(ee.Filter.eq('relativeOrbitNumber_start', relativeOrbitNumber))
        //             .first()
        //         const median = stats.select('.*_median')
        //         const threshold = stats.select('.*_stdDev').multiply(stdDevs)
        //         return image.updateMask(
        //             image.select(bandNames).subtract(median).abs().lte(threshold).or(ee.Number(stdDevs).eq(0))
        //                 .reduce(ee.Reducer.min())
        //         )
        //     })
    }
}

module.exports = {removeOutliers}
