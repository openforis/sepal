import ee from '#sepal/ee/ee'

import {toColor, toId} from './featureProperties.js'

// Root period for the seeded lattice phase. The lattice diameters are powers of two in meters; choosing a
// root exponent above any realistic Earth-scale spacing lets every generated diameter divide the root
// period, so seeded phases are compatible across densities without an arbitrary projection-unit range.
const ROOT_DIAMETER_EXPONENT = 32

// Slack applied to the area-only target diameter before exponent quantization. The pure area estimate is
// optimistic - it only holds for ideal compact strata, whereas real AOIs/strata are clipped, fragmented,
// rasterized and phase-dependent, so densityOffset=0 would routinely under-produce and force denser
// offset retries. Shrinking the target diameter by this factor makes the base grid intentionally somewhat
// denser: ~1 / 0.75^2 ~= 1.78x candidates, a controlled bump (vs. ~4x if we simply started at
// densityOffset=1). densityOffset=0 therefore means the slack-adjusted base density, not the area-only grid.
export const BASE_GRID_SLACK = 0.75

// Builds a nested systematic lattice as an ee.Image with bands `sample` (1 at each cell centroid),
// `level` (the max nested level the point survives at) and `stratum`. The base lattice is
// hexagonal/triangular (one point per cell); filterSamples() then selects a level per stratum to get
// close to the requested count. Higher levels skip rows, so they remain systematic nested-lattice samples
// but are not strictly isotropic hexagonal - hence "lattice"/"base lattice" rather than "hex grid" in the
// user-facing wording and exported metadata (selectedLevel). This is the shared basis for both the
// vectorized export path (stratifiedSystematicSample) and the raster preview (systematicPreviewImage).
export function stratifiedSystematicSampleImage(args) {
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
    // configured minimum distance is never violated. 0 = the slack-adjusted base grid (see
    // BASE_GRID_SLACK), i.e. the area estimate made deliberately a bit denser - not the pure area-only grid.
    var densityOffset = args.densityOffset || 0
    // Grid origin: FIXED keeps the unshifted global lattice (current behavior); SEEDED defines ONE global
    // lattice origin from the seed and clips it to the AOI. The phase has two parts:
    //   - x,y: seed-derived fractions of a fixed, Earth-scale root lattice period. Each density reduces
    //          that root phase modulo its own spacing - see createHexSamplesImage. Because the same root
    //          phase is reused for every density, compatible power-of-two spacings stay phase compatible
    //          (a fraction-of-current-cell offset would NOT - it moves the origin per density).
    //   - i,j: integer cell-coset offset over the coarsest nested period (i: 16 cells, j: 32 cells),
    //          which shifts WHICH nested level / half-level coset is selected.
    // All seed-only: derived from the seed alone, never from the AOI/selected level/task/date/cell size.
    // FIXED uses an all-zero phase, so its locations are unchanged. NOTE: an exact shared subset across
    // runs still requires compatible selected density/level/strategy - this only guarantees a common
    // global origin, not that any two runs pick the same nested coset.
    var gridOrigin = args.gridOrigin || 'FIXED'
    var seed = ee.Number(args.seed || 0)
    var originPhase = gridOrigin === 'SEEDED'
        ? seedOriginPhase(seed)
        : {x: ee.Number(0), y: ee.Number(0), i: ee.Number(0), j: ee.Number(0)}

    return createSamplesImage()

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
                    // Slack: shrink the diameter so the base grid (densityOffset=0) is intentionally a bit
                    // denser than the optimistic area-only estimate. See BASE_GRID_SLACK.
                ).multiply(BASE_GRID_SLACK)
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

        // Seeded continuous phase: draw once inside a fixed root lattice period, then reduce that root
        // phase modulo this density's spacing (zero for FIXED). The root period is expressed in the same
        // projection grid units as dx/dy, and all supported power-of-two spacings divide it.
        var rootDistance = ee.Number(2).pow(ROOT_DIAMETER_EXPONENT).divide(nominalScale)
        var rootDx = rootDistance.multiply(Math.sqrt(3))
        var rootDy = rootDistance.multiply(1.5)
        var offsetX = originPhase.x.multiply(rootDx).mod(dx)
        var offsetY = originPhase.y.multiply(rootDy).mod(dy)
        var coords = ee.Image.pixelCoordinates(proj)
        var cx = coords.select('x').subtract(offsetX)
        var cy = coords.select('y').subtract(offsetY)
        var i = cx.divide(dx).floor().int32().rename('i')
        var j = cy.divide(dy).floor().int32().rename('j')

        // Cell-coset indices for the nested level computation: the centroid mask below uses the true
        // i/j (so cell centers are identified correctly), while the level/coset is computed from the
        // seed-shifted indices. This globally translates the selected nested coset (and half-level
        // row-skipping phase) by whole cells - zero for FIXED, so the level pattern is unchanged there.
        var iLevel = i.add(originPhase.i)
        var jLevel = j.add(originPhase.j)

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
                    var included = include(iLevel, jLevel, m)
                    return ee.Image(acc)
                        .addBands(
                            included.multiply(n)
                                .add(
                                    jLevel.mod(ee.Number(2).pow(n.add(1))).abs().eq(0)
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

    // Deterministic global phase from the seed alone (a single null feature - no geometry, so no
    // dependence on AOI/stratum/task/date). Four decorrelated draws (distinct sub-seeds):
    //   - x,y: fractions in [0, 1) of the fixed root lattice period. The root period is converted to the
    //          active projection grid units where used, then reduced modulo the current spacing.
    //   - i,j: integer cell offset uniform over the coarsest nested period - i over 16 cells, j over 32
    //          cells (all per-level moduli divide these), so every selectable level/half-level coset is
    //          shifted uniformly. floor(fraction * period) yields a uniform integer in [0, period).
    function seedOriginPhase(seed) {
        var values = ee.FeatureCollection([ee.Feature(null, null)])
            .randomColumn('x', seed)
            .randomColumn('y', seed.add(1))
            .randomColumn('i', seed.add(2))
            .randomColumn('j', seed.add(3))
            .first()
        return {
            x: ee.Number(values.get('x')),
            y: ee.Number(values.get('y')),
            i: ee.Number(values.get('i')).multiply(16).floor(),
            j: ee.Number(values.get('j')).multiply(32).floor()
        }
    }
}

// Default preview dot enlargement (pixels). Purely visual - single lattice centroids are otherwise
// invisible at typical map zoom. Never affects exported geometry or counts.
const DEFAULT_PREVIEW_DOT_RADIUS = 3

// Export path: vectorize the sample image to centroid features (properties stratum/level/sample).
export function stratifiedSystematicSample(args) {
    return stratifiedSystematicSampleImage(args)
        .reduceToVectors({
            reducer: ee.Reducer.first(),
            geometry: args.region,
            scale: ee.Number(args.scale),
            geometryType: 'centroid',
            labelProperty: 'sample',
            maxPixels: 1e13
        })
}

// The [sample, stratum] image masked to only the finalized systematic samples: per stratum, sample pixels
// at level >= its selected level (the same nested level filterSamples() keeps). Shared by both preview
// renderers - the raster dot mask and the selected-pixel FeatureCollection.
//
// `selectedLevels` is a plain CLIENT-SIDE {stratumValue: level} map, carried out of the density selection
// (systematicSelectionSummary, getInfo'd once) - so the mask thresholds on constants and never re-runs
// selectSystematicLevels. A level < 0 (or missing) means no qualifying level -> that stratum contributes
// nothing. With no qualifying stratum, returns a fully-masked (empty) 2-band image so downstream getMap /
// reduceToVectors still have bands to work with.
function selectedSampleImage(sampleImage, selectedLevels, allocation) {
    var stratumBand = sampleImage.select('stratum')
    var levelBand = sampleImage.select('level')
    var samples = sampleImage.select(['sample', 'stratum'])
    var perStratum = allocation
        .filter(function (stratum) {
            var level = selectedLevels[String(stratum.stratum)]
            return level != null && level >= 0
        })
        .map(function (stratum) {
            var level = selectedLevels[String(stratum.stratum)]
            return samples.updateMask(
                stratumBand.eq(stratum.stratum).and(levelBand.gte(level))
            )
        })
    return perStratum.length
        ? ee.ImageCollection(perStratum).mosaic()
        : samples.updateMask(ee.Image(0))
}

// Raster preview of the finalized systematic samples - a single-band dot mask, NO reduceToVectors. Enlarges
// the selected sample pixels for visibility. Single color (applied via visParams palette by the caller).
// EXACT's random thinning is NOT applied (raster can't thin to an exact count), so an EXACT raster preview
// shows the level-selected set, a superset of the export.
export function systematicPreviewImage(args) {
    var dotRadius = args.dotRadius || DEFAULT_PREVIEW_DOT_RADIUS
    return selectedSampleImage(args.sampleImage, args.selectedLevels, args.allocation)
        .select('sample')
        .focal_max({radius: dotRadius, kernelType: 'circle', units: 'pixels'})
        .rename('samples')
        .selfMask()
}

// FeatureCollection preview of the finalized systematic samples: vectorizes ONLY the selected sample pixels
// (selectedSampleImage), not the full unfiltered candidate grid - the mask cuts the pixel count to roughly
// the requested sample size before reduceToVectors. Vectorizes over region.bounds() (the mask already
// restricts to the AOI, so the cheap rectangle avoids per-tile complex-geometry processing) with a raised
// tileScale for memory resilience. For EXACT, applies the same seeded per-stratum thinning as
// filterSamples/export after vectorizing, so the preview matches the export point set.
export function systematicPreviewFeatures(args) {
    var sampleImage = args.sampleImage
    var selectedLevels = args.selectedLevels
    var allocation = args.allocation
    var region = args.region
    var scale = ee.Number(args.scale)
    var strategy = args.strategy || 'OVER'
    var seed = args.seed

    var features = selectedSampleImage(sampleImage, selectedLevels, allocation)
        .reduceToVectors({
            reducer: ee.Reducer.first(),
            geometry: region.bounds(),
            scale: scale,
            geometryType: 'centroid',
            labelProperty: 'sample',
            maxPixels: 1e13,
            tileScale: 4
        })
    if (strategy !== 'EXACT') {
        return features
    }
    // Same seeded, id-keyed thinning as the export filter, so preview points match the exported points.
    return ee.FeatureCollection(allocation
        .map(function (stratum) {
            return thinToSampleSize(
                features.filter(ee.Filter.eq('stratum', stratum.stratum)),
                stratum.sampleSize,
                seed
            )
        })
    ).flatten()
}

// Grouped sample counts by stratum and nested level: a FeatureCollection with one feature per stratum,
// each carrying a `groups` list of {level, count}. This tiny table (a handful of levels per stratum) is
// the shared basis for level selection - far cheaper than materializing the filtered point collection.
export function systematicLevelCounts(samples) {
    return toFeatureCollection(
        samples
            .reduceColumns(
                ee.Reducer.count().group(1, 'level').group(2, 'stratum'),
                ['stratum', 'level', 'stratum'])
            .get('groups')
    )
}

// Grouped sample counts by stratum and nested level computed DIRECTLY from the sample image via
// reduceRegion - no reduceToVectors. Same {stratum, groups:[{level, count}]} shape as
// systematicLevelCounts, so it feeds selectSystematicLevels identically. This is what lets systematic
// density selection (and thus preview) avoid vectorizing.
export function systematicLevelCountsImage(sampleImage, region, scale) {
    var groups = ee.Dictionary(
        sampleImage
            .select(['sample', 'level', 'stratum'])
            .reduceRegion({
                reducer: ee.Reducer.count().group(1, 'level').group(2, 'stratum'),
                geometry: region,
                scale: ee.Number(scale),
                maxPixels: 1e13
            })
    ).get('groups')
    return toFeatureCollection(groups)
}

// Selects, per allocation row, the nested level to keep (samples with level >= selectedLevel) using the
// same semantics as the final filter, scoring from a grouped level-count table (`counts`, from either
// systematicLevelCounts on a FeatureCollection or systematicLevelCountsImage on the sample image). Returns
// a FeatureCollection of {stratum, requested, selectedLevel, actualCount, rawCount, previewLevel, diff}:
//   - CLOSEST: level minimizing abs(cumulativeCount - requested).
//   - OVER/EXACT: level with the smallest non-negative (cumulativeCount - requested).
// A stratum with no qualifying level (missing, or OVER can't reach requested) gets actualCount 0 and a
// null selectedLevel - consistent with the final guard treating a missing stratum as zero.
export function selectSystematicLevels(args) {
    var allocation = args.allocation
    var strategy = args.strategy || 'OVER'
    var counts = args.counts ||
        systematicLevelCounts(args.region ? args.samples.filterBounds(args.region) : args.samples)
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
            // Each sample point falls in exactly one level bucket (its max level), so the sum over all
            // levels is the raw candidate count (level-0 cumulative) - what EXACT tests for sufficiency.
            var rawSum = stratumCounts.reduceColumns(ee.Reducer.sum(), ['count']).values().getNumber(0)
            var rawCount = ee.Number(ee.Algorithms.If(rawSum, rawSum, 0))
            // Cumulative count of samples with level >= this one (raising the level skips rows).
            var diffs = stratumCounts
                .map(function (feature) {
                    var count = stratumCounts
                        .filter(ee.Filter.gte('level', feature.getNumber('level')))
                        .reduceColumns(ee.Reducer.sum(), ['count'])
                        .values().getNumber(0)
                    var diff = strategy === 'CLOSEST'
                        ? count.subtract(stratum.sampleSize).abs()
                        : count.subtract(stratum.sampleSize)
                    return feature.set('cumulativeCount', count).set('diff', diff)
                })
            var best = diffs
                .filter(ee.Filter.gte('diff', 0))
                .reduceColumns(
                    ee.Reducer.min(3).setOutputs(['diff', 'level', 'cumulativeCount']),
                    ['diff', 'level', 'cumulativeCount']
                )
            var actualCount = ee.Number(
                ee.Algorithms.If(best.get('cumulativeCount'), best.get('cumulativeCount'), 0)
            )
            return ee.Feature(null, {
                stratum: stratum.stratum,
                requested: stratum.sampleSize,
                selectedLevel: best.getNumber('level'),
                actualCount: actualCount,
                rawCount: rawCount,
                // Non-null mirror of selectedLevel for the raster preview: -1 when no level qualifies
                // (actualCount 0). Keyed on actualCount rather than truthiness of the level so a valid
                // level 0 (the base grid) is preserved rather than mistaken for "no level".
                previewLevel: ee.Number(ee.Algorithms.If(actualCount, best.get('level'), -1)),
                diff: best.getNumber('diff')
            })
        })
    )
}

// Parallel per-stratum lists [strata, rawCounts, actualCounts, previewLevels] from a
// selectSystematicLevels() result. getInfo'd ONCE per density during selection: rawCount drives EXACT
// sufficiency, actualCount drives OVER/CLOSEST scoring, previewLevel is carried to the raster mask - so
// nothing is recomputed for the winning density and the render never re-selects levels.
export function systematicSelectionSummary(selected) {
    return ee.List([
        selected.aggregate_array('stratum'),
        selected.aggregate_array('rawCount'),
        selected.aggregate_array('actualCount'),
        selected.aggregate_array('previewLevel')
    ])
}

// Seeded thinning to an exact per-stratum count, shared by the export filter and the EXACT preview. Uses a
// stable geometry-derived id (toId) as the randomColumn row key, NOT the default system index: export
// vectorizes the full candidate grid then filters, while preview vectorizes only the selected mask, so the
// same physical point gets different system indices in the two paths. Keying the random on the geometry id
// makes the same seed pick the same points, so the EXACT preview matches the export.
function thinToSampleSize(features, sampleSize, seed) {
    return features
        .map(function (sample) {
            return sample.set('id', toId({sample: sample}))
        })
        .randomColumn('random', seed, 'uniform', ['id'])
        .sort('random')
        .limit(sampleSize)
}

export function filterSamples(args) {
    var region = args.region
    var allocation = args.allocation
    var strategy = args.strategy || 'OVER'
    var seed = args.seed
    var samples = args.samples.filterBounds(region)

    var allocationCollection = ee.FeatureCollection(allocation
        .map(function (stratum) {
            return ee.Feature(null, stratum)
        })
    )

    // Shared level selection (same grouped-count basis used for density scoring), then filter/thin once.
    var selectedLevels = selectSystematicLevels({samples: samples, allocation: allocation, strategy: strategy})

    return ee.FeatureCollection(allocation
        .map(function (stratum) {
            var level = ee.Feature(
                selectedLevels
                    .filter(ee.Filter.eq('stratum', stratum.stratum))
                    .first()
            ).getNumber('selectedLevel')
            var filtered = samples
                .filter(ee.Filter.eq('stratum', stratum.stratum))
                .filter(ee.Filter.gte('level', level))

            return (strategy === 'EXACT'
                ? thinToSampleSize(filtered, stratum.sampleSize, seed)
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
