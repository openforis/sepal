const ee = require('#sepal/ee/ee')

var ENL = 4
var ONE_LOOK_NOISE_STD_DEV = 1
var NOISE_CV = ONE_LOOK_NOISE_STD_DEV / Math.sqrt(ENL)

function applySpatialSpeckleFilter({
    image,
    spatialSpeckleFilter,
    kernelSize,
    sigma,
    snicSize,
    snicCompactness,
    strongScatterers,
    strongScattererValues,
    bandNames
}) {
    const filter = {
        GAMMA_MAP: gammaMap,
        LEE: leeFilter,
        REFINED_LEE: refinedLee,
        LEE_SIGMA: leeSigma,
        SNIC: snic
    }[spatialSpeckleFilter]
    var retain = filter && strongScatterers === 'RETAIN'
        ? findStrongScatterers(image.select(bandNames), strongScattererValues)
        : ee.Image(0)
    var imagePixelsToFilter = image
        .select(bandNames)
        .updateMask(retain.not())
    var filtered = filter && filter(
        {image: imagePixelsToFilter, kernelSize, sigma, snicSize, snicCompactness, bandNames}
    ) || image.select(bandNames)
    var filteredWithRetained = filtered
        .updateMask(retain.not().and(filtered.gt(0)))
        .unmask(image.select(bandNames))
    return image.addBands(filteredWithRetained, null, true)
}

function findStrongScatterers(image, strongScattererValues) {
    var strongScattererThreshold = ee.Image(10).pow(ee.Image(strongScattererValues).divide(10))
        .rename(image.bandNames())
    var strongScatterer = image.gt(strongScattererThreshold)
    var kernelSize = 3
    var strongScattererCount = strongScatterer
        .reduceNeighborhood({
            reducer: ee.Reducer.sum().unweighted(),
            kernel: ee.Kernel.square((kernelSize / 2) * (10 / 2), 'meters'),
            skipMasked: false
        })
    var minStrongScattererCount = 7
    return strongScatterer
        .and(strongScattererCount.gt(minStrongScattererCount))
}

/**
 * Lopes A., Nezry, E., Touzi, R., and Laur, H., 1990.  "Maximum A Posteriori Speckle Filtering and First Order texture Models in SAR Images."
 * International  Geoscience  and  Remote  Sensing  Symposium (IGARSS).
 */
function gammaMap({image, kernelSize}) {
    var reduced = image
        .reduceNeighborhood({
            reducer: ee.Reducer.mean()
                .combine(ee.Reducer.stdDev(), null, true),
            kernel: ee.Kernel.square(toKernelRadiusMeters(kernelSize), 'meters'),
            skipMasked: false
        })
    var meanI = reduced.select('.*_mean')
    var stdDevI = reduced.select('.*_stdDev')
    var CI = stdDevI.divide(meanI)
    var CU = NOISE_CV
    var CR2 = ee.Image().expression( // Eq. 3
        '(CI**2 - CU**2) / (1 + CU**2)',
        {CI, CU}
    )
    var a = CR2.pow(-1)
    var rHat = ee.Image().expression( // Eq. 11
        '((a - L - 1) * meanI + sqrt(meanI**2 * (a - L - 1)**2 + 4 * a * L * I * meanI)) / (2 * a)',
        {a, L: ENL, meanI, I: image}
    ).rename(image.bandNames())
    var CImax = CU * Math.sqrt(2)
    return image
        .where(CI.gte(CU).and(CI.lte(CImax)), rHat)
        .where(CI.lt(CU), meanI)
}

/**
 * Lemoine et al.; https://code.earthengine.google.com/5d1ed0a0f0417f098fdfd2fa137c3d0c
 */
function refinedLee({image, bandNames}) {
  
    var result = ee.ImageCollection(bandNames.map(function(b) {
        var img = image.select([b])
    
        // img must be linear, i.e. not in dB!
        // Set up 3x3 kernels
        var weights3 = ee.List.repeat(ee.List.repeat(1, 3), 3)
        var kernel3 = ee.Kernel.fixed(3, 3, weights3, 1, 1, false)
  
        var mean3 = img.reduceNeighborhood(ee.Reducer.mean(), kernel3)
        var variance3 = img.reduceNeighborhood(ee.Reducer.variance(), kernel3)
  
        // Use a sample of the 3x3 windows inside a 7x7 windows to determine gradients and directions
        var sample_weights = ee.List([[0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0]])
  
        var sample_kernel = ee.Kernel.fixed(7, 7, sample_weights, 3, 3, false)
  
        // Calculate mean and variance for the sampled windows and store as 9 bands
        var sample_mean = mean3.neighborhoodToBands(sample_kernel)
        var sample_var = variance3.neighborhoodToBands(sample_kernel)
  
        // Determine the 4 gradients for the sampled windows
        var gradients = sample_mean.select(1).subtract(sample_mean.select(7)).abs()
        gradients = gradients.addBands(sample_mean.select(6).subtract(sample_mean.select(2)).abs())
        gradients = gradients.addBands(sample_mean.select(3).subtract(sample_mean.select(5)).abs())
        gradients = gradients.addBands(sample_mean.select(0).subtract(sample_mean.select(8)).abs())
  
        // And find the maximum gradient amongst gradient bands
        var max_gradient = gradients.reduce(ee.Reducer.max())
  
        // Create a mask for band pixels that are the maximum gradient
        var gradmask = gradients.eq(max_gradient)
  
        // duplicate gradmask bands: each gradient represents 2 directions
        gradmask = gradmask.addBands(gradmask)
  
        // Determine the 8 directions
        var directions = sample_mean.select(1).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(7))).multiply(1)
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
  
        //var pal = ['ffffff','ff0000','ffff00', '00ff00', '00ffff', '0000ff', 'ff00ff', '000000'];
        //Map.addLayer(directions.reduce(ee.Reducer.sum()), {min:1, max:8, palette: pal}, 'Directions', false);
  
        var sample_stats = sample_var.divide(sample_mean.multiply(sample_mean))
  
        // Calculate localNoiseVariance
        var sigmaV = sample_stats.toArray().arraySort().arraySlice(0, 0, 5).arrayReduce(ee.Reducer.mean(), [0])
  
        // Set up the 7*7 kernels for directional statistics
        var rect_weights = ee.List.repeat(ee.List.repeat(0, 7), 3).cat(ee.List.repeat(ee.List.repeat(1, 7), 4))
  
        var diag_weights = ee.List([[1, 0, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0, 0],
            [1, 1, 1, 1, 0, 0, 0], [1, 1, 1, 1, 1, 0, 0], [1, 1, 1, 1, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1]])
  
        var rect_kernel = ee.Kernel.fixed(7, 7, rect_weights, 3, 3, false)
        var diag_kernel = ee.Kernel.fixed(7, 7, diag_weights, 3, 3, false)
  
        // Create stacks for mean and variance using the original kernels. Mask with relevant direction.
        var dir_mean = img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel).updateMask(directions.eq(1))
        var dir_var = img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel).updateMask(directions.eq(1))
  
        dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel).updateMask(directions.eq(2)))
        dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel).updateMask(directions.eq(2)))
  
        // and add the bands for rotated kernels
        for (var i = 1; i < 4; i++) {
            dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel.rotate(i)).updateMask(directions.eq(2 * i + 1)))
            dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel.rotate(i)).updateMask(directions.eq(2 * i + 1)))
            dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel.rotate(i)).updateMask(directions.eq(2 * i + 2)))
            dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel.rotate(i)).updateMask(directions.eq(2 * i + 2)))
        }
  
        // "collapse" the stack into a single band image (due to masking, each pixel has just one value in it's directional band, and is otherwise masked)
        dir_mean = dir_mean.reduce(ee.Reducer.sum())
        dir_var = dir_var.reduce(ee.Reducer.sum())
  
        // A finally generate the filtered value
        var varX = dir_var.subtract(dir_mean.multiply(dir_mean).multiply(sigmaV)).divide(sigmaV.add(1.0))
  
        var c = varX.divide(dir_var)
  
        return dir_mean.add(c.multiply(img.subtract(dir_mean)))
            .arrayProject([0])
        // Get a multi-band image bands.
            .arrayFlatten([['sum']])
            .float()
    })).toBands().rename(bandNames).copyProperties(image)
    return image.addBands(result, null, true)
}

/**
 * J. S. Lee, “Digital image enhancement and noise filtering by use of local statistics.”
 * IEEE Pattern Anal. Machine Intell., vol. PAMI-2, pp. 165–168, Mar. 1980.
 */
var leeFilter = function({image, kernelSize}) {
    return applyMMSE(image, image, kernelSize, NOISE_CV)
}

/**
 * Lee, J.-S.; Wen, J.-H.; Ainsworth, T.L.; Chen, K.-S.; Chen, A.J. "Improved sigma filter for speckle filtering of SAR imagery".
 * IEEE Trans. Geosci. Remote Sens. 2009, 47, 202–213.
 */
function leeSigma({image, kernelSize, sigma}) {
    var aPrioriMean = calculateAPrioriMean(image)
    return filter(image, aPrioriMean)
  
    function calculateAPrioriMean(image) {
        var aPrioriKernelSize = 3
        var aPrioriStandarDeviation = NOISE_CV
        return applyMMSE(image, image, aPrioriKernelSize, aPrioriStandarDeviation)
    }
  
    function filter(image, aPrioriMean) {
        var lookup = {
            0.50: {lower: 0.694, upper: 1.385, standardDeviation: 0.1921},
            0.60: {lower: 0.630, upper: 1.495, standardDeviation: 0.2348},
            0.70: {lower: 0.560, upper: 1.627, standardDeviation: 0.2825},
            0.80: {lower: 0.480, upper: 1.804, standardDeviation: 0.3354},
            0.90: {lower: 0.378, upper: 2.094, standardDeviation: 0.3991},
            0.95: {lower: 0.302, upper: 2.360, standardDeviation: 0.4391}
        }[sigma]
        var lowerBound = aPrioriMean.multiply(lookup.lower)
        var upperBound = aPrioriMean.multiply(lookup.upper)
        var standardDeviation = lookup.standardDeviation
        var inBounds = image.gte(lowerBound).and(image.lt(upperBound))
        var masked = image.updateMask(inBounds)
        return applyMMSE(image, masked, kernelSize, standardDeviation)
    }
}

function snic({image, snicSize, snicCompactness, bandNames}) {
    const snic = ee.Algorithms.Image.Segmentation.SNIC({
        image: image.select(bandNames),
        compactness: snicCompactness,
        size: snicSize
    }).select('.*_mean').rename(bandNames)
    return image.addBands(snic, null, true)
}

function applyMMSE(image, toReduce, kernelSize, standardDeviation) {
    var reduced = toReduce
        .reduceNeighborhood({
            reducer: ee.Reducer.mean()
                .combine(ee.Reducer.variance(), null, true),
            kernel: ee.Kernel.square(toKernelRadiusMeters(kernelSize), 'meters'),
            skipMasked: false
        })
    var meanZ = reduced.select('.*_mean')
        .max(0)
    var varianceZ = reduced.select('.*_variance')
    var varianceX = ee.Image().expression(
        '(varianceZ - (meanZ**2)*(standardDeviation**2)) / (1 + standardDeviation**2)',
        {meanZ, varianceZ, standardDeviation}
    )
    var b = varianceX
        .divide(varianceZ)
        .max(0)
    return ee.Image()
        .expression(
            '(1 - b) * meanZ + b * z',
            {b, meanZ, z: image}
        )
        .rename(image.bandNames())
}

function toKernelRadiusMeters(kernelSize) {
    return 10 * kernelSize / 2
}

module.exports = {applySpatialSpeckleFilter}
