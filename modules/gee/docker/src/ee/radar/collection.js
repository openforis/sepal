const ee = require('@google/earthengine')
const {compose} = require('@sepal/utils/functional')
const {refinedLee} = require('./refinedLee')
const {terrainCorrection} = require('./terrainCorrection')
const {calculateHarmonics, calculateDependentBands} = require('./harmonics')

const createCollection = (
    {
        startDate,
        endDate,
        targetDate,
        region,
        orbits = ['ASCENDING'],
        geometricCorrection = 'ELLIPSOID',
        speckleFilter = 'NONE',
        outlierRemoval = 'NONE',
        harmonicDependents = [],
        fit = false
    }) =>
    compose(
        filteredCollection({region, startDate, endDate, orbits}),
        mapCollection({targetDate, speckleFilter, geometricCorrection, harmonicDependents}),
        removeOutliers(outlierRemoval),
        addHarmonics({harmonicDependents, region, fit})
    )

const filteredCollection = ({region, startDate, endDate, orbits}) =>
    ee.ImageCollection('COPERNICUS/S1_GRD')
        .filter(ee.Filter.and(
            ee.Filter.bounds(region),
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

const mapCollection = ({targetDate, speckleFilter, geometricCorrection, harmonicDependents}) =>
    collection => collection
        .map(image =>
            compose(
                image,
                applySpeckleFilter(speckleFilter),
                applyGeometricCorrection(geometricCorrection),
                maskBorder(),
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

const addHarmonics = ({harmonicDependents, region, fit}) =>
    collection => {
        const harmonicsWithFit = harmonicDependents.map(dependent =>
            calculateHarmonics(collection, dependent)
        )
        const harmonics = ee.Image(
            harmonicsWithFit.map(({harmonics}) => harmonics)
        ).clip(region)
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
        return correction && correction(image) || image
    }

const toGamma0 = image => {
    const gamma0 = image.expression('i - 10 * log10(cos(angle * pi / 180))', {
        i: image.select(['VV', 'VH']),
        angle: image.select('angle'),
        pi: Math.PI
    })
    return image.addBands(gamma0, null, true)
}

const maskBorder = () =>
    image => {
        const totalSlices = ee.Number(image.get('totalSlices'))
        const sliceNumber = ee.Number(image.get('sliceNumber'))
        const middleSlice = ee.Image(sliceNumber.gt(1).and(sliceNumber.lt(totalSlices)))
        const mask = image.select(['VV', 'VH']).mask().reduce(ee.Reducer.min()).floor()
        const pixelsToMask = mask.not()
            .fastDistanceTransform(128, 'pixels').sqrt()
        const metersToMask = pixelsToMask
            .multiply(ee.Image.pixelArea().sqrt())
            .rename('metersToMask')
        const notBorder = metersToMask.gte(500).and(pixelsToMask.gt(2))
        const angle = image.select('angle')
        return image
            .updateMask(
                angle.gt(31).and(angle.lt(45))
                    .and(middleSlice.or(notBorder))
            )
    }

const addDateBands = targetDate =>
    image => {
        if (!targetDate)
            return image
        const date = image.date()
        const millisPerDay = 1000 * 60 * 60 * 24
        const daysFromTarget = date.difference(ee.Date(targetDate), 'day').abs().uint16()
        const quality = ee.Image(daysFromTarget.multiply(-1)).int16().rename('quality')
        const dayOfYear = ee.Image(date.getRelative('day', 'year')).uint16().rename('dayOfYear')
        const unixTimeDays = ee.Image(date.millis().divide(millisPerDay)).uint16().rename('unixTimeDays')
        return image
            .addBands(quality)
            .addBands(dayOfYear)
            .addBands(unixTimeDays)
    }

const applySnic = image => {
    const bands = ['VV', 'VH']
    const snic = ee.Algorithms.Image.Segmentation.SNIC({
        image: image.select(bands),
        size: 8,
        compactness: 5,
        connectivity: 8,
        neighborhoodSize: 16,
    }).select('.*_mean').rename(bands)
    return image.addBands(snic, null, true)
}

const applyRefinedLee = image => {
    const applyOn = band => image.addBands(
        toDb(
            refinedLee(
                toLinearScale(image.select(band))
            )
        ).rename(band), null, true
    )
    return image
        .addBands(applyOn('VV'), null, true)
        .addBands(applyOn('VH'), null, true)
}

function toLinearScale(image) {
    return ee.Image(10).pow(image.divide(10))
}

function toDb(image) {
    return image.log10().multiply(10)
}

module.exports = {createCollection}
