const ee = require('#sepal/ee')
const {compose} = require('../functional')
const {refinedLee} = require('./refinedLee')
const {terrainCorrection} = require('./terrainCorrection')
const {calculateHarmonics, calculateDependentBands} = require('./harmonics')

const createCollection = (
    {
        startDate,
        endDate,
        targetDate,
        geometry,
        orbits = ['ASCENDING'],
        geometricCorrection = 'ELLIPSOID',
        speckleFilter = 'NONE',
        outlierRemoval = 'NONE',
        harmonicDependents = [],
        fit = false
    }) =>
    compose(
        filteredCollection({geometry, startDate, endDate, orbits}),
        speckleFilterCollection(speckleFilter),
        mapCollection({targetDate, speckleFilter, geometricCorrection, harmonicDependents}),
        removeOutliers(outlierRemoval),
        addHarmonics({harmonicDependents, geometry, fit})
    )

const filteredCollection = ({geometry, startDate, endDate, orbits}) =>
    ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
        .filter(ee.Filter.and(
            ee.Filter.bounds(geometry),
            ee.Filter.date(startDate, endDate),
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

const speckleFilterCollection = speckleFilter =>
    collection => {
        if (speckleFilter !== 'QUEGAN')
            return collection
        const spatialMeanCollection = collection
            .map(image => {
                const mean = image.select(['VV', 'VH'])
                    .reduceNeighborhood(ee.Reducer.mean(), ee.Kernel.square(30, 'meters'))
                const ratio = image
                    .select(['VV', 'VH'])
                    .divide(mean)
                    .regexpRename('(.*)', '$1_ratio', false)
                return image
                    .addBands(mean)
                    .addBands(ratio)
                    .copyProperties(image, image.propertyNames())
            })

        return spatialMeanCollection
            .map(image => {
                const date = image.date()
                const startDate = date.advance(-3, 'months')
                const endDate = date.advance(3, 'months')

                const ratios = spatialMeanCollection
                    .select('.*_ratio')
                    .filterDate(startDate, endDate)
                    .filterMetadata(
                        'relativeOrbitNumber_start',
                        'equals',
                        image.get('relativeOrbitNumber_start')
                    )

                return image.select('.*_mean')
                    .multiply(ratios.mean())
                    .rename(['VV', 'VH'])
                    .addBands(image.select('angle'))
                    .copyProperties(image, image.propertyNames())
            })
    }

const mapCollection = ({targetDate, speckleFilter, geometricCorrection, harmonicDependents}) =>
    collection => collection
        .map(image =>
            compose(
                image,
                maskBorder(),
                applySpeckleFilter(speckleFilter),
                applyGeometricCorrection(geometricCorrection),
                addDateBands(targetDate),
                addHarmonicBands(harmonicDependents)
            )
        )

const removeOutliers = outlierRemoval =>
    collection => {
        const stdDevs = {
            CONSERVATIVE: 4,
            MODERATE: 3,
            AGGRESSIVE: 2.6
        }[outlierRemoval]
        if (!stdDevs)
            return collection
        const bands = ['VV', 'VH']
        const reduced = collection.select(bands).reduce(
            ee.Reducer.median().combine(ee.Reducer.stdDev(), '', true))
        const median = reduced.select('.*_median')
        const stdDev = reduced.select('.*_stdDev')
        const threshold = stdDev.multiply(stdDevs)
        return collection.map(function (image) {
            return image.updateMask(
                image.select(bands).subtract(median).abs().lte(threshold)
                    .reduce(ee.Reducer.min())
            )
        })
    }

const addHarmonicBands = dependents =>
    image =>
        image.addBands(
            dependents.map(dependent =>
                calculateDependentBands(image.select(dependent))
            )
        )

const addHarmonics = ({harmonicDependents, geometry, fit}) =>
    collection => {
        const harmonicsWithFit = harmonicDependents.map(dependent =>
            calculateHarmonics(collection, dependent)
        )
        const harmonics = ee.Image(
            harmonicsWithFit.map(({harmonics}) => harmonics)
        ).clip(geometry)
        if (fit)
            collection = collection
                .map(image =>
                    image
                        .addBands([harmonicsWithFit.map(({fit}) => fit(image))], null, true)
                        .excludeBands('.*_t', '.*_constant', '.*_cos', '.*_sin')
                )
        return collection.set('harmonics', harmonics)
    }

const applySpeckleFilter = speckleFilter =>
    image => {
        const filter = {
            REFINED_LEE: applyRefinedLee,
            SNIC: applySnic
        }[speckleFilter]
        return filter && filter(image) || image
    }

const applyGeometricCorrection = geometricCorrection =>
    image => {
        const correction = {
            ELLIPSOID: toGamma0,
            TERRAIN: terrainCorrection
        }[geometricCorrection]
        return toDb(correction && correction(image) || image)
    }

const toGamma0 = image => {
    const gamma0 = image.expression('i/(cos(angle * pi / 180))', {
        'i': image.select(['VV', 'VH']),
        'angle': image.select('angle'),
        'pi': Math.PI
    })
    return ee.Image(image.addBands(gamma0, null, true)
        .copyProperties(image, image.propertyNames()))
}

const maskBorder = () =>
    image => {
        const angle = image.select('angle')
        return image
            .updateMask(
                angle.gt(31).and(angle.lt(45))
                    .and(createSceneStartEndMask(image, 500))
            )
    }

function createSceneStartEndMask(image, bufferMeters) {
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
    var buffered = features.geometry().buffer(20000)
    var coords = ee.List(geometry.coordinates().get(0))
    var segments = ee.FeatureCollection(coords.zip(coords.slice(1).cat(coords.slice(0, 1)))
        .map(function (segment) {
            return ee.Feature(ee.Geometry.LineString(ee.List(segment)))
        })
    )
    // Select segments on the footprint contained within buffered
    var filteredSegments = segments.filter(ee.Filter.isContained('.geo', buffered))
    return filteredSegments.distance(bufferMeters).not().unmask(1)
}

const addDateBands = targetDate =>
    image => {
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
    }

const applySnic = image => {
    const bands = ['VV', 'VH']
    const snic = ee.Algorithms.Image.Segmentation.SNIC({
        image: image.select(bands),
        compactness: 0.15,
        size: 3
    }).select('.*_mean').rename(bands)
    return image.addBands(snic, null, true)
}

const applyRefinedLee = image => {
    const applyOn = band => image.addBands(
        refinedLee(
            image.select(band)
        ).rename(band), null, true
    )
    return image
        .addBands(applyOn('VV'), null, true)
        .addBands(applyOn('VH'), null, true)
}

const hasImagery = ({geometry, startDate, endDate, orbits}) =>
    filteredCollection({geometry, startDate, endDate, orbits})
        .isEmpty()
        .not()

function toDb(image) {
    return image.addBands(
        image.select(['VV', 'VH']).log10().multiply(10), null, true
    )
}

module.exports = {createCollection, hasImagery}
