const ee = require('#sepal/ee')

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
    const sample_var = variance3.neighborhoodToBands(sample_kernel)

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
    let dir_var = img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel).updateMask(directions.eq(1))

    dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel).updateMask(directions.eq(2)))
    dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel).updateMask(directions.eq(2)))

    // and add the bands for rotated kernels
    for (let i = 1; i < 4; i++) {
        dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel.rotate(i)).updateMask(directions.eq(2 * i + 1)))
        dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel.rotate(i)).updateMask(directions.eq(2 * i + 1)))
        dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel.rotate(i)).updateMask(directions.eq(2 * i + 2)))
        dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel.rotate(i)).updateMask(directions.eq(2 * i + 2)))
    }

    // "collapse" the stack into a single band image (due to masking, each pixel has just one value in it's directional band, and is otherwise masked)
    dir_mean = dir_mean.reduce(ee.Reducer.sum())
    dir_var = dir_var.reduce(ee.Reducer.sum())

    // A finally generate the filtered value
    const varX = dir_var.subtract(dir_mean.multiply(dir_mean).multiply(sigmaV)).divide(sigmaV.add(1.0))

    const b = varX.divide(dir_var)

    const result = dir_mean.add(b.multiply(img.subtract(dir_mean)))
    return result.arrayFlatten([['sum']])
}

module.exports = {refinedLee}
