const ee = require('@google/earthengine')

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
    }) => {
    let collection = ee.ImageCollection('COPERNICUS/S1_GRD')
        .filter(ee.Filter.and(
            ee.Filter.bounds(region),
            ee.Filter.date(startDate, endDate),
            ee.Filter.eq('instrumentMode', 'IW'),
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'),
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'),
            orbits.length > 1 ? ee.Filter.or(
                ee.Filter.eq('orbitProperties_pass', orbits[0]),
                ee.Filter.eq('orbitProperties_pass', orbits[1])
            ) : ee.Filter.eq('orbitProperties_pass', orbits[0])
        ))
        .map(preProcess({targetDate, speckleFilter, geometricCorrection, harmonicDependents}))
    if (outlierRemoval === 'CONSERVATIVE')
        collection = stdDevsFromMedianOutlierRemoval(collection, 4)
    else if (outlierRemoval === 'MODERATE')
        collection = stdDevsFromMedianOutlierRemoval(collection, 3)
    else if (outlierRemoval === 'AGGRESSIVE')
        collection = stdDevsFromMedianOutlierRemoval(collection, 2.6)
    if (harmonicDependents.length)
        collection = addHarmonics({collection, harmonicDependents, region, fit})
    return collection
}

const preProcess = ({targetDate, geometricCorrection, speckleFilter, harmonicDependents}) =>
    image => {
        image = image.float().resample('bicubic')
        if (speckleFilter === 'REFINED_LEE')
            image = applyRefinedLee(image)
        else if (speckleFilter === 'SNIC')
            image = applySnic(image)
        if (geometricCorrection === 'ELLIPSOID')
            image = toGamma0(image)
        else if (geometricCorrection === 'TERRAIN') {
            image = terrainCorrection(image)
            image = maskOverlay(image)
        }
        image = maskBorder(image)
        if (targetDate)
            image = addDateBands(image, targetDate)
        if (harmonicDependents.length)
            image = addHarmonicBands(image, harmonicDependents)
        return image
    }

const addHarmonicBands = (image, dependents) => {
    const dependentBands = dependent => {
        const date = image.date()
        const t = ee.Image(
            date.difference(ee.Date('1970-01-01'), 'year')
        ).float().rename(`${dependent}_t`)
        const constant = ee.Image.constant(1).rename(`${dependent}_constant`)
        const timeRadians = t.multiply(2 * Math.PI)
        const cos = timeRadians.cos().rename(`${dependent}_cos`)
        const sin = timeRadians.sin().rename(`${dependent}_sin`)
        return t
            .addBands(constant)
            .addBands(cos)
            .addBands(sin)
    }
    return image.addBands(dependents.map(dependentBands))
}

const addHarmonics = ({collection, harmonicDependents, region, fit}) => {
    const calculateHarmonics = (collection, dependent, region) => {
        const independents = ee.List([`${dependent}_constant`, `${dependent}_t`, `${dependent}_cos`, `${dependent}_sin`])
        const trend = collection
            .select(independents.add(dependent))
            // The output of this reducer is a 4x1 array image.
            .reduce(ee.Reducer.linearRegression({
                numX: independents.length(),
                numY: 1
            }))

        // Turn the array image into a multi-band image of coefficients.
        const trendCoefficients = trend.select('coefficients')
            .arrayProject([0])
            .arrayFlatten([independents])

        const sin = trendCoefficients.select(`${dependent}_sin`)
        const cos = trendCoefficients.select(`${dependent}_cos`)
        const phase = sin.atan2(cos).rename(`${dependent}_phase`)

        const amplitude = sin.hypot(sin).rename(`${dependent}_amplitude`)

        const residuals = trend.select('residuals')
            .arrayProject([0])
            .arrayFlatten([['residuals']])
            .rename(`${dependent}_residuals`)

        const harmonics = phase
            .addBands(amplitude)
            .addBands(residuals)
            .float()
            .clip(region)

        const fitFunction = image => {
            const fitted = image.select(independents)
                .multiply(trendCoefficients)
                .reduce('sum')
                .rename(`${dependent}_fitted`)
            const residuals = image.select(dependent)
                .subtract(fitted)
                .rename(`${dependent}_residuals`)
            return fitted
                .addBands(residuals)
                .float()
        }

        return {harmonics, fitFunction}
    }
    const harmonicsList = harmonicDependents.map(dependent => calculateHarmonics(collection, dependent, region))
    const harmonics = ee.Image(harmonicsList.map(({harmonics}) => harmonics))
    const fitFunctions = harmonicsList.map(({fitFunction}) => fitFunction)
    if (fit)
        collection = collection
            .map(image =>
                image
                    .addBands([fitFunctions.map(fit => fit(image))], null, true)
                    .excludeBands('.*_t', '.*_constant', '.*_cos', '.*_sin')
            )
    return collection.set('harmonics', harmonics)
}

const toGamma0 = image => {
    const gamma0 = image.expression('i - 10 * log10(cos(angle * pi / 180))', {
        i: image.select(['VV', 'VH']),
        angle: image.select('angle'),
        pi: Math.PI
    })
    return image.addBands(gamma0, null, true)
}

const terrainCorrection = image => {
    const imgGeom = image.geometry()
    const srtm = ee.Image('USGS/SRTMGL1_003').clip(imgGeom) // 30m srtm
    const sigma0Pow = ee.Image.constant(10).pow(image.divide(10.0))

    // Article ( numbers relate to chapters)
    // 2.1.1 Radar geometry
    const theta_i = image.select('angle')
    const phi_i = ee.Terrain.aspect(theta_i)
        .reduceRegion(ee.Reducer.mean(), theta_i.get('system:footprint'), 1000)
        .get('aspect')

    // 2.1.2 Terrain geometry
    const alpha_s = ee.Terrain.slope(srtm).select('slope')
    const phi_s = ee.Terrain.aspect(srtm).select('aspect')

    // 2.1.3 Model geometry
    // reduce to 3 angle
    const phi_r = ee.Image.constant(phi_i).subtract(phi_s)

    // convert all to radians
    const phi_rRad = phi_r.multiply(Math.PI / 180)
    const alpha_sRad = alpha_s.multiply(Math.PI / 180)
    const theta_iRad = theta_i.multiply(Math.PI / 180)
    const ninetyRad = ee.Image.constant(90).multiply(Math.PI / 180)

    // slope steepness in range (eq. 2)
    const alpha_r = (alpha_sRad.tan().multiply(phi_rRad.cos())).atan()

    // slope steepness in azimuth (eq 3)
    const alpha_az = (alpha_sRad.tan().multiply(phi_rRad.sin())).atan()

    // local incidence angle (eq. 4)
    const theta_lia = (alpha_az.cos().multiply((theta_iRad.subtract(alpha_r)).cos())).acos()
    const theta_liaDeg = theta_lia.multiply(180 / Math.PI)
    // 2.2
    // Gamma_nought_flat
    const gamma0 = sigma0Pow.divide(theta_iRad.cos())
    const gamma0dB = ee.Image.constant(10).multiply(gamma0.log10())
    const ratio_1 = gamma0dB.select('VV').subtract(gamma0dB.select('VH'))

    // Volumetric Model
    const nominator = (ninetyRad.subtract(theta_iRad).add(alpha_r)).tan()
    const denominator = (ninetyRad.subtract(theta_iRad)).tan()
    const volModel = (nominator.divide(denominator)).abs()

    // apply model
    const gamma0_Volume = gamma0.divide(volModel)
    const gamma0_VolumeDB = ee.Image.constant(10).multiply(gamma0_Volume.log10())

    // we add a layover/shadow maskto the original implmentation
    // layover, where slope > radar viewing angle
    const alpha_rDeg = alpha_r.multiply(180 / Math.PI)
    const layover = alpha_rDeg.lt(theta_i)

    // shadow where LIA > 90
    const shadow = theta_liaDeg.lt(85)

    // calculate the ratio for RGB vis
    const ratio = gamma0_VolumeDB.select('VV').subtract(gamma0_VolumeDB.select('VH'))

    const output = gamma0_VolumeDB.addBands(ratio).addBands(alpha_r).addBands(phi_s).addBands(theta_iRad)
        .addBands(layover).addBands(shadow).addBands(gamma0dB).addBands(ratio_1)

    return image.addBands(
        output.select(['VV', 'VH', 'slope_1', 'slope_2'], ['VV', 'VH', 'layover', 'shadow']),
        null,
        true
    )
}

const maskOverlay = image => image.updateMask(
    image.select('layover').and(image.select('shadow'))
)

const maskBorder = image => {
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

const addDateBands = (image, targetDate) => {
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

const stdDevsFromMedianOutlierRemoval = (collection, stdDevs) => {
    const bands = ['VV', 'VH']
    const reduced = collection.select(bands).reduce(
        ee.Reducer.median().combine(ee.Reducer.stdDev(), '', true))
    const median = reduced.select('.*_median')
    const stdDev = reduced.select('.*_stdDev')
    const threshold = stdDev.multiply(stdDevs)
    const maskedCollection = collection.map(function (image) {
        return image.updateMask(
            image.select(bands).subtract(median).abs().lte(threshold)
                .reduce(ee.Reducer.min())
        )
    })
    return maskedCollection
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
    image = onBand('VV')
    image = onBand('VH')

    return image

    function onBand(band) {
        return image.addBands(
            toDb(refinedLee(toLinearScale(image.select(band))))
                .rename(band), null, true)
    }
}

function toLinearScale(image) {
    return ee.Image(10).pow(image.divide(10))
}

function toDb(image) {
    return image.log10().multiply(10)
}

// Implemented by Guido Lemoine
// https://groups.google.com/forum/#!searchin/google-earth-engine-developers/refined$20lee%7Csort:date/google-earth-engine-developers/ExepnAmP-hQ/Xxa7raFuBAAJ
const refinedLee = img => {
    // img must be in natural units, i.e. not in dB!
    // Set up 3x3 kernels
    const weights3 = ee.List.repeat(ee.List.repeat(1, 3), 3)
    const kernel3 = ee.Kernel.fixed(3, 3, weights3, 1, 1, false)

    const mean3 = img.reduceNeighborhood(ee.Reducer.mean(), kernel3)
    const variance3 = img.reduceNeighborhood(ee.Reducer.variance(), kernel3)

    // Use a sample of the 3x3 windows inside a 7x7 windows to determine gradients and directions
    const sample_weights = ee.List([[0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0]])

    const sample_kernel = ee.Kernel.fixed(7, 7, sample_weights, 3, 3, false)

    // Calculate mean and variance for the sampled windows and store as 9 bands
    const sample_mean = mean3.neighborhoodToBands(sample_kernel)
    const sample_const = variance3.neighborhoodToBands(sample_kernel)

    // Determine the 4 gradients for the sampled windows
    let gradients = sample_mean.select(1).subtract(sample_mean.select(7)).abs()
    gradients = gradients.addBands(sample_mean.select(6).subtract(sample_mean.select(2)).abs())
    gradients = gradients.addBands(sample_mean.select(3).subtract(sample_mean.select(5)).abs())
    gradients = gradients.addBands(sample_mean.select(0).subtract(sample_mean.select(8)).abs())

    // And find the maximum gradient amongst gradient bands
    const max_gradient = gradients.reduce(ee.Reducer.max())

    // Create a mask for band pixels that are the maximum gradient
    let gradmask = gradients.eq(max_gradient)

    // duplicate gradmask bands: each gradient represents 2 directions
    gradmask = gradmask.addBands(gradmask)

    // Determine the 8 directions
    let directions = sample_mean.select(1).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(7))).multiply(1)
    directions = directions.addBands(sample_mean.select(6).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(2))).multiply(2))
    directions = directions.addBands(sample_mean.select(3).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(5))).multiply(3))
    directions = directions.addBands(sample_mean.select(0).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(8))).multiply(4))
    // The next 4 are the not() of the previous 4
    directions = directions.addBands(directions.select(0).not().multiply(5))
    directions = directions.addBands(directions.select(1).not().multiply(6))
    directions = directions.addBands(directions.select(2).not().multiply(7))
    directions = directions.addBands(directions.select(3).not().multiply(8))

    // Mask all values that are not 1-8
    directions = directions.updateMask(gradmask)

    // "collapse" the stack into a singe band image (due to masking, each pixel has just one value (1-8) in it's directional band, and is otherwise masked)
    directions = directions.reduce(ee.Reducer.sum())

    const sample_stats = sample_var.divide(sample_mean.multiply(sample_mean))

    // Calculate localNoiseVariance
    const sigmaV = sample_stats.toArray().arraySort().arraySlice(0, 0, 5).arrayReduce(ee.Reducer.mean(), [0])

    // Set up the 7*7 kernels for directional statistics
    const rect_weights = ee.List.repeat(ee.List.repeat(0, 7), 3).cat(ee.List.repeat(ee.List.repeat(1, 7), 4))

    const diag_weights = ee.List([[1, 0, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0, 0],
        [1, 1, 1, 1, 0, 0, 0], [1, 1, 1, 1, 1, 0, 0], [1, 1, 1, 1, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1]])

    const rect_kernel = ee.Kernel.fixed(7, 7, rect_weights, 3, 3, false)
    const diag_kernel = ee.Kernel.fixed(7, 7, diag_weights, 3, 3, false)

    // Create stacks for mean and variance using the original kernels. Mask with relevant direction.
    let dir_mean = img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel).updateMask(directions.eq(1))
    let dir_const = img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel).updateMask(directions.eq(1))

    dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel).updateMask(directions.eq(2)))
    dir_const = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel).updateMask(directions.eq(2)))

    // and add the bands for rotated kernels
    for (let i = 1; i < 4; i++) {
        dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel.rotate(i)).updateMask(directions.eq(2 * i + 1)))
        dir_const = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel.rotate(i)).updateMask(directions.eq(2 * i + 1)))
        dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel.rotate(i)).updateMask(directions.eq(2 * i + 2)))
        dir_const = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel.rotate(i)).updateMask(directions.eq(2 * i + 2)))
    }

    // "collapse" the stack into a single band image (due to masking, each pixel has just one value in it's directional band, and is otherwise masked)
    dir_mean = dir_mean.reduce(ee.Reducer.sum())
    dir_const = dir_var.reduce(ee.Reducer.sum())

    // A finally generate the filtered value
    const varX = dir_var.subtract(dir_mean.multiply(dir_mean).multiply(sigmaV)).divide(sigmaV.add(1.0))

    const b = varX.divide(dir_var)

    const result = dir_mean.add(b.multiply(img.subtract(dir_mean)))
    return result.arrayFlatten([['sum']])
}

module.exports = {createCollection}
