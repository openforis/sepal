import ee from '#sepal/ee/ee'

import {toColor, toId} from './featureProperties.js'

// The random sampler: EE's stratifiedSample draws exactly the requested count per stratum when the area
// allows it. Random sampling has no minimum-distance constraint - that is a Systematic-only setting.
export function stratifiedRandomSample(args) {
    var allocation = args.allocation
    var stratification = args.stratification.select([0], ['stratum'])
    var region = args.region
    var scale = ee.Number(args.scale)
    var crs = args.crs
    var crsTransform = args.crsTransform || undefined
    var seed = ee.Number(args.seed || 1)
    var projection = crs
        ? ee.Projection(crs, crsTransform)
        : null

    var classValues = allocation.map(function (allocation) {
        return allocation.stratum
    })
    var classPoints = allocation.map(function (allocation) {
        return allocation.sampleSize
    })
    var allocationCollection = ee.FeatureCollection(allocation
        .map(function (stratum) {
            return ee.Feature(null, stratum)
        })
    )
    return stratification
        .select([0], ['stratum'])
        .int()
        .stratifiedSample({
            numPoints: 0,
            classBand: 'stratum',
            region: region,
            scale: scale,
            projection: projection,
            seed: seed,
            classValues: classValues,
            classPoints: classPoints,
            geometries: true
        })
        .map(function (sample) {
            return sample
                .select(['stratum'])
                .set('id', toId({sample}))
                .set('color', toColor({sample, allocationCollection}))
        })
}
