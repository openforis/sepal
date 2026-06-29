import ee from '#sepal/ee/ee'

import {toColor, toId} from './featureProperties.js'

// No-min-distance exact sampler: EE's stratifiedSample draws exactly the requested count per stratum
// when the area allows it.
export function stratifiedRandomSample(args) {
    var allocation = args.allocation
    var stratification = args.stratification.select([0], ['stratum'])
    var region = args.region
    var scale = ee.Number(args.scale)
    var crs = args.crs || 'EPSG:3410'
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

// Min-distance candidate points at a density factor (smaller = denser; 0 = spacing clamped to the
// configured minDistance, the densest the user constraint allows). No per-stratum limit; each feature
// carries a seeded 'random' column for deterministic thinning. minDistance is never violated.
export function randomSampleCandidates(args, densityFactor) {
    var allocation = args.allocation
    var stratification = args.stratification.select([0], ['stratum'])
    var region = args.region
    var minDistance = ee.Number(args.minDistance)
    var crs = args.crs || 'EPSG:3410'
    var crsTransform = args.crsTransform || undefined
    var seed = ee.Number(args.seed || 1)
    var projection = ee.Projection(crs, crsTransform)

    return ee.FeatureCollection(allocation.map(sampleStratum)).flatten()

    function sampleStratum(stratum) {
        // Area-based spacing guess for the retained hex-cell density, scaled by densityFactor and floored
        // at minDistance (the hard user constraint).
        var areaDistance = ee.Number(stratum.area)
            .divide(2 * Math.sqrt(3) * stratum.sampleSize)
            .sqrt()
            .multiply(0.75)
        var distance = areaDistance
            .multiply(densityFactor)
            .max(minDistance)
        var grid = hexGrid(
            randomOffset(
                projection.atScale(distance),
                seed
            )
        )
        var stratumMask = stratification.eq(stratum.stratum)
        var reduceScale = ee.Number(10).divide(distance)
            .max(1 / 16)
        return stratification
            .updateMask(
                stratumMask.and(createSamplesImage(grid, seed, stratumMask))
            )
            .reduceToVectors({
                reducer: ee.Reducer.countEvery(),
                geometry: region,
                labelProperty: 'stratum',
                crs: grid.projection().scale(reduceScale, reduceScale),
                geometryType: 'centroid',
                maxPixels: 1e13,
            })
            .select('stratum')
            .filterBounds(region)
            .map(function (sample) {
                return sample
                    .set('id', toId({sample}))
                    .set('color', stratum.color)
            })
            .randomColumn('random', seed)
            .select(['id', 'stratum', 'color', 'random'])
    }

    function hexGrid(proj) {
        var diameter = 1 // Use nominal scale of projection
        var size = ee.Number(diameter).divide(Math.sqrt(3)) // Distance from center to vertex

        var coords = ee.Image.pixelCoordinates(proj)
        var vals = {
        // Switch x and y here to get flat top instead of pointy top hexagons.
            x: coords.select('x'),
            u: coords.select('x').divide(diameter),  // term 1
            v: coords.select('y').divide(size),      // term 2
            r: ee.Number(diameter).divide(2),
        }
        var i = ee.Image().expression('floor((floor(u - v) + floor(x / r))/3)', vals)
        var j = ee.Image().expression('floor((floor(u + v) + floor(v - u))/3)', vals)

        var cells = i.long().leftShift(32).add(j.long()).rename('hexgrid')

        var mask = i.mod(2).and(j.mod(2)) // Introduces gap - reduces count by 4x
        return cells.updateMask(mask)
    }

    function createSamplesImage(cells, seed, mask) {
        var random = ee.Image.random(seed).multiply(1e6).int()
            .multiply(mask) // Make sure we pick points in the mask
        var maximum = cells.addBands(random).reduceConnectedComponents(ee.Reducer.max())
        return random.eq(maximum).selfMask().rename('sample')
    }

    // Translates a projection by a random amount between 0 and 1 in projection units.
    function randomOffset(projection, seed) {
        // Derive the y offset from a distinct deterministic seed; reusing `seed` for both makes x and y
        // identical (a purely diagonal offset) and undermines reproducible, well-spread offsets.
        var values = ee.FeatureCollection([ee.Feature(null, null)])
            .randomColumn('x', seed)
            .randomColumn('y', seed.add(1))
            .first()
        return projection.translate(values.get('x'), values.get('y'))
    }
}

// Thin candidates to the requested per-stratum sample size, deterministically by the seeded 'random'
// column. Strata with too few candidates pass through unchanged (the final guard catches shortfalls).
export function thinToAllocation(candidates, allocation) {
    return ee.FeatureCollection(allocation.map(function (stratum) {
        return candidates
            .filter(ee.Filter.eq('stratum', stratum.stratum))
            .limit(stratum.sampleSize, 'random')
            .select(['id', 'stratum', 'color'])
    })).flatten()
}
