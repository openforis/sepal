const ee = require('#sepal/ee/ee')
const {applySpatialSpeckleFilter} = require('./spatialSpeckleFilters')

function createSpeckleStatsCollection({
    collection,
    startDate,
    endDate,
    orbits,
    spatialSpeckleFilterOptions,
    multitemporalSpeckleFilter,
    numberOfImages,
    minNumberOfImages,
    bandNames
}) {
    return ee.ImageCollection(ee.List(orbits)
        .map(function(orbitPass) {
            var collectionForOrbitPass = collection
                .filter(ee.Filter.eq('orbitProperties_pass', orbitPass))
            var relativeOrbitNumbers = collectionForOrbitPass
                .aggregate_array('relativeOrbitNumber_start')
                .distinct()
            return relativeOrbitNumbers
                .map(function(relativeOrbitNumber) {
                    var collectionForRelativeOrbitNumber = collectionForOrbitPass
                        .filter(ee.Filter.eq('relativeOrbitNumber_start', relativeOrbitNumber))
                    return toReducedSpeckleStats(collectionForRelativeOrbitNumber)
                        .set('orbitProperties_pass', orbitPass)
                        .set('relativeOrbitNumber_start', relativeOrbitNumber)
                })
        }).flatten()
    )

    function toReducedSpeckleStats(collection) {
        var centerDate = ee.Date(
            ee.Date(startDate).millis()
                .add(ee.Date(endDate).millis())
                .divide(2)
        )
        var maskedCollection = ee.ImageCollection([ee.Image([0, 0]).rename(bandNames)])
        var before = collection
            .filter(ee.Filter.lte('system:time_start', centerDate.millis()))
            .select(bandNames)
            .merge(maskedCollection) // Add dummy, to get a properly shaped array, even when there is no imagery
            .toArray()
            .arraySlice(0, 0, -1) // Drop dummy
            .arraySlice(0, ee.Number(numberOfImages).multiply(-1))
        var after = collection
            .filter(ee.Filter.gt('system:time_start', centerDate.millis()))
            .select(bandNames)
            .merge(maskedCollection) // Add dummy, to get a properly shaped array, even when there is no imagery
            .toArray()
            .arraySlice(0, 0, -1) // Drop dummy
            .arraySlice(0, 0, numberOfImages)
        var firstHalf = ee.Number(numberOfImages).divide(2).ceil().int8()
        var secondHalf = ee.Number(numberOfImages).divide(2).floor().multiply(-1).int8()
        var images = before.arraySlice(0, secondHalf)
            .arrayCat(after.arraySlice(0, 0, firstHalf), 0)
            .arrayCat(before.arraySlice(0, 0, firstHalf), 0)
            .arrayCat(after.arraySlice(0, secondHalf), 0)
            .arraySlice(0, 0, numberOfImages)
        return ee.ImageCollection(
            ee.List.sequence(0, ee.Number(numberOfImages).subtract(1))
                .map(function(i) {
                    i = ee.Number(i).byte()
                    var mask = images.arrayLength(0).gt(i)
                        .and(images.arrayLength(0).gte(minNumberOfImages))
                    var image = images
                        .updateMask(mask)
                        .arraySlice(0, i, i.add(1))
                        .arrayProject([1])
                        .arrayFlatten([bandNames])
                    return toSpeckleStats(image)
                })
        ).mean()
        // .median()
    }
    
    function toSpeckleStats(image) {
        switch (multitemporalSpeckleFilter) {
            case 'QUEGAN':
                return toSpeckleRatio(image)
            case 'RABASAR':
                return image.select(bandNames)
            default:
                throw Error('Unsupported multitemporalSpeckleFilter: ', multitemporalSpeckleFilter)
        }
    }

    function toSpeckleRatio(image) {
        var filtered = applySpatialSpeckleFilter({
            image,
            bandNames,
            ...spatialSpeckleFilterOptions,
        })
        return image.select(bandNames).divide(filtered.select(bandNames))
    }
}

module.exports = {createSpeckleStatsCollection}
