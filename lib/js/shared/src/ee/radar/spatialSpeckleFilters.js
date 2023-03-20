const ee = require('#sepal/ee')

/*
Version: v1.1
Date: 2021-03-11
Authors: Mullissa A., Vollrath A., Braun, C., Slagter B., Balling J., Gou Y., Gorelick N.,  Reiche J.
Description: This script contains functions for implementing both monotemporal and multi-temporal speckle filters */

//---------------------------------------------------------------------------//
// Lee filter
//---------------------------------------------------------------------------//
/** Lee Filter applied to one image. It is implemented as described in
 J. S. Lee, “Digital image enhancement and noise filtering by use of local statistics,”
 IEEE Pattern Anal. Machine Intell., vol. PAMI-2, pp. 165–168, Mar. 1980.*/
 
var leefilter = function(image, kernelSizePixels, bandNames) {
    var kernelRadiusMeters = toKernelRadiusMeters(kernelSizePixels)
    //S1-GRD images are multilooked 5 times in range
    var enl = 5
    // Compute the speckle standard deviation
    var eta = 1.0 / Math.sqrt(enl)
    eta = ee.Image.constant(eta)

    // MMSE estimator
    // Neighbourhood mean and variance
    var oneImg = ee.Image.constant(1)

    var reducers = ee.Reducer.mean().combine({
        reducer2: ee.Reducer.variance(),
        sharedInputs: true
    })
    var stats = image.select(bandNames).reduceNeighborhood({reducer: reducers, kernel: ee.Kernel.square(kernelRadiusMeters, 'meters'), optimization: 'window'})
    var meanBand = bandNames.map(function(bandName) {return ee.String(bandName).cat('_mean')})
    var varBand = bandNames.map(function(bandName) {return ee.String(bandName).cat('_variance')})
        
    var z_bar = stats.select(meanBand)
    var varz = stats.select(varBand)

    // Estimate weight
    var varx = (varz.subtract(z_bar.pow(2).multiply(eta.pow(2)))).divide(oneImg.add(eta.pow(2)))
    var b = varx.divide(varz)
  
    //if b is negative set it to zero
    var new_b = b.where(b.lt(0), 0)
    var output = oneImg.subtract(new_b).multiply(z_bar.abs()).add(new_b.multiply(image.select(bandNames)))
    output = output.rename(bandNames)
    return image.addBands(output, null, true)
}

//---------------------------------------------------------------------------//
// GAMMA MAP filter
//---------------------------------------------------------------------------//
/** Gamma Maximum a-posterior Filter applied to one image. It is implemented as described in
Lopes A., Nezry, E., Touzi, R., and Laur, H., 1990.  Maximum A Posteriori Speckle Filtering and First Order texture Models in SAR Images.
International  Geoscience  and  Remote  Sensing  Symposium (IGARSS).  */

var gammamap = function(image, kernelSizePixels, bandNames) {
    var kernelRadiusMeters = toKernelRadiusMeters(kernelSizePixels)
    var enl = 5
    //Neighbourhood stats
    var reducers = ee.Reducer.mean().combine({
        reducer2: ee.Reducer.stdDev(),
        sharedInputs: true
    })
    var stats = image.select(bandNames).reduceNeighborhood({reducer: reducers, kernel: ee.Kernel.square(kernelRadiusMeters, 'meters'), optimization: 'window'})
    var meanBand = bandNames.map(function(bandName) {return ee.String(bandName).cat('_mean')})
    var stdDevBand = bandNames.map(function(bandName) {return ee.String(bandName).cat('_stdDev')})
        
    var z = stats.select(meanBand)
    var sigz = stats.select(stdDevBand)
        
    // local observed coefficient of variation
    var ci = sigz.divide(z)
    // noise coefficient of variation (or noise sigma)
    var cu = 1.0 / Math.sqrt(enl)
    // threshold for the observed coefficient of variation
    var cmax = Math.sqrt(2.0) * cu
  
    cu = ee.Image.constant(cu)
    cmax = ee.Image.constant(cmax)
    var enlImg = ee.Image.constant(enl)
    var oneImg = ee.Image.constant(1)
    var twoImg = ee.Image.constant(2)
  
    var alpha = oneImg.add(cu.pow(2)).divide(ci.pow(2).subtract(cu.pow(2)))

    //Implements the Gamma MAP filter described in equation 11 in Lopez et al. 1990
    var q = image.select(bandNames).expression('z**2 * (z * alpha - enl - 1)**2 + 4 * alpha * enl * b() * z', {z, alpha, enl})
    var rHat = z.multiply(alpha.subtract(enlImg).subtract(oneImg)).add(q.sqrt()).divide(twoImg.multiply(alpha))
  
    //if ci <= cu then its a homogenous region ->> boxcar filter
    var zHat = (z.updateMask(ci.lte(cu))).rename(bandNames)
    //if cmax > ci > cu then its a textured medium ->> apply Gamma MAP filter
    rHat = (rHat.updateMask(ci.gt(cu)).updateMask(ci.lt(cmax))).rename(bandNames)
    //if ci>=cmax then its strong signal ->> retain
    var x = image.select(bandNames).updateMask(ci.gte(cmax)).rename(bandNames)
  
    // Merge
    var output = ee.ImageCollection([zHat, rHat, x]).sum()
    return image.addBands(output, null, true)
}

//---------------------------------------------------------------------------//
// Refined Lee filter
//---------------------------------------------------------------------------//
/** This filter is modified from the implementation by Guido Lemoine
 * Source: Lemoine et al.; https://code.earthengine.google.com/5d1ed0a0f0417f098fdfd2fa137c3d0c */

var refinedLee = function(image, bandNames) {
  
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
  
        var b = varX.divide(dir_var)
  
        return dir_mean.add(b.multiply(img.subtract(dir_mean)))
            .arrayProject([0])
        // Get a multi-band image bands.
            .arrayFlatten([['sum']])
            .float()
    })).toBands().rename(bandNames).copyProperties(image)
    return image.addBands(result, null, true)
}

// Lee, J.-S.; Wen, J.-H.; Ainsworth, T.L.; Chen, K.-S.; Chen, A.J. Improved sigma filter for speckle filtering of SAR imagery. IEEE Trans. Geosci. Remote Sens. 2009, 47, 202–213.
function leeSigma(args) {
    var image = args.image
    var kernelSize = args.kernelSize || 9
    var sigma = args.sigma || 0.9
  
    var aPrioriMean = calculateAPrioriMean(image)
    return filter(image, aPrioriMean)
  
    function calculateAPrioriMean(image) {
        var aPrioriKernelSize = 3
        var enl = 4
        var oneLookStandardDeviation = 0.5227 // The other implementation used 1 as oneLookStandardDeviation
        var aPrioriStandarDeviation = oneLookStandardDeviation / Math.sqrt(enl)
        return applyMMSE(image, aPrioriKernelSize, aPrioriStandarDeviation)
    }
  
    function filter(image, aPrioriMean) {
        var intensityLookup = { // Assuming ENL of 4
            0.50: {I1: 0.694, I2: 1.385, standardDeviation: 0.1921},
            0.60: {I1: 0.630, I2: 1.495, standardDeviation: 0.2348},
            0.70: {I1: 0.560, I2: 1.627, standardDeviation: 0.2825},
            0.80: {I1: 0.480, I2: 1.804, standardDeviation: 0.3354},
            0.90: {I1: 0.378, I2: 2.094, standardDeviation: 0.3991},
            0.95: {I1: 0.302, I2: 2.360, standardDeviation: 0.4391}
        }[sigma]
        var lowerBound = aPrioriMean.multiply(intensityLookup.I1)
        var upperBound = aPrioriMean.multiply(intensityLookup.I2)
        var standardDeviation = intensityLookup.standardDeviation
        var inBounds = image.gte(lowerBound).and(image.lt(upperBound)) // The other implementation used or() - sounds like a pure bug. Upper bounds was also inclusive
        var masked = image.updateMask(inBounds)
        return applyMMSE(masked, kernelSize, standardDeviation)
    }
  
    function applyMMSE(toReduce, kernelSize, standardDeviation) {
        var reduced = toReduce
            .reduceNeighborhood({
                reducer: ee.Reducer.mean()
                    .combine(ee.Reducer.variance(), null, true),
                kernel: ee.Kernel.square(toKernelRadiusMeters(kernelSize), 'meters'),
                skipMasked: false
            })
        var meanZ = reduced.select('.*_mean')
            .max(0) // Cannot be negative
        var varianceZ = reduced.select('.*_variance')
        var varianceX = ee.Image().expression(
            '(varianceZ - (meanZ**2)*(standardDeviation**2)) / (1 + standardDeviation**2)', {
                meanZ,
                varianceZ,
                standardDeviation
            })
        var b = varianceX
            .divide(varianceZ)
            .max(0)
        return ee.Image()
            .expression(
                '(1 - b) * meanZ + b * z', { // The other implementation used abs(meanZ)
                    b,
                    meanZ,
                    z: image
                })
            .rename(image.bandNames())
    }
}

function snic(image, kernelSize, snicCompactness, bandNames) {
    const snic = ee.Algorithms.Image.Segmentation.SNIC({
        image: image.select(bandNames),
        compactness: snicCompactness,
        size: kernelSize
    }).select('.*_mean').rename(bandNames)
    return image.addBands(snic, null, true)
}

function toKernelRadiusMeters(kernelSizePixels) {
    return 10 * kernelSizePixels / 2
}

module.exports = {
    leeFilter: function (image, args) { return leefilter(image, args.kernelSize, args.bandNames) },
    gammaMap: function (image, args) { return gammamap(image, args.kernelSize, args.bandNames) },
    refinedLee: function (image, args) { return refinedLee(image, args.bandNames) },
    leeSigma: function (image, args) { return leeSigma({image: image.select(args.bandNames), kernelSize: args.kernelSize, sigma: args.sigma, strongScattererValues: args.strongScattererValues}) },
    snic: function (image, args) { return snic(image, args.snicSize, args.snicCompactness, args.bandNames) }
}
