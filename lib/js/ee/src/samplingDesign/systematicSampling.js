import ee from '#sepal/ee/ee'

import {BASE_GRID_SLACK} from './systematicLatticeMath.js'

export {BASE_GRID_SLACK}

// ---- shared lattice building blocks (also used by the optimized unstratified index-candidate path) ----

// Deterministic global phase from the seed alone (a single null feature - no geometry, so no dependence on
// AOI/stratum/task/date). Four decorrelated draws (distinct sub-seeds): x,y are fractions in [0,1) of the
// fixed root lattice period; i,j are integer cell offsets uniform over the coarsest nested period (i: 16
// cells, j: 32 cells). Shared with the unstratified index path so both reuse the exact same phase.
export function seedOriginPhase(seed) {
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

// FIXED -> all-zero (unshifted) phase; SEEDED -> the seed-derived phase. Shared by the raster and the
// unstratified index path so both align on the same global lattice.
export function originPhaseOf(gridOrigin, seed) {
    return gridOrigin === 'SEEDED'
        ? seedOriginPhase(ee.Number(seed || 0))
        : {x: ee.Number(0), y: ee.Number(0), i: ee.Number(0), j: ee.Number(0)}
}

// Cell-coset predicate for nested-level computation.
export function include(i, j, n) {
    function mod(value, k) {
        return value.mod(n.multiply(k)).abs().eq(0)
    }
    return mod(i, 2).and(mod(j, 4))
        .or(mod(i.subtract(n), 2).and(mod(j, 4).not()))
        .and(mod(j, 2))
        .or(n.eq(0))
        .byte()
}

// Nested-level / half-level image band from seed-shifted cell indices.
export function levelBand(iLevel, jLevel) {
    return ee.Image(ee.List.sequence(0, 4)
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
}

// Candidate generation and final selection are self-contained so they can be pasted into the EE Code Editor.

// Returns a candidate FeatureCollection whose geometries are the exact lattice points, filtered to the AOI,
// carrying only stratum, i, j and level.
//
// Assumes projected, metre-based coordinates: the supported-CRS contract (the curated EASE-Grid 2.0 catalog) is
// enforced at the task boundary before the graph is built, so there is no CRS check here. Scale and crsTransform
// are mutually exclusive; a transform must be north-up, axis-aligned, square and non-zero.
function stratifiedSystematicExactCandidates(args) {
    var allocation = args.allocation
    var stratification = args.stratification
    var region = args.region
    var stratificationGrid = args.stratificationGrid
    var arrangementGrid = args.arrangementGrid
    var sampleArrangement = args.sampleArrangement
    var densityOffset = args.densityOffset || 0

    var SQRT3 = Math.sqrt(3)
    var BASE_GRID_SLACK = 0.75
    // Largest supported lattice diameter exponent; the geoseeded origin period is aligned to it, so any lattice
    // above this would lose phase uniformity and is rejected.
    var MAX_LATTICE_EXPONENT = 24

    if (!allocation || !allocation.length) {
        throw new Error('stratifiedSystematicExactCandidates requires a non-empty allocation')
    } else if (!stratification) {
        throw new Error('stratifiedSystematicExactCandidates requires a stratification image')
    } else if (!region) {
        throw new Error('stratifiedSystematicExactCandidates requires a region')
    } else if (!arrangementGrid || !arrangementGrid.crs) {
        throw new Error('stratifiedSystematicExactCandidates requires arrangementGrid.crs')
    } else if (!stratificationGrid || (!stratificationGrid.scale && !stratificationGrid.crsTransform)) {
        throw new Error('stratifiedSystematicExactCandidates requires stratificationGrid.scale or .crsTransform')
    } else if (stratificationGrid.scale && stratificationGrid.crsTransform) {
        throw new Error('stratifiedSystematicExactCandidates: stratificationGrid scale and crsTransform are mutually exclusive')
    } else if (!sampleArrangement) {
        throw new Error('stratifiedSystematicExactCandidates requires a sampleArrangement')
    }
    // minDistance 0 / unset is valid: latticeDiameter floors spacing at 2*pixelSize (the raster spacing floor).

    var transform = parseCrsTransform(stratificationGrid.crsTransform)
    if (stratificationGrid.crsTransform && !transform) {
        throw new Error('stratifiedSystematicExactCandidates: invalid crsTransform ' + JSON.stringify(stratificationGrid.crsTransform))
    }
    if (transform && !isAxisAlignedTransform(transform)) {
        throw new Error('stratifiedSystematicExactCandidates: only north-up, square crsTransforms are supported '
            + '(no rotation/skew: b=0,d=0; square pixels: |a|=|e|). Got ' + JSON.stringify(transform))
    }
    // The Stratification pixel size contributes ONE thing: the minimum-spacing floor. Class and mask
    // interpretation is already applied upstream, on the Stratification grid, by stratificationImage$.
    var pixelSize = transform ? Math.abs(transform[0]) : Number(stratificationGrid.scale)
    if (!(pixelSize > 0)) {
        throw new Error('stratifiedSystematicExactCandidates requires a positive Stratification pixel size')
    }

    // ORIGIN ANCHORING: nominalScale MUST come from the ARRANGEMENT projection. Taking it from the
    // Stratification projection would translate the seeded lattice whenever the Stratification CRS or pixel size
    // changed, breaking the globally anchored nested lattice family - a Stratification transform's origin must
    // never become the Arrangement origin.
    var projection = ee.Projection(arrangementGrid.crs)
    var nominalScale = projection.nominalScale()
    var origin = gridOrigin(sampleArrangement, nominalScale)
    var levels = ee.List(nestedLevelLookup())

    // Client lattice layout per stratum (dx/dy are ee.Numbers in ARRANGEMENT projection units); throws if any
    // lattice exceeds the aligned origin period. The root origin is reduced modulo each layout's LEVEL period
    // (16*dx, 32*dy): this keeps the SAME absolute lattice and the SAME nested level (i mod 16 / j mod 32 are
    // invariant, since the reduction shifts i/j by multiples of 16/32), while bounding local i/j to the AOI
    // extent rather than the full ~2^24 origin.
    var layouts = allocation.map(function (stratum, stratumIndex) {
        var diameter = latticeDiameter(stratum)
        var exponent = Math.round(Math.log(diameter) / Math.LN2)
        if (exponent > MAX_LATTICE_EXPONENT) {
            throw new Error('stratifiedSystematicExactCandidates: lattice exponent ' + exponent + ' (stratum '
                + stratum.stratum + ') exceeds MAX_LATTICE_EXPONENT ' + MAX_LATTICE_EXPONENT
                + '; the geoseeded origin period is not aligned to it.')
        }
        var distance = ee.Number(diameter).divide(nominalScale)
        var dx = distance.multiply(SQRT3)
        var dy = distance.multiply(1.5)
        return {
            stratumIndex: stratumIndex,
            stratum: stratum,
            diameter: diameter,
            dx: dx,
            dy: dy,
            originX: origin.x.mod(dx.multiply(16)),
            originY: origin.y.mod(dy.multiply(32))
        }
    })

    // The raster is ONE densest lattice; every stratum's lattice is a nested subset of it, reached by an integer
    // ratio and an integer phase shift. Rasterizing per stratum instead would multiply the vectorization cost by
    // the stratum count.
    var densest = layouts.reduce(function (selected, layout) {
        return layout.diameter < selected.diameter ? layout : selected
    }, layouts[0])
    var plan = layouts.map(function (layout) {
        var ratio = layout.diameter / densest.diameter
        if (!Number.isSafeInteger(ratio) || ratio < 1 || (ratio & (ratio - 1)) !== 0) {
            throw new Error('stratifiedSystematicExactCandidates: non-nested diameter ratio ' + ratio
                + ' (stratum ' + layout.stratum.stratum + ')')
        }
        return {
            layoutIndex: layout.stratumIndex,
            stratum: layout.stratum.stratum,
            ratio: ratio,
            dx: layout.dx,
            dy: layout.dy,
            originX: layout.originX,
            originY: layout.originY,
            phaseShiftI: layout.originX.subtract(densest.originX).divide(densest.dx).round().toInt(),
            phaseShiftJ: layout.originY.subtract(densest.originY).divide(densest.dy).round().toInt()
        }
    })

    var layoutLookup = ee.Dictionary.fromLists(
        plan.map(function (e) { return String(e.layoutIndex) }),
        plan.map(function (e) {
            return ee.Dictionary({
                stratum: e.stratum,
                dx: e.dx,
                dy: e.dy,
                originX: e.originX,
                originY: e.originY
            })
        })
    )

    // AOI BOUNDARY: no buffer, deliberately. Under the exact-centred shape the marker pixel's CENTRE is the exact
    // lattice point, so clipping reduceToVectors to `region` already yields exactly "exact lattice point inside
    // AOI". The old pixelSize*2 buffer covered a marker-to-point displacement that no longer exists.
    //
    // The edge convention is therefore centre-in-region, matching Random. A lattice point lying exactly on the
    // AOI edge is EXCLUDED: its cell straddles the study-area boundary, and the alternative - buffering so such
    // points survive vectorization for filterBounds to re-include - costs a Geometry.buffer over a complex
    // multipolygon plus the inflated vertex count that clip then runs against, on every export, to change a set
    // that is empty with probability 1 for an AOI at arbitrary coordinates.
    //
    // filterBounds below stays as the authoritative test: the clip reprojects `region` into each lattice
    // projection with its own tolerance, while filterBounds tests the reconstructed points in one frame.

    var candidates = ee.FeatureCollection([
        vectorizeParity(0),
        vectorizeParity(1)
    ]).flatten()

    return reconstruct(candidates)
        .filterBounds(region)
        .select(['stratum', 'i', 'j', 'level'])

    // One rectangular projection per row parity, with the affine defined so pixel CENTRES are exact lattice
    // points: odd rows are shifted half a column. Row spacing is 2*dy because each branch carries every other
    // hex row.
    function latticeTransform(parity) {
        return parity === 0
            ? [densest.dx, 0, densest.originX.subtract(densest.dx.divide(2)), 0,
                densest.dy.multiply(-2), densest.originY.add(densest.dy)]
            : [densest.dx, 0, densest.originX, 0,
                densest.dy.multiply(-2), densest.originY.add(densest.dy.multiply(2))]
    }

    function vectorizeParity(parity) {
        var branchTransform = latticeTransform(parity)
        var branchProjection = ee.Projection(arrangementGrid.crs, branchTransform)
        // floor().toInt(), never toInt() alone: toInt() truncates negative half-integer pixel-centre coordinates
        // toward zero and assigns the wrong signed index.
        var coordinates = ee.Image.pixelCoordinates(branchProjection)
        var denseI = coordinates.select('x').floor().toInt()
        var row = coordinates.select('y').floor().toInt()
        var denseJ = parity === 0 ? row.multiply(-2).toInt() : row.multiply(-2).add(1).toInt()

        var strata = plan.map(function (e) { return e.stratum })
        var layoutIndex = stratification.remap(strata, plan.map(function (e) { return e.layoutIndex }), -1).toInt()
        var ratio = layoutIndex.remap(plan.map(function (e) { return e.layoutIndex }), plan.map(function (e) { return e.ratio }), 1).toInt()
        var shiftI = layoutIndex.remap(plan.map(function (e) { return e.layoutIndex }), plan.map(function (e) { return e.phaseShiftI }), 0).toInt()
        var shiftJ = layoutIndex.remap(plan.map(function (e) { return e.layoutIndex }), plan.map(function (e) { return e.phaseShiftJ }), 0).toInt()

        var jNumerator = denseJ.subtract(shiftJ)
        var classJ = jNumerator.divide(ratio).toInt()
        var denseParity = denseJ.mod(2).add(2).mod(2)
        var classParity = classJ.mod(2).add(2).mod(2)
        var correction = ratio.multiply(classParity).subtract(denseParity).divide(2).toInt()
        var iNumerator = denseI.subtract(shiftI).subtract(correction)
        var classI = iNumerator.divide(ratio).toInt()
        var member = jNumerator.mod(ratio).eq(0).and(iNumerator.mod(ratio).eq(0))

        // The validity mask rides on the masked single band from stratificationImage$, so remap already yields a
        // masked pixel wherever the source is masked; no explicit mask term is needed.
        var accepted = layoutIndex.gte(0).and(member)
        var residue = classJ.mod(32).add(32).mod(32).multiply(16).add(classI.mod(16).add(16).mod(16))
        var label = layoutIndex.multiply(512).add(residue).add(1).toInt().rename('label')

        // Carry i/j as reducer properties and leave temporary centroids in WGS84; native custom-WKT centroids
        // exceed Earth Engine's aggregation-result limit at full scale.
        return label
            .addBands(classI.rename('i'))
            .addBands(classJ.rename('j'))
            .updateMask(accepted)
            .reduceToVectors({
                geometry: region,
                crs: arrangementGrid.crs,
                crsTransform: branchTransform,
                geometryType: 'centroid',
                eightConnected: false,
                labelProperty: 'label',
                reducer: ee.Reducer.first().forEach(['i', 'j']),
                maxPixels: 1e13,
                bestEffort: false
            })
    }

    // Materialize the exact geometry from the carried signed i/j; the temporary WGS84 centroid is never
    // inspected and is neither identity nor membership evidence.
    function reconstruct(collection) {
        return collection.map(function (feature) {
            var compact = ee.Number(feature.get('label')).subtract(1)
            var layoutIndex = compact.divide(512).floor().toInt()
            var residue = compact.mod(512).toInt()
            var layout = ee.Dictionary(layoutLookup.get(layoutIndex.format('%d')))
            var dx = ee.Number(layout.get('dx'))
            var dy = ee.Number(layout.get('dy'))
            var i = ee.Number(feature.get('i')).toInt()
            var j = ee.Number(feature.get('j')).toInt()
            var parity = j.mod(2).add(2).mod(2)
            var x = ee.Number(layout.get('originX')).add(i.multiply(dx)).add(parity.multiply(dx.divide(2)))
            var y = ee.Number(layout.get('originY')).add(j.multiply(dy))
            return feature
                .setGeometry(ee.Geometry.Point([x, y], projection))
                .set({stratum: layout.get('stratum'), i: i, j: j, level: ee.Number(levels.get(residue))})
        })
    }

    // Area-tuned base diameter (metres, power of two), one density offset finer, floored at the min-distance
    // grid. The floor is 2 * the STRATIFICATION pixel size.
    function latticeDiameter(stratum) {
        var targetDiameter = Math.sqrt(stratum.area / stratum.sampleSize / (1.5 * SQRT3)) * BASE_GRID_SLACK
        var minDistance = Math.max(Number(sampleArrangement.minDistance) || 0, pixelSize * 2)
        var minDiameter = minDistance / SQRT3
        var targetExponent = Math.floor(Math.log(targetDiameter) / Math.LN2) - densityOffset
        var minExponent = Math.ceil(Math.log(minDiameter) / Math.LN2)
        return Math.pow(2, Math.max(targetExponent, minExponent))
    }

    // Seed-only global geometric origin, drawn uniformly over one period-aligned lattice period (in ARRANGEMENT
    // projection units via nominalScale). FIXED => (0,0). periodY = 2*dy at the max exponent.
    function gridOrigin(sampleArrangement, nominalScale) {
        if ((sampleArrangement.gridOrigin || 'FIXED') !== 'SEEDED') {
            return {x: ee.Number(0), y: ee.Number(0)}
        }
        var seed = ee.Number(sampleArrangement.seed || 0)
        var values = ee.FeatureCollection([ee.Feature(null, null)])
            .randomColumn('x', seed.add(2))
            .randomColumn('y', seed.add(3))
            .first()
        var periodX = ee.Number(SQRT3 * Math.pow(2, MAX_LATTICE_EXPONENT)).divide(nominalScale)
        var periodY = ee.Number(3 * Math.pow(2, MAX_LATTICE_EXPONENT)).divide(nominalScale)
        return {
            x: ee.Number(values.get('x')).multiply(periodX),
            y: ee.Number(values.get('y')).multiply(periodY)
        }
    }

    // 512-entry nested-level table (i mod 16, j mod 32), built once. Exact values of the nested-level contract,
    // half-levels included.
    function nestedLevelLookup() {
        var table = []
        for (var j = 0; j < 32; j++) {
            for (var i = 0; i < 16; i++) {
                table.push(nestedLevelValue(i, j))
            }
        }
        return table
    }

    function nestedLevelValue(i, j) {
        var level = -1
        for (var n = 0; n <= 4; n++) {
            var m = Math.pow(2, n - 1)
            var included = includeNestedCellValue(i, j, m)
            var halfLevel = Math.abs(j % Math.pow(2, n + 1)) === 0 ? 0.5 : 0
            level = Math.max(level, (included ? n : 0) + halfLevel)
        }
        return level
    }

    function includeNestedCellValue(i, j, n) {
        function divisible(value, k) {
            return Math.abs(value % (n * k)) === 0
        }
        return ((divisible(i, 2) && divisible(j, 4))
            || (divisible(i - n, 2) && !divisible(j, 4)))
            && divisible(j, 2)
    }

    function parseCrsTransform(crsTransform) {
        var parts = Array.isArray(crsTransform)
            ? crsTransform.map(Number)
            : typeof crsTransform === 'string' && crsTransform.trim()
                ? crsTransform.replace(/[[\]]/g, '').split(',').map(function (part) { return Number(part.trim()) })
                : []
        return parts.length === 6 && parts.every(function (value) { return isFinite(value) }) ? parts : null
    }

    function isAxisAlignedTransform(transform) {
        return Array.isArray(transform) && transform.length === 6
            && transform[1] === 0 && transform[3] === 0
            && transform[0] > 0 && transform[4] < 0 && transform[0] === -transform[4]
    }
}

// Final systematic sample selection from persisted, indexed candidate properties. Returns exact-geometry samples
// with only id, stratum, selectedLevel. Production ALWAYS supplies levelsByStratum (from the completed candidate
// count/repair stage): the supplied-level branch builds no level-selection graph, only persisted filters plus
// optional EXACT thinning. The fallback (levelsByStratum omitted) computes levels itself for standalone Code
// Editor use and yields the same rows.
function stratifiedSystematicFinalSamples(args) {
    var candidates = args.candidates
    var allocation = args.allocation
    var strategy = args.strategy || 'OVER'
    var seed = args.seed
    var levelsByStratum = args.levelsByStratum

    // Plain client-side branch: production never constructs the fallback level-selection graph.
    var levels = levelsByStratum
        ? allocation.map(function (stratum) {
            return {stratum: stratum, level: ee.Number(levelsByStratum[String(stratum.stratum)])}
        })
        : computedLevels()

    return ee.FeatureCollection(levels.map(function (entry) {
        var stratum = entry.stratum
        var level = entry.level
        var rows = candidates
            .filter(ee.Filter.eq('stratum', stratum.stratum))
            .filter(ee.Filter.gte('level', level))
            .map(function (feature) { return feature.set('selectedLevel', level) })
        return strategy === 'EXACT'
            ? rows.randomColumn('random', seed, 'uniform', ['i', 'j']).sort('random').limit(stratum.sampleSize)
            : rows
    })).flatten()
        .map(function (feature) {
            // Repair-independent stable identity: stratum:i:j is unique per absolute lattice cell. An id derived
            // from an allocation-LOCAL index would collide, because a repair export receives only the repaired
            // subset and its local indices restart at 0.
            return feature
                .set('id', ee.String(feature.getNumber('stratum').format('%d'))
                    .cat(':').cat(feature.getNumber('i').format('%d'))
                    .cat(':').cat(feature.getNumber('j').format('%d')))
                .select(['id', 'stratum', 'selectedLevel'])
        })

    // Fallback only: select the systematic level per stratum from the persisted level counts.
    function computedLevels() {
        var selected = selectSystematicLevels(candidates, allocation, strategy)
        return allocation.map(function (stratum) {
            var feature = ee.Feature(selected.filter(ee.Filter.eq('stratum', stratum.stratum)).first())
            return {stratum: stratum, level: feature.getNumber('previewLevel')}
        })
    }

    function selectSystematicLevels(samples, allocation, strategy) {
        var counts = systematicLevelCounts(samples)
        return ee.FeatureCollection(allocation.map(function (stratum) {
            var stratumGroup = counts.filter(ee.Filter.eq('stratum', stratum.stratum)).first()
            var stratumCounts = toFeatureCollection(ee.Algorithms.If(stratumGroup, ee.Feature(stratumGroup).get('groups'), []))
            var diffs = stratumCounts.map(function (feature) {
                var level = feature.getNumber('level')
                var count = stratumCounts.filter(ee.Filter.gte('level', level))
                    .reduceColumns(ee.Reducer.sum(), ['count']).values().getNumber(0)
                var diff = strategy === 'CLOSEST'
                    ? ee.Number(count).subtract(stratum.sampleSize).abs()
                    : ee.Number(count).subtract(stratum.sampleSize)
                return feature.set('cumulativeCount', count).set('diff', diff)
            })
            var best = diffs.filter(ee.Filter.gte('diff', 0))
                .reduceColumns(ee.Reducer.min(3).setOutputs(['diff', 'level', 'cumulativeCount']), ['diff', 'level', 'cumulativeCount'])
            var actualCount = ee.Number(ee.Algorithms.If(best.get('cumulativeCount'), best.get('cumulativeCount'), 0))
            return ee.Feature(null, {
                stratum: stratum.stratum,
                previewLevel: ee.Number(ee.Algorithms.If(actualCount, best.get('level'), -1))
            })
        }))
    }

    function systematicLevelCounts(samples) {
        return toFeatureCollection(
            samples.reduceColumns(ee.Reducer.count().group(1, 'level').group(2, 'stratum'), ['stratum', 'level', 'stratum']).get('groups')
        )
    }

    function toFeatureCollection(dictList) {
        return ee.FeatureCollection(ee.List(dictList).map(function (dict) {
            return ee.Feature(null, dict)
        }))
    }
}

export {stratifiedSystematicExactCandidates, stratifiedSystematicFinalSamples}

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

// Selects, per allocation row, the nested level to keep (samples with level >= selectedLevel) using the
// same semantics as the final filter, scoring from a grouped level-count table (`counts`, from
// systematicLevelCounts on a FeatureCollection). Returns
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

function toFeatureCollection(dictList) {
    return ee.FeatureCollection(
        ee.List(dictList).map(function (dict) {
            return ee.Feature(null, dict)
        })
    )
}
