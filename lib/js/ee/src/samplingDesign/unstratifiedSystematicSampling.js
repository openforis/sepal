import ee from '#sepal/ee/ee'

import {parseCrsTransform, SQRT3, unstratifiedLatticeDiameter} from './systematicLatticeMath.js'
import {levelBand, originPhaseOf} from './systematicSampling.js'

// Unstratified systematic candidates are enumerated at lattice-cell scale and
// materialized to exact point geometry only after level selection.

// Analytical unstratified spacing is constrained by minDistance, not by raster scale.
const unstratifiedLayout = ({allocation, sampleArrangement, densityOffset = 0}) => {
    const stratum = allocation[0]
    const diameter = unstratifiedLatticeDiameter({
        area: stratum.area,
        sampleSize: stratum.sampleSize,
        minDistance: sampleArrangement.minDistance,
        densityOffset
    })
    const proj = ee.Projection(sampleArrangement.crs, parseCrsTransform(sampleArrangement.crsTransform) || undefined)
    const distance = ee.Number(diameter).divide(proj.nominalScale())
    const dx = distance.multiply(SQRT3)
    const dy = distance.multiply(1.5)
    const phase = originPhaseOf(sampleArrangement.gridOrigin || 'FIXED', ee.Number(sampleArrangement.seed || 0))
    return {stratum, proj, dx, dy, phase, diameter}
}

// Padding captures cells whose exact point is inside the AOI while their coarse centroid is outside.
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

// Index candidates carry i/j/level; their centroid geometry is replaced after selection.
export const unstratifiedSystematicIndexCandidates = ({allocation, region, sampleArrangement, densityOffset = 0}) => {
    const {stratum, proj, dx, dy, phase} = unstratifiedLayout({allocation, sampleArrangement, densityOffset})
    const coords = ee.Image.pixelCoordinates(proj)
    const i = coords.select('x').divide(dx).floor().int32().rename('i')
    const j = coords.select('y').divide(dy).floor().int32().rename('j')
    const level = levelBand(i.add(phase.i), j.add(phase.j))
    // reduceToVectors needs a numeric connected-component label.
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
                idkey: fi.format('%d').cat(':').cat(fj.format('%d'))
            })
        })
}

// Replace centroid geometry with the exact projected lattice point.
export const materializeSystematicIndexGeometry = ({candidates, allocation, region, sampleArrangement, densityOffset = 0}) => {
    const {proj, dx, dy} = unstratifiedLayout({allocation, sampleArrangement, densityOffset})
    const halfDx = dx.divide(2)
    return candidates
        .map(feature => {
            const fi = ee.Number(feature.get('i'))
            const fj = ee.Number(feature.get('j'))
            const parity = fj.mod(2).add(2).mod(2)
            const x = fi.multiply(dx).add(parity.multiply(halfDx))
            const y = fj.multiply(dy)
            return feature.setGeometry(ee.Geometry.Point([x, y], proj))
        })
        .filterBounds(region)
}
