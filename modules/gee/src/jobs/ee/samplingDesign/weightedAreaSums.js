import ee from '#sepal/ee/ee'
import {stratificationProjection} from '#sepal/ee/samplingDesign/stratificationImage'

// Per-stratum sums of probability-weighted area and of area - the two halves toAreaWeightedProportions divides.
//
// DO NOT INLINE THIS BACK INTO probabilityPerStratum.js: that would put the reducer out of reach of every kind
// of verification. A `job()` export runs worker plumbing on import and calls process.exit, so neither a test nor
// a real-EE script can import the job to reach the graph, and a script that rebuilt the reducer for itself would
// assert only that its own copy works. A broken reducer would then reach users with every suite green - which is
// exactly how `sum().repeat(n).setOutputs(...)` shipped.
export const weightedAreaSums = ({eeGeometry, eeStratification, eeProbability, stratificationBand, probabilityBand, mode, targetClass, scale, crs, stratified}) => {
    const band = eeProbability.select(probabilityBand)
    const strata = eeStratification.select(stratificationBand)
    const probabilityImage = mode === 'CATEGORICAL'
        ? band.eq(targetClass)
        : band
    const pixelArea = ee.Image.pixelArea()
    // The group index is derived, not written: a reorder that left a literal behind would group on the wrong
    // band and return plausible, wrong numbers rather than failing.
    const summedBands = ['weighted', 'area']
    const bands = [...summedBands, 'stratum']
    return probabilityImage.multiply(pixelArea).rename(summedBands[0])
        .addBands(pixelArea.rename(summedBands[1]))
        .addBands(strata.rename('stratum'))
        .reduceRegion({
            // One named sum per summed band, combined with unshared inputs so the combined reducer takes one
            // input per band. `sum().repeat(n)` looks equivalent but is not: it yields a SINGLE output holding a
            // list of n, so naming both outputs is rejected when the reducer RUNS. Earth Engine accepts the
            // graph, so the rejection arrives as a failed task rather than a refused submission.
            reducer: summedBands
                .map(name => ee.Reducer.sum().setOutputs([name]))
                .reduce((reducer, reducer2) => reducer.combine({reducer2, sharedInputs: false}))
                .group(bands.indexOf('stratum'), 'stratum'),
            geometry: eeGeometry,
            // Proportions keeps its OWN Scale, applied through the shared Stratification projection rule. The
            // Scale is the coarser of the two grids, so the STRATA are the likelier match and are offered
            // first: resampling them would cut every stratum boundary the reduction groups by. The projection
            // carries the scale, so passing a scale alongside would define a second grid.
            crs: stratificationProjection(
                stratified ? [strata.projection(), band.projection()] : [band.projection()],
                {crs, scale}
            ),
            maxPixels: 1e13,
        })
}
