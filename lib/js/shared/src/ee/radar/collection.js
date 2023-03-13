const ee = require('#sepal/ee')
const {compose} = require('../functional')
const {boxcar, leeFilter, gammaMap, refinedLee, leeSigma, snic} = require('./spatialSpeckleFilters')
const {terrainCorrection} = require('./terrainCorrection')
const {calculateHarmonics, calculateDependentBands} = require('./harmonics')

const createCollection = ({
    startDate,
    endDate,
    targetDate,
    geometry,
    orbits = ['ASCENDING'],
    geometricCorrection = 'ELLIPSOID',
    outlierRemoval = 'NONE',
    orbitNumbers = 'ALL',
    spatialSpeckleFilter = 'NONE',
    kernelSize = 5,
    targetKernelSize = 3,
    sigma = 0.9,
    strongScattererValues = [5, 0],
    multitemporalSpeckleFilter = 'NONE',
    numberOfImages = 10,
    minNumberOfImages = 0,
    mask = ['SIDES', 'FIRST_LAST'],
    minAngle = 30.88,
    maxAngle = 45.35,
    minObservations = 1,
    harmonicDependents = [],
    fit = false
}) => {
    const bandNames = ['VV', 'VH']
    var collection = filteredCollection({geometry, orbits})
    var speckleStatsCollection = multitemporalSpeckleFilter === 'NONE'
        ? null
        : createSpeckleStatsCollection(collection)
    return compose(
        collection.filterDate(startDate, endDate),
        preProcessCollection(),
        handleOrbitOverlap(),
        removeOutliers(),
        maskTooFewObservations(),
        addHarmonics()
    )

    function preProcessCollection() {
        return collection => collection
            .map(image => compose(
                image,
                resample(),
                maskBorder(),
                applySpeckleFilter(),
                addDateBands(),
                addRelativeOrbitNumber(),
                addHarmonicBands(),
                applyGeometricCorrection(),
                toDb()
            ))
    }

    function resample() {
        return image => image
            .addBands(image.resample(), null, true)
    }

    function createSpeckleStatsCollection(collection) {
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
    }
    
    function toReducedSpeckleStats(collection) {
        var centerDate = ee.Date(
            ee.Date(startDate).millis()
                .add(ee.Date(endDate).millis())
                .divide(2)
        )
        var maskedCollection = ee.ImageCollection([ee.Image([0, 0]).rename(bandNames)])
        var before = collection
            .filter(ee.Filter.lte('system:time_start', centerDate.millis()))
        // .map(maskBorder) // TODO: Enable this if we see artifacts
            .select(bandNames)
            .merge(maskedCollection) // Add dummy, to get a properly shaped array, even when there is no imagery
            .toArray()
            .arraySlice(0, 0, -1) // Drop dummy
            .arraySlice(0, ee.Number(numberOfImages).multiply(-1))
        var after = collection
            .filter(ee.Filter.gt('system:time_start', centerDate.millis()))
            // .map(maskBorder) // TODO: Enable this if we see artifacts
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
        ).median()
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
        var filtered = applySpatialSpeckleFilter(image)
        return image.select(bandNames).divide(filtered.select(bandNames))
    }

    function handleOrbitOverlap() {
        return collection => {
            if (orbitNumbers === 'ALL') {
                return collection
            } else if (orbitNumbers === 'DOMINANT' || orbits.length === 1) {
                const dominantOrbit = collection
                    .select('relative_orbit_number')
                    .reduce(ee.Reducer.mode())
                return collection
                    .map(image => {
                        return image.updateMask(
                            image.select('relative_orbit_number').eq(dominantOrbit)
                        )
                    })
            } else {
                const ascendingDominantOrbit = collection
                    .filter(ee.Filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING')))
                    .select('relative_orbit_number')
                    .reduce(ee.Reducer.mode())
                const descendingDominantOrbit = collection
                    .filter(ee.Filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING')))
                    .select('relative_orbit_number')
                    .reduce(ee.Reducer.mode())
                return collection
                    .map(image => {
                        return image.updateMask(
                            image.select('relative_orbit_number').eq(ascendingDominantOrbit).unmask(0)
                                .or(image.select('relative_orbit_number').eq(descendingDominantOrbit).unmask(0))
                        )
                    })
            }
        }
    }

    function removeOutliers() {
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

    function maskTooFewObservations() {
        return collection => {
            if (minObservations <= 1) {
                return collection
            }
            const count = collection.select(0).reduce(ee.Reducer.count())
            return collection.map(image => image
                .updateMask(
                    count.gte(minObservations)
                )
            )
        }
    }

    function addHarmonicBands() {
        return image => image.addBands(
            harmonicDependents.map(dependent => calculateDependentBands(image.select(dependent))
            )
        )
    }

    function addHarmonics() {
        return collection => {
            const harmonicsWithFit = harmonicDependents.map(dependent => calculateHarmonics(collection, dependent)
            )
            const harmonics = ee.Image(
                harmonicsWithFit.map(({harmonics}) => harmonics)
            ).clip(geometry)
            if (fit)
                collection = collection
                    .map(image => image
                        .addBands([harmonicsWithFit.map(({fit}) => fit(image))], null, true)
                        .excludeBands('.*_t', '.*_constant', '.*_cos', '.*_sin')
                    )
            return collection.set('harmonics', harmonics)
        }
    }

    function applySpeckleFilter() {
        return image => {
            if (multitemporalSpeckleFilter === 'NONE') {
                return applySpatialSpeckleFilter(image)
            }
            var speckleStats = speckleStatsCollection
                .filter(ee.Filter.eq('orbitProperties_pass', image.get('orbitProperties_pass')))
                .filter(ee.Filter.eq('relativeOrbitNumber_start', image.get('relativeOrbitNumber_start')))
                .first()
            switch (multitemporalSpeckleFilter) {
            case 'QUEGAN':
                return applyQuegan(image, speckleStats)
            case 'RABASAR':
                return applyRabasar(image, speckleStats)
            default:
                throw Error('Unsupported multitemporalSpeckleFilter: ', multitemporalSpeckleFilter)
            }
        }
    }
    function applyQuegan(image, speckleRatio) {
        var queganFiltered = applySpatialSpeckleFilter(image).select(bandNames)
            .multiply(speckleRatio.rename(bandNames))
            .addBands(speckleRatio.regexpRename('(.*)', '$1_speckle_ratio', false))
        return image
            .addBands(queganFiltered, null, true)
            
    }
    
    function applyRabasar(image, superImage) {
        var speckleRatio = image.select(bandNames).divide(superImage)
        var speckleRatioDenoised = applySpatialSpeckleFilter(speckleRatio)
        var rabasarFiltered = superImage.multiply(speckleRatioDenoised)
        return image.addBands(rabasarFiltered, null, true)
    }
    
    function applySpatialSpeckleFilter(image) {
        const filter = {
            BOXCAR: boxcar,
            GAMMA_MAP: gammaMap,
            LEE: leeFilter,
            REFINED_LEE: refinedLee,
            LEE_SIGMA: leeSigma,
            SNIC: snic
        }[spatialSpeckleFilter]
        return filter && filter(image, {kernelSize, targetKernelSize, sigma, strongScattererValues, bandNames}) || image
    }
        
    function applyGeometricCorrection() {
        return image => {
            const correction = {
                ELLIPSOID: toGamma0,
                TERRAIN: terrainCorrection
            }[geometricCorrection]
            return correction && correction(image) || image
        }
    }

    function toGamma0(image) {
        const gamma0 = image.expression('i/(cos(angle * pi / 180))', {
            'i': image.select(bandNames),
            'angle': image.select('angle'),
            'pi': Math.PI
        })
        return ee.Image(image.addBands(gamma0, null, true)
            .copyProperties(image, image.propertyNames()))
    }

    function maskBorder() {
        return image => {
            const angle = image.select('angle')
            const sideMask = mask.includes('SIDES')
                ? angle.gt(minAngle).and(angle.lt(maxAngle))
                : ee.Image(1)
            const firstLastMask = mask.includes('FIRST_LAST')
                ? createSceneStartEndMask({
                    image,
                    footprintBuffer: 1000,
                    borderBuffer: 800,
                    startEndBuffer: 30000 // Buffer at start and end of scene to limit masking to
                })
                : ee.Image(1)
            return image
                .updateMask(
                    sideMask.and(firstLastMask)
                )
        }
    }

    function createSceneStartEndMask(args) {
        var image = args.image
        var footprintBuffer = args.footprintBuffer
        var borderBuffer = args.borderBuffer
        var startEndBuffer = args.startEndBuffer
    
        var geometry = image.geometry()
        var coordinates = ee.Array(ee.List(geometry.coordinates().get(0)))
        var size = coordinates.length().get([0])
        var max = coordinates.reduce(ee.Reducer.max(), [0])
        var min = coordinates.reduce(ee.Reducer.min(), [0])
        var xMax = ee.Geometry.Point(coordinates.mask(
            max.slice(1, 0, 1).repeat(0, size).eq(coordinates.slice(1, 0, 1))
        ).slice(0, 0, 1).project([1]).toList())
        var xMin = ee.Geometry.Point(coordinates.mask(
            min.slice(1, 0, 1).repeat(0, size).eq(coordinates.slice(1, 0, 1))
        ).slice(0, 0, 1).project([1]).toList())
        var yMax = ee.Geometry.Point(coordinates.mask(
            max.slice(1, 1).repeat(0, size).eq(coordinates.slice(1, 1))
        ).slice(0, 0, 1).project([1]).toList())
        var yMin = ee.Geometry.Point(coordinates.mask(
            min.slice(1, 1).repeat(0, size).eq(coordinates.slice(1, 1))
        ).slice(0, 0, 1).project([1]).toList())
        var totalSlices = image.getNumber('totalSlices')
        var features = ee.FeatureCollection([
            ee.Feature(ee.Feature(ee.Geometry.LineString([xMax, yMax]), {sliceNumber: 1, orbit: 'DESCENDING'})),
            ee.Feature(ee.Feature(ee.Geometry.LineString([xMin, yMin]), {sliceNumber: totalSlices, orbit: 'DESCENDING'})),
            ee.Feature(ee.Feature(ee.Geometry.LineString([xMax, yMin]), {sliceNumber: 1, orbit: 'ASCENDING'})),
            ee.Feature(ee.Feature(ee.Geometry.LineString([xMin, yMax]), {sliceNumber: totalSlices, orbit: 'ASCENDING'})),
        ])
            .filter(ee.Filter.and(
                ee.Filter.eq('sliceNumber', image.getNumber('sliceNumber')),
                ee.Filter.eq('orbit', image.getString('orbitProperties_pass'))
            ))
        var buffered = features.geometry().buffer(startEndBuffer)
        var coords = ee.List(geometry.coordinates().get(0))
        var segments = ee.FeatureCollection(coords.zip(coords.slice(1).cat(coords.slice(0, 1)))
            .map(function (segment) {
                return ee.Feature(ee.Geometry.LineString(ee.List(segment)))
            })
        )
        // Select segments on the footprint contained within buffered
        var filteredSegments = segments.filter(ee.Filter.isContained('.geo', buffered))
    
        var notBorder = image.select('VV').mask().not()
            .fastDistanceTransform().sqrt().multiply(ee.Image.pixelArea().sqrt())
            .gt(borderBuffer)
            .or(filteredSegments.distance(startEndBuffer).not().unmask(1))
    
        return filteredSegments.distance(footprintBuffer).not().unmask(1)
            .and(notBorder)
    }

    function addDateBands() {
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

    function addRelativeOrbitNumber() {
        return image => image.addBands(
            ee.Image(image.getNumber('relativeOrbitNumber_start')).int16().rename('relative_orbit_number')
                .updateMask(image.mask().reduce(ee.Reducer.min()))
        )
    }
    
    function toDb() {
        return image =>
            image.addBands(
                image.select(bandNames).log10().multiply(10), null, true
            )
    }
}

const filteredCollection = ({geometry, orbits}) =>
    ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
        .filter(ee.Filter.and(
            ee.Filter.bounds(geometry),
            ee.Filter.eq('instrumentMode', 'IW'),
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'),
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'),
            orbits.length > 1
                ? ee.Filter.or(
                    ee.Filter.eq('orbitProperties_pass', orbits[0]),
                    ee.Filter.eq('orbitProperties_pass', orbits[1])
                )
                : ee.Filter.eq('orbitProperties_pass', orbits[0])
        ))

const hasImagery = ({geometry, startDate, endDate, orbits}) =>
    filteredCollection({geometry, orbits})
        .filterDate(startDate, endDate)
        .isEmpty()
        .not()

module.exports = {createCollection, hasImagery}
