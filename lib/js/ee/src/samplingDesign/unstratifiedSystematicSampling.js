import ee from '#sepal/ee/ee'

import {ROOT_DIAMETER_EXPONENT, SQRT3, unstratifiedLatticeDiameter} from './systematicLatticeMath.js'
import {levelBand, originPhaseOf} from './systematicSampling.js'

// Optimized candidate generator for UNSTRATIFIED systematic Sampling Design. The stratified/raster path
// (stratifiedSystematicSampleImage -> reduceToVectors @ export scale) scans a fine raster over the whole AOI
// and is unusable for near-global AOIs (candidate .size() timed out ~300s). Instead we drive the same raster
// machinery at LATTICE-CELL scale as an index enumerator, carry i/j/level as properties, and defer the exact
// point geometry to the level-selected set.
// Production task export routes unstratified systematic designs here. ALGORITHM_VERSION is bumped in
// sampleProperties.js because this emits exact analytic lattice points (not raster-snapped centroids), and
// EXACT thinning uses an index-derived idkey instead of a geometry-derived key.

// Shared EE lattice layout for the unstratified design (single stratum): diameter from the CLIENT-side area
// (already injected at the export boundary), then dx/dy/offset in the sampling projection. It uses the SAME
// projection, root phase, origin phase and nested-level math as stratifiedSystematicSampleImage, so fixed and
// seeded origins are globally anchored the same way. Spacing matches the stratified raster path only when both
// paths resolve to the same exponent; analytical unstratified spacing is constrained ONLY by minDistance.
// `scale` deliberately does NOT enter - it must not limit an analytical grid.
const unstratifiedLayout = ({allocation, sampleArrangement, densityOffset = 0}) => {
    const stratum = allocation[0]
    const diameter = unstratifiedLatticeDiameter({
        area: stratum.area,
        sampleSize: stratum.sampleSize,
        minDistance: sampleArrangement.minDistance,
        densityOffset
    })
    const proj = ee.Projection(sampleArrangement.crs || 'EPSG:3410', sampleArrangement.crsTransform || undefined)
    const nominalScale = proj.nominalScale()
    const distance = ee.Number(diameter).divide(nominalScale)
    const dx = distance.multiply(SQRT3)
    const dy = distance.multiply(1.5)
    const phase = originPhaseOf(sampleArrangement.gridOrigin || 'FIXED', ee.Number(sampleArrangement.seed || 0))
    const rootDistance = ee.Number(2).pow(ROOT_DIAMETER_EXPONENT).divide(nominalScale)
    const offsetX = phase.x.multiply(rootDistance.multiply(SQRT3)).mod(dx)
    const offsetY = phase.y.multiply(rootDistance.multiply(1.5)).mod(dy)
    return {stratum, proj, dx, dy, offsetX, offsetY, phase, diameter}
}

// Projected enumeration rectangle = region bounds (in the sampling projection) padded by 2*max(dx,dy). The
// pad captures boundary cells whose row-offset exact point falls inside the AOI even though the coarse cell
// centroid does not. NOT an AOI-local origin: only the enumeration extent depends on the AOI, never the phase.
const paddedEnumerationRect = ({region, proj, dx, dy}) => {
    const ring = ee.List(region.bounds(1, proj).coordinates().get(0))
    const xs = ring.map(point => ee.List(point).getNumber(0))
    const ys = ring.map(point => ee.List(point).getNumber(1))
    const pad = dx.max(dy).multiply(2)
    return ee.Geometry.Rectangle(
        [
            ee.Number(xs.reduce(ee.Reducer.min())).subtract(pad),
            ee.Number(ys.reduce(ee.Reducer.min())).subtract(pad),
            ee.Number(xs.reduce(ee.Reducer.max())).add(pad),
            ee.Number(ys.reduce(ee.Reducer.max())).add(pad)
        ],
        proj, false, true
    )
}

// Cheap index/cell candidates: one feature per lattice cell over the padded rectangle, WITHOUT exact geometry
// (keeps counting/selection cheap). Properties: stratum, sample=1, i, j, level, idkey. Uses raster machinery
// at CELL scale (never the fine export scale). The feature geometry is the coarse cell centroid and is
// intended to be replaced by materializeSystematicIndexGeometry after selection/thinning.
export const unstratifiedSystematicIndexCandidates = ({allocation, region, sampleArrangement, densityOffset = 0}) => {
    const {stratum, proj, dx, dy, offsetX, offsetY, phase} = unstratifiedLayout({allocation, sampleArrangement, densityOffset})
    const coords = ee.Image.pixelCoordinates(proj)
    const i = coords.select('x').subtract(offsetX).divide(dx).floor().int32().rename('i')
    const j = coords.select('y').subtract(offsetY).divide(dy).floor().int32().rename('j')
    const level = levelBand(i.add(phase.i), j.add(phase.j))
    // Collision-free int64 cell label (see latticeCellLabel): pack i into the high 32 bits and j into the low
    // 32 (i*2^32 + j). A bijection over int32 indices, so distinct cells never share a label regardless of
    // sign or magnitude - a fixed additive offset would only be conditionally safe. Same encoding
    // randomSampling.js uses for its hex grid.
    const label = i.long().leftShift(32).add(j.long()).rename('label')
    const cellScale = dx.min(dy).divide(2)
    return label.addBands(i).addBands(j).addBands(level)
        .reduceToVectors({
            reducer: ee.Reducer.first(),
            geometry: paddedEnumerationRect({region, proj, dx, dy}),
            scale: cellScale,
            geometryType: 'centroid',
            labelProperty: 'label',
            maxPixels: 1e13,
            tileScale: 4
        })
        .map(feature => {
            const fi = ee.Number(feature.get('i'))
            const fj = ee.Number(feature.get('j'))
            return feature.set({
                stratum: ee.Number(stratum.stratum),
                sample: 1,
                // Stable, sign-safe, AOI-independent key (mirrors latticeIdKey `${i}:${j}`), usable as a
                // randomColumn key for EXACT thinning before exact geometry exists.
                idkey: fi.format('%d').cat(':').cat(fj.format('%d'))
            })
        })
}

// Materialize EXACT projected point geometry from stored i, j after level selection (and before or after
// thinning, depending on the caller). Sign-safe row parity mirrors exactLatticePoint. Filters to the AOI and
// preserves stratum/level/idkey.
export const materializeSystematicIndexGeometry = ({candidates, allocation, region, sampleArrangement, densityOffset = 0}) => {
    const {proj, dx, dy, offsetX, offsetY} = unstratifiedLayout({allocation, sampleArrangement, densityOffset})
    const halfDx = dx.divide(2)
    return candidates
        .map(feature => {
            const fi = ee.Number(feature.get('i'))
            const fj = ee.Number(feature.get('j'))
            const parity = fj.mod(2).add(2).mod(2)
            const x = offsetX.add(fi.multiply(dx)).add(parity.multiply(halfDx))
            const y = offsetY.add(fj.multiply(dy))
            return feature.setGeometry(ee.Geometry.Point([x, y], proj))
        })
        .filterBounds(region)
}
