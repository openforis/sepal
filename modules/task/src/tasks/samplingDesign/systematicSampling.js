import ee from '#sepal/ee/ee'

import {toColor, toId} from './featureProperties.js'

// Builds a nested systematic lattice. The base lattice is hexagonal/triangular (one point per cell), and
// each point is tagged with a nested "level"; filterSamples() then selects a level per stratum to get
// close to the requested count. Higher levels skip rows, so they remain systematic nested-lattice samples
// but are not strictly isotropic hexagonal - hence "lattice"/"base lattice" rather than "hex grid" in the
// user-facing wording and exported metadata (selectedLevel).
export function stratifiedSystematicSample(args) {
    var allocation = args.allocation
    var region = args.region
    var stratification = args.stratification.clip(region)
    var scale = ee.Number(args.scale)
    var minDistance = ee.Number(args.minDistance || scale.multiply(2))
        .max(scale.multiply(2)) // At least 2xscale as min distance
    var crs = args.crs || 'EPSG:3410'
    var crsTransform = args.crsTransform || undefined
    var projection = ee.Projection(crs, crsTransform)
    // Densify the base grid by lowering the exponent (smaller cells), clamped at minExponent so the
    // configured minimum distance is never violated. 0 = the area-based first guess.
    var densityOffset = args.densityOffset || 0
    // Grid origin: FIXED keeps the unshifted global grid (current behavior); SEEDED applies a
    // reproducible global phase shift within one cell, derived ONLY from the seed (and applied per cell
    // size below). Same seed + CRS + density => the same shifted grid everywhere; AOIs only clip it.
    var gridOrigin = args.gridOrigin || 'FIXED'
    var seed = ee.Number(args.seed || 0)
    var originFraction = gridOrigin === 'SEEDED'
        ? seedGridFraction(seed)
        : {x: ee.Number(0), y: ee.Number(0)}

    var samplesImage = createSamplesImage()
    return samplesImageToCollection(samplesImage)

    function samplesImageToCollection(samplesImage) {
        return samplesImage
            .reduceToVectors({
                reducer: ee.Reducer.first(),
                geometry: region,
                scale: scale,
                geometryType: 'centroid',
                labelProperty: 'sample',
                maxPixels: 1e13
            })
    }

    function createSamplesImage() {
        return ee.ImageCollection(allocation
            .map(function (stratum) {
                var targetDiameter = ee.Number(
                    // The `diameter` size parameter of createHexSamplesImage()'s lattice, chosen so the
                    // base grid yields one sample per cell of area stratum.area / sampleSize. In that
                    // lattice the nearest center-to-center spacing is sqrt(3) * diameter, so the area per
                    // point is (3*sqrt(3)/2) * diameter^2; setting that equal to area / sampleSize gives
                    // diameter = sqrt(2 * area / (3*sqrt(3) * sampleSize)), which the expression below
                    // equals. The 0.5 is part of that conversion to the internal diameter variable - it
                    // is NOT an intentional densification; the grid produces ~sampleSize points, and the
                    // nested levels / filterSamples thin to coarser subsets (denser grids come from the
                    // densityOffset).
                    0.5 * Math.sqrt(
                        8 * stratum.area / (3 * Math.sqrt(3) * stratum.sampleSize)
                    )
                )
                // minDistance is the minimum center-to-center spacing; nearest hex-cell centers are
                // ~sqrt(3) * diameter apart, so the smallest allowed internal diameter is
                // minDistance / sqrt(3). Derive minExponent from that diameter, not from minDistance.
                var minDiameter = minDistance.divide(Math.sqrt(3))
                var minExponent = minDiameter.log().divide(ee.Number(2).log()).ceil()
                var exponent = targetDiameter.log().divide(ee.Number(2).log()).floor()
                    .subtract(densityOffset)
                    .max(minExponent)
                var diameter = ee.Number(2).pow(exponent)
                var stratumMask = stratification.eq(stratum.stratum)
                var stratumSamplesImage = createHexSamplesImage({
                    diameter: diameter,
                    scale: scale,
                    proj: projection
                })

                return stratumSamplesImage
                    .addBands(stratification)
                    .updateMask(stratumMask)
            })
        ).mosaic()
    }

    // Builds the hexagonal/triangular BASE lattice (one point per cell) and tags each point with its
    // nested level; the name is kept to limit churn, but it is the base lattice, not the final samples.
    function createHexSamplesImage(args) {
        var diameter = args.diameter
        var scale = args.scale
        var proj = args.proj || ee.Projection('EPSG:3410')

        var nominalScale = proj.nominalScale()
        var distance = ee.Number(diameter).divide(nominalScale)
        var dx = distance.multiply(Math.sqrt(3))
        var dy = distance.multiply(1.5)

        // Seeded global phase shift, within one cell (zero for FIXED). The fraction is seed-only and the
        // absolute shift scales with this density's cell size, so the same seed/CRS/density yields the
        // same shifted lattice everywhere.
        var offsetX = originFraction.x.multiply(dx)
        var offsetY = originFraction.y.multiply(dy)
        var coords = ee.Image.pixelCoordinates(proj)
        var cx = coords.select('x').subtract(offsetX)
        var cy = coords.select('y').subtract(offsetY)
        var i = cx.divide(dx).floor().int32().rename('i')
        var j = cy.divide(dy).floor().int32().rename('j')

        var xOffset = j.mod(2).multiply(dx.divide(2))
        var xPos = cx.subtract(xOffset)
        var yPos = cy

        var xMinDistance = xPos.mod(dx).abs()
        var yMinDistance = yPos.mod(dy).abs()

        // 1.42 is sqrt(2) rounded a bit up.
        // It ensures that for worst case scenario, where the centroid falls exactly between 4 pixels.
        // we cover the majority of the pixels. This will potentially shift the centroid
        // slightly, but it's a relatively small shift.
        var minDistanceFromCentroid = ee.Number(1.42).multiply(ee.Number(scale)).divide(nominalScale)
        var sample = xMinDistance.lt(minDistanceFromCentroid)
            .and(yMinDistance.lt(minDistanceFromCentroid))
            .rename('sample')
        var level = ee.Image(ee.List.sequence(0, 4)
            .iterate(
                function (n, acc) {
                    n = ee.Number(n).byte()
                    var m = ee.Number(2).pow(n.subtract(1))
                    var included = include(i, j, m)
                    return ee.Image(acc)
                        .addBands(
                            included.multiply(n)
                                .add(
                                    j.mod(ee.Number(2).pow(n.add(1))).abs().eq(0)
                                        .multiply(0.5)
                                )
                        )
                },
                ee.Image([])
            )
        ).reduce(ee.Reducer.max()).rename('level')
        return sample
            .addBands(level)
            .updateMask(sample)
    }

    function include(i, j, n) {
        return mod(i, 2).and(mod(j, 4))
            .or(mod(i.subtract(n), 2).and(mod(j, 4).not()))
            .and(mod(j, 2))
            .or(n.eq(0))
            .byte()

        function mod(value, k) {
            return value.mod(n.multiply(k)).abs().eq(0)
        }
    }

    // Deterministic [0,1) cell fractions from the seed alone (a single null feature - no geometry, so no
    // dependence on AOI/stratum/task/date). x and y use distinct seeds to decorrelate the two axes.
    function seedGridFraction(seed) {
        var values = ee.FeatureCollection([ee.Feature(null, null)])
            .randomColumn('x', seed)
            .randomColumn('y', seed.add(1))
            .first()
        return {x: ee.Number(values.get('x')), y: ee.Number(values.get('y'))}
    }
}

export function filterSamples(args) {
    var region = args.region
    var samples = args.samples.filterBounds(region)
    var allocation = args.allocation
    var strategy = args.strategy || 'OVER'
    var seed = args.seed

    var allocationCollection = ee.FeatureCollection(allocation
        .map(function (stratum) {
            return ee.Feature(null, stratum)
        })
    )

    var counts = toFeatureCollection(
        samples
            .reduceColumns(
                ee.Reducer.count().group(1, 'level').group(2, 'stratum'),
                ['stratum', 'level', 'stratum'])
            .get('groups')
    )
    return ee.FeatureCollection(allocation
        .map(function (stratum) {
            var stratumGroup = counts
                .filter(ee.Filter.eq('stratum', stratum.stratum))
                .first()
            var stratumCounts = toFeatureCollection(
                ee.Algorithms.If(
                    stratumGroup,
                    stratumGroup.get('groups'),
                    []
                )
            )
            var diffs = stratumCounts
                .map(function (feature) {
                    var count = stratumCounts
                        .filter(ee.Filter.gte('level', feature.getNumber('level')))
                        .reduceColumns(ee.Reducer.sum(), ['count'])
                        .values().getNumber(0)
                    var diff = strategy === 'CLOSEST'
                        ? count.subtract(stratum.sampleSize).abs()
                        : count.subtract(stratum.sampleSize)
                    return feature.set('diff', diff)
                })
            var level = diffs
                .filter(ee.Filter.gte('diff', 0))
                .reduceColumns(
                    ee.Reducer.min(2).setOutputs(['diff', 'level']),
                    ['diff', 'level']
                )
                .getNumber('level')
            var filtered = samples
                .filter(ee.Filter.eq('stratum', stratum.stratum))
                .filter(ee.Filter.gte('level', level))

            return (strategy === 'EXACT'
                ? filtered
                    .randomColumn('random', seed)
                    .sort('random')
                    .limit(stratum.sampleSize)
                : filtered
            )
                .select(['id', 'stratum', 'color'])
                // The nested-lattice level actually used for this stratum. Higher levels skip rows
                // (denser->sparser), so half-levels are still systematic nested-lattice samples but not
                // strictly isotropic hexagonal. Exported per row so the thinning is auditable.
                .map(function (sample) {
                    return sample.set('selectedLevel', level)
                })
        })
    ).flatten().map(setProperties)

    function setProperties(sample) {
        return sample
            .set('id', toId({sample}))
            .set('color', toColor({sample, allocationCollection}))
            .set('level', null)
            .set('sample', null)
    }
}

function toFeatureCollection(dictList) {
    return ee.FeatureCollection(
        ee.List(dictList).map(function (dict) {
            return ee.Feature(null, dict)
        })
    )
}
