import ee from '#sepal/ee/ee'

import {
    googleProjectId,
    serviceAccountCredentials
} from '#gee/config'
import {resolveSamplingGridCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {
    levelBand,
    selectSystematicLevels,
    systematicSelectionSummary
} from '#sepal/ee/samplingDesign/systematicSampling'
import {nestedLevel} from '#sepal/ee/samplingDesign/systematicLatticeMath'

import {
    bufferOccupancyTile,
    occupancyEnvelopeAtScale,
    SOURCE_GRID_BUFFER_RADIUS
} from './occupancy-envelope.mjs'

const ARRANGEMENT_CRS_ID = 'EPSG:6933'
const ARRANGEMENT_CRS = resolveSamplingGridCrs(ARRANGEMENT_CRS_ID)
const STRATIFICATION_CRS_ID = 'EPSG:32636'
const STRATIFICATION_SCALE = 10
const SOURCE_ASSET = 'projects/fifth-bonbon-272108/assets/sudan-dynamic-world-2024'
const SOURCE_BAND = 'label'
const AOI_ASSET = 'users/wiell/SepalResources/gaul'
const AOI_KEY_COLUMN = 'id'
const AOI_KEY = 6
const AOI_AREA_SQUARE_METRES = 1843058575134.7393
const SQRT3 = Math.sqrt(3)
const BASE_GRID_SLACK = 0.75
const MAX_LATTICE_EXPONENT = 24
const SENTINEL = -9999
const ASSET_ROOT = 'projects/daniel-wiell/assets'
const TASK_POLL_INTERVAL_MS = 60000
const MAX_TASK_RUNTIME_MS = 45 * 60 * 1000
const MAX_BATCH_EECU_SECONDS = 30000
const VISIBILITY_DELAYS_MS = [0, 500, 1000, 2000, 4000]
const DELETE_VISIBILITY_TIMEOUT_MS = 120000
const GEOMETRY_TOLERANCE = 0.001
const OCCUPANCY_FILTER_TOLERANCE_METRES = 1
const MAX_GEOMETRY_DISPLACEMENT_METRES = 0.5
const OCCUPANCY_TILE_SIZE_METRES = 10000
const NESTED_LEVELS = Array.from({length: 32}, (_unused, j) =>
    Array.from({length: 16}, (_unusedAgain, i) => nestedLevel(i, j))
).flat()
const REQUIRED_PROPERTIES = [
    'key', 'stratum', 'layoutGroupId', 'densityOffset', 'i', 'j', 'level',
    'dx', 'dy', 'originX', 'originY', 'arrangementX', 'arrangementY'
]

const fixture = {
    strategy: 'CLOSEST',
    gridOrigin: 'SEEDED',
    seed: 2,
    minDistance: 20,
    allocation: [
        {stratum: 0, area: 5465664655.29412, weight: 0.0029655406170175018, sampleSize: 2857},
        {stratum: 1, area: 73237008483.52942, weight: 0.03973667193730796, sampleSize: 9697},
        {stratum: 2, area: 1963761640.7843134, weight: 0.0010654907088465406, sampleSize: 1702},
        {stratum: 3, area: 1044592860.7843137, weight: 0.0005667714271313435, sampleSize: 1237},
        {stratum: 4, area: 263708404850.58826, weight: 0.14308195525238118, sampleSize: 19840},
        {stratum: 5, area: 248695078157.25507, weight: 0.13493607859994014, sampleSize: 19034},
        {stratum: 6, area: 3832430202.745098, weight: 0.0020793861579335438, sampleSize: 2394},
        {stratum: 7, area: 1245111270211.3682, weight: 0.6755679825584484, sampleSize: 43221},
        {stratum: 8, area: 226218.82352941178, weight: 1.227409934234768e-7, sampleSize: 18}
    ],
    closestCounts: {0: 1995, 1: 6680, 2: 1416, 3: 1526, 4: 24202, 5: 22840, 6: 2860, 7: 57263, 8: 24},
    closestLevels: {0: 1, 1: 1, 2: 1.5, 3: 1, 4: 1, 5: 1, 6: 0.5, 7: 0.5, 8: 1}
}

const OCCUPANCY_BANDS = fixture.allocation.map(({stratum}) => `has_${stratum}`)

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})

const evaluate = value => new Promise((resolve, reject) => {
    value.evaluate((result, error) => error ? reject(error) : resolve(result))
})

const readCredentialsFromStdin = async () => {
    let buffer = ''
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true)
    }
    try {
        for await (const chunk of process.stdin) {
            buffer += chunk
            const newline = buffer.indexOf('\n')
            if (newline >= 0) {
                process.stdin.pause()
                return JSON.parse(buffer.slice(0, newline))
            }
        }
        return JSON.parse(buffer)
    } finally {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false)
        }
    }
}

const authenticate = async ({linkedUser}) => {
    let projectId = googleProjectId
    if (linkedUser) {
        const credentials = await readCredentialsFromStdin()
        if (!credentials.access_token || !credentials.project_id) {
            throw new Error('Linked-user access token or project id is missing')
        }
        if (Number(credentials.access_token_expiry_date) <= Date.now()) {
            throw new Error('Linked-user access token is expired')
        }
        projectId = credentials.project_id
        ee.data.clearAuthToken()
        ee.data.setAuthTokenRefresher(null)
        ee.data.setAuthToken(null, 'Bearer', credentials.access_token, null, null, null, false)
    } else {
        await new Promise((resolve, reject) =>
            ee.data.authenticateViaPrivateKey(serviceAccountCredentials, resolve, reject)
        )
    }
    await new Promise((resolve, reject) =>
        ee.initialize(null, null, resolve, reject, null, projectId)
    )
    ee.setMaxRetries(0)
}

const layoutValues = ({area, sampleSize}) => {
    const targetDiameter = Math.sqrt(area / sampleSize / (1.5 * SQRT3)) * BASE_GRID_SLACK
    const targetExponent = Math.floor(Math.log(targetDiameter) / Math.LN2)
    const minimumDiameter = Math.max(fixture.minDistance, STRATIFICATION_SCALE * 2) / SQRT3
    const minimumExponent = Math.ceil(Math.log(minimumDiameter) / Math.LN2)
    const exponent = Math.max(targetExponent, minimumExponent)
    const diameter = Math.pow(2, exponent)
    return {
        targetDiameter,
        exponent,
        diameter,
        dxMetres: diameter * SQRT3,
        dyMetres: diameter * 1.5
    }
}

const buildScenario = () => {
    const projection = ee.Projection(ARRANGEMENT_CRS)
    const sourceProjection = ee.Projection(STRATIFICATION_CRS_ID).atScale(STRATIFICATION_SCALE)
    const nominalScale = projection.nominalScale()
    const seed = ee.Number(fixture.seed)
    const randomOrigin = ee.FeatureCollection([ee.Feature(null, null)])
        .randomColumn('x', seed.add(2))
        .randomColumn('y', seed.add(3))
        .first()
    const rootOrigin = {
        x: ee.Number(randomOrigin.get('x'))
            .multiply(ee.Number(SQRT3 * Math.pow(2, MAX_LATTICE_EXPONENT)).divide(nominalScale)),
        y: ee.Number(randomOrigin.get('y'))
            .multiply(ee.Number(3 * Math.pow(2, MAX_LATTICE_EXPONENT)).divide(nominalScale))
    }
    const region = ee.FeatureCollection(AOI_ASSET)
        .filter(ee.Filter.eq(AOI_KEY_COLUMN, AOI_KEY))
        .geometry(ee.ErrorMargin(OCCUPANCY_FILTER_TOLERANCE_METRES, 'meters'))
    const layouts = fixture.allocation.map(stratum => {
        const values = layoutValues(stratum)
        const distance = ee.Number(values.diameter).divide(nominalScale)
        const dx = distance.multiply(SQRT3)
        const dy = distance.multiply(1.5)
        return {
            ...stratum,
            ...values,
            projection,
            dx,
            dy,
            originX: rootOrigin.x.mod(dx.multiply(16)),
            originY: rootOrigin.y.mod(dy.multiply(32))
        }
    })
    return {projection, sourceProjection, nominalScale, rootOrigin, region, layouts}
}

const layoutGroups = scenario => {
    const groups = new Map()
    scenario.layouts.forEach(layout => {
        const effectivePhase = `${fixture.gridOrigin}:${fixture.seed}`
        const groupingKey = [
            layout.diameter,
            layout.dxMetres,
            layout.dyMetres,
            0,
            effectivePhase,
            ARRANGEMENT_CRS_ID
        ].join('|')
        const group = groups.get(groupingKey) || {
            ...layout,
            layoutGroupId: `diameter-${layout.diameter}`,
            densityOffset: 0,
            strata: [],
            allocations: []
        }
        group.strata.push(layout.stratum)
        group.allocations.push({stratum: layout.stratum, sampleSize: layout.sampleSize, area: layout.area})
        groups.set(groupingKey, group)
    })
    return [...groups.values()]
}

const exactPoint = ({i, j, dx, dy, originX, originY, projection}) => {
    const eeI = ee.Number(i)
    const eeJ = ee.Number(j)
    const parity = eeJ.mod(2).add(2).mod(2)
    const x = ee.Number(originX).add(eeI.multiply(dx)).add(parity.multiply(ee.Number(dx).divide(2)))
    const y = ee.Number(originY).add(eeJ.multiply(dy))
    return {x, y, geometry: ee.Geometry.Point([x, y], projection)}
}

const membershipImage = scenario => {
    const source = ee.Image(SOURCE_ASSET).select(SOURCE_BAND)
    return source.unmask(SENTINEL).rename('observedClass')
        .addBands(source.mask().unmask(0).gt(0).toInt().rename('observedMask'))
        .setDefaultProjection(scenario.sourceProjection)
}

const occupancyTileGeometry = ({scenario, tileI, tileJ}) => {
    const tileSize = ee.Number(OCCUPANCY_TILE_SIZE_METRES).divide(scenario.nominalScale)
    const minX = ee.Number(tileI).multiply(tileSize)
    const minY = ee.Number(tileJ).multiply(tileSize)
    return ee.Geometry.Rectangle([
        minX,
        minY,
        minX.add(tileSize),
        minY.add(tileSize)
    ], scenario.projection, false, true)
}

const occupancyTiles = (scenario, {filterToAoi = true} = {}) => {
    const tileSize = ee.Number(OCCUPANCY_TILE_SIZE_METRES).divide(scenario.nominalScale)
    const coordinates = ee.Image.pixelCoordinates(scenario.projection)
    const tileI = coordinates.select('x').divide(tileSize).floor().int32().rename('tileI')
    const tileJ = coordinates.select('y').divide(tileSize).floor().int32().rename('tileJ')
    const label = tileI.long().leftShift(32).add(tileJ.long()).rename('label')
    const enumerationRegion = scenario.region.bounds(1, scenario.projection).buffer(
        OCCUPANCY_TILE_SIZE_METRES * 2,
        ee.ErrorMargin(1, 'projected'),
        scenario.projection
    )
    const filterRegion = scenario.region
        .transform(
            scenario.projection,
            ee.ErrorMargin(OCCUPANCY_FILTER_TOLERANCE_METRES, 'projected')
        )
        .buffer(
            OCCUPANCY_FILTER_TOLERANCE_METRES,
            ee.ErrorMargin(OCCUPANCY_FILTER_TOLERANCE_METRES, 'projected'),
            scenario.projection
        )
    const tiles = label.addBands(tileI).addBands(tileJ).reduceToVectors({
        reducer: ee.Reducer.first(),
        geometry: enumerationRegion,
        crs: ARRANGEMENT_CRS,
        scale: OCCUPANCY_TILE_SIZE_METRES / 2,
        geometryType: 'centroid',
        labelProperty: 'label',
        maxPixels: 1e13,
        tileScale: 4,
        bestEffort: false
    }).map(feature => {
        const i = feature.getNumber('tileI').toInt()
        const j = feature.getNumber('tileJ').toInt()
        return feature.setGeometry(occupancyTileGeometry({scenario, tileI: i, tileJ: j})).set({
            tileKey: i.format('%d').cat(':').cat(j.format('%d')),
            tileI: i,
            tileJ: j,
            tileSizeMetres: OCCUPANCY_TILE_SIZE_METRES
        })
    })
    return filterToAoi
        ? tiles.filter(ee.Filter.bounds(
            filterRegion,
            ee.ErrorMargin(OCCUPANCY_FILTER_TOLERANCE_METRES, 'meters')
        ))
        : tiles
}

const occupancyPresenceImage = scenario => {
    const source = ee.Image(SOURCE_ASSET).select(SOURCE_BAND)
    return source.rename('occupancyClass').setDefaultProjection(scenario.sourceProjection)
}

const bufferedOccupancyTiles = (scenario, tiles) => tiles.map(feature => feature.setGeometry(
    bufferOccupancyTile({
        ee,
        geometry: feature.geometry(),
        sourceProjection: scenario.sourceProjection
    })
))

const occupancyHistogramTable = (scenario, tiles) => occupancyPresenceImage(scenario).reduceRegions({
    collection: tiles,
    reducer: ee.Reducer.frequencyHistogram().unweighted(),
    crs: scenario.sourceProjection,
    tileScale: 4,
    maxPixelsPerRegion: 2000000
}).map(feature => {
    const tileI = feature.getNumber('tileI').toInt()
    const tileJ = feature.getNumber('tileJ').toInt()
    const histogram = ee.Dictionary(ee.Algorithms.If(
        feature.get('histogram'),
        feature.get('histogram'),
        ee.Dictionary({})
    ))
    const presence = Object.fromEntries(fixture.allocation.map(({stratum}) => [
        `has_${stratum}`,
        ee.Number(histogram.get(String(stratum), 0)).gt(0).toInt()
    ]))
    return feature.setGeometry(occupancyTileGeometry({scenario, tileI, tileJ})).set({
        tileI,
        tileJ,
        ...presence
    })
})

const occupancyTable = (scenario, tiles = occupancyTiles(scenario)) =>
    occupancyHistogramTable(scenario, bufferedOccupancyTiles(scenario, tiles))

const overlapProxy = ({scenario, strata}) => {
    const membership = membershipImage(scenario)
    const eligibleClass = ee.ImageCollection.fromImages(
        strata.map(stratum => membership.select('observedClass').eq(stratum))
    ).max()
    return eligibleClass
        .and(membership.select('observedMask').eq(1))
        .unmask(0)
        .toByte()
        .setDefaultProjection(scenario.sourceProjection)
        .focalMax({
            kernel: ee.Kernel.square({radius: 1, units: 'pixels', normalize: false}),
            iterations: 1
        })
        .reduceResolution({
            reducer: ee.Reducer.max(),
            bestEffort: false,
            maxPixels: 256
        })
        .unmask(0)
}

const proxyLayout = ({scenario, group}) => {
    const markerScale = STRATIFICATION_SCALE
    const h = ee.Number(markerScale).divide(scenario.nominalScale).divide(2)
    const coordinates = ee.Image.pixelCoordinates(scenario.projection)
    const px = coordinates.select('x')
    const py = coordinates.select('y')
    const j = py.subtract(h).subtract(group.originY).divide(group.dy).ceil().int32()
    const parity = j.mod(2).add(2).mod(2)
    const i = px.subtract(h).subtract(group.originX).subtract(parity.multiply(group.dx.divide(2)))
        .divide(group.dx).ceil().int32()
    const exactX = i.multiply(group.dx).add(parity.multiply(group.dx.divide(2))).add(group.originX)
    const exactY = j.multiply(group.dy).add(group.originY)
    const marker = exactY.gte(py.subtract(h)).and(exactY.lt(py.add(h)))
        .and(exactX.gte(px.subtract(h))).and(exactX.lt(px.add(h)))
    const accepted = marker.and(overlapProxy({scenario, strata: group.strata}).gt(0))
    const label = i.long().leftShift(32).add(j.long()).rename('label')
    const markerImage = label.addBands(i.rename('i')).addBands(j.rename('j'))
        .addBands(levelBand(i, j)).updateMask(accepted)
    const vectorizationRegion = scenario.region.buffer(
        markerScale * 2,
        ee.ErrorMargin(markerScale, 'projected'),
        scenario.projection
    )
    return markerImage.reduceToVectors({
        reducer: ee.Reducer.first(),
        geometry: vectorizationRegion,
        crs: ARRANGEMENT_CRS,
        scale: markerScale,
        geometryType: 'centroid',
        labelProperty: 'label',
        maxPixels: 1e13,
        tileScale: 4,
        bestEffort: false
    }).map(feature => {
        const iValue = ee.Number(feature.get('i')).toInt()
        const jValue = ee.Number(feature.get('j')).toInt()
        const point = exactPoint({...group, i: iValue, j: jValue})
        const key = ee.String(group.layoutGroupId)
            .cat(':').cat(iValue.format('%d')).cat(':').cat(jValue.format('%d'))
        return feature.setGeometry(point.geometry).set({
            key,
            layoutGroupId: group.layoutGroupId,
            layoutStrata: group.strata,
            densityOffset: group.densityOffset,
            i: iValue,
            j: jValue,
            level: feature.get('level'),
            dx: group.dx,
            dy: group.dy,
            originX: group.originX,
            originY: group.originY,
            arrangementX: point.x,
            arrangementY: point.y
        })
    }).filterBounds(scenario.region)
}

const singleLatticePlan = scenario => {
    const densest = scenario.layouts.reduce(
        (current, layout) => layout.diameter < current.diameter ? layout : current,
        scenario.layouts[0]
    )
    const denseQuotientX = scenario.rootOrigin.x.divide(densest.dx.multiply(16)).floor()
    const denseQuotientY = scenario.rootOrigin.y.divide(densest.dy.multiply(32)).floor()
    const layouts = scenario.layouts.map(layout => {
        const ratio = layout.diameter / densest.diameter
        if (!Number.isSafeInteger(ratio) || ratio < 1 || (ratio & (ratio - 1)) !== 0) {
            throw new Error(`Diameter ${layout.diameter} is not a power-of-two multiple of ${densest.diameter}`)
        }
        const quotientX = scenario.rootOrigin.x.divide(layout.dx.multiply(16)).floor()
        const quotientY = scenario.rootOrigin.y.divide(layout.dy.multiply(32)).floor()
        return {
            ...layout,
            ratio,
            phaseShiftI: denseQuotientX.subtract(quotientX.multiply(ratio)).multiply(16).toInt(),
            phaseShiftJ: denseQuotientY.subtract(quotientY.multiply(ratio)).multiply(32).toInt(),
            proxyBand: `eligible_${layout.stratum}`
        }
    })
    return {densest, layouts}
}

const singleLayoutIndices = ({denseI, denseJ, layout}) => {
    const ratio = ee.Number(layout.ratio).toInt()
    const jNumerator = denseJ.subtract(layout.phaseShiftJ).toInt()
    const j = jNumerator.divide(ratio).floor().toInt()
    const correctionNumerator = j.mod(2).add(2).mod(2).multiply(ratio)
        .subtract(denseJ.mod(2).add(2).mod(2))
    const correction = correctionNumerator.divide(2).toInt()
    const iNumerator = denseI.subtract(layout.phaseShiftI).subtract(correction).toInt()
    const i = iNumerator.divide(ratio).floor().toInt()
    return {
        i,
        j,
        belongs: jNumerator.mod(ratio).eq(0)
            .and(correctionNumerator.mod(2).eq(0))
            .and(iNumerator.mod(ratio).eq(0))
    }
}

const levelFromIndices = (i, j) => {
    const residue = ee.Number(j).mod(32).add(32).mod(32).multiply(16)
        .add(ee.Number(i).mod(16).add(16).mod(16)).toInt()
    return ee.Number(ee.List(NESTED_LEVELS).get(residue))
}

const multibandOverlapProxy = ({scenario, plan}) => {
    const membership = membershipImage(scenario)
    const mask = membership.select('observedMask').eq(1)
    const bands = plan.layouts.map(layout => membership.select('observedClass')
        .eq(layout.stratum)
        .and(mask)
        .unmask(0)
        .toByte()
        .rename(layout.proxyBand)
    )
    return ee.Image.cat(bands)
        .setDefaultProjection(scenario.sourceProjection)
        .focalMax({
            kernel: ee.Kernel.square({radius: 1, units: 'pixels', normalize: false}),
            iterations: 1
        })
        .reduceResolution({
            reducer: ee.Reducer.max(),
            bestEffort: false,
            maxPixels: 256
        })
        .unmask(0)
}

const singleProxy = scenario => {
    const plan = singleLatticePlan(scenario)
    const dense = plan.densest
    const markerScale = STRATIFICATION_SCALE
    const h = ee.Number(markerScale).divide(scenario.nominalScale).divide(2)
    const coordinates = ee.Image.pixelCoordinates(scenario.projection)
    const px = coordinates.select('x')
    const py = coordinates.select('y')
    const denseJ = py.subtract(h).subtract(dense.originY).divide(dense.dy).ceil().int32()
    const denseParity = denseJ.mod(2).add(2).mod(2)
    const denseI = px.subtract(h).subtract(dense.originX)
        .subtract(denseParity.multiply(dense.dx.divide(2)))
        .divide(dense.dx).ceil().int32()
    const exactX = denseI.multiply(dense.dx)
        .add(denseParity.multiply(dense.dx.divide(2))).add(dense.originX)
    const exactY = denseJ.multiply(dense.dy).add(dense.originY)
    const marker = exactY.gte(py.subtract(h)).and(exactY.lt(py.add(h)))
        .and(exactX.gte(px.subtract(h))).and(exactX.lt(px.add(h)))
    const proxy = multibandOverlapProxy({scenario, plan})
    const acceptedByLayout = plan.layouts.map(layout => singleLayoutIndices({denseI, denseJ, layout}).belongs
        .and(proxy.select(layout.proxyBand).gt(0)))
    const accepted = marker.and(ee.ImageCollection.fromImages(acceptedByLayout).max())
    const residue = denseJ.mod(32).add(32).mod(32).multiply(16)
        .add(denseI.mod(16).add(16).mod(16))
    const markerImage = residue.add(1).toInt().rename('label')
        .addBands(denseI.rename('denseI'))
        .addBands(denseJ.rename('denseJ'))
        .updateMask(accepted)
    const vectorizationRegion = scenario.region.buffer(
        markerScale * 2,
        ee.ErrorMargin(markerScale, 'projected'),
        scenario.projection
    )
    return markerImage.reduceToVectors({
        reducer: ee.Reducer.first(),
        geometry: vectorizationRegion,
        crs: ARRANGEMENT_CRS,
        scale: markerScale,
        geometryType: 'centroid',
        labelProperty: 'label',
        maxPixels: 1e13,
        tileScale: 4,
        bestEffort: false
    }).map(feature => {
        const denseIValue = feature.getNumber('denseI').toInt()
        const denseJValue = feature.getNumber('denseJ').toInt()
        const point = exactPoint({...dense, i: denseIValue, j: denseJValue})
        const layoutStrata = ee.List(plan.layouts.map(layout => ee.Algorithms.If(
            singleLayoutIndices({denseI: denseIValue, denseJ: denseJValue, layout}).belongs,
            layout.stratum,
            null
        ))).removeAll([null])
        return feature.setGeometry(point.geometry).set({
            layoutGroupId: 'single-lattice',
            layoutStrata,
            denseDiameter: dense.diameter,
            denseI: denseIValue,
            denseJ: denseJValue
        })
    }).filterBounds(scenario.region)
}

const layoutLookup = plan => ee.Dictionary(Object.fromEntries(plan.layouts.map(layout => [
    String(layout.stratum),
    ee.Dictionary({
        stratum: layout.stratum,
        sampleSize: layout.sampleSize,
        densityOffset: 0,
        ratio: layout.ratio,
        phaseShiftI: layout.phaseShiftI,
        phaseShiftJ: layout.phaseShiftJ,
        dx: layout.dx,
        dy: layout.dy,
        originX: layout.originX,
        originY: layout.originY
    })
])))

const candidateGraph = scenario => {
    const plan = singleLatticePlan(scenario)
    const lookup = layoutLookup(plan)
    const strata = ee.List(plan.layouts.map(layout => layout.stratum))
    const defaultLayout = ee.Dictionary({
        stratum: SENTINEL,
        sampleSize: 0,
        densityOffset: 0,
        ratio: 1,
        phaseShiftI: 0,
        phaseShiftJ: 0,
        dx: plan.densest.dx,
        dy: plan.densest.dy,
        originX: plan.densest.originX,
        originY: plan.densest.originY
    })
    return membershipImage(scenario).reduceRegions({
        collection: singleProxy(scenario),
        reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
        crs: scenario.sourceProjection,
        scale: STRATIFICATION_SCALE,
        tileScale: 4,
        maxPixelsPerRegion: 1
    })
        .map(feature => {
            const observedClass = ee.Number(feature.get('observedClass')).toInt()
            const hasLayout = strata.contains(observedClass)
            const layout = ee.Dictionary(ee.Algorithms.If(
                hasLayout,
                lookup.get(observedClass.format('%d')),
                defaultLayout
            ))
            const indices = singleLayoutIndices({
                denseI: feature.getNumber('denseI'),
                denseJ: feature.getNumber('denseJ'),
                layout: {
                    ratio: layout.getNumber('ratio'),
                    phaseShiftI: layout.getNumber('phaseShiftI'),
                    phaseShiftJ: layout.getNumber('phaseShiftJ')
                }
            })
            const point = exactPoint({
                projection: scenario.projection,
                i: indices.i,
                j: indices.j,
                dx: layout.getNumber('dx'),
                dy: layout.getNumber('dy'),
                originX: layout.getNumber('originX'),
                originY: layout.getNumber('originY')
            })
            const key = observedClass.format('%d')
                .cat(':').cat(indices.i.format('%d'))
                .cat(':').cat(indices.j.format('%d'))
            return feature.setGeometry(point.geometry).set({
                hasLayout,
                belongsToObservedLayout: indices.belongs,
                stratum: observedClass,
                key,
                densityOffset: layout.getNumber('densityOffset'),
                i: indices.i,
                j: indices.j,
                level: levelFromIndices(indices.i, indices.j),
                dx: layout.getNumber('dx'),
                dy: layout.getNumber('dy'),
                originX: layout.getNumber('originX'),
                originY: layout.getNumber('originY'),
                arrangementX: point.x,
                arrangementY: point.y
            })
        })
        .filter(ee.Filter.eq('observedMask', 1))
        .filter(ee.Filter.eq('hasLayout', true))
        .filter(ee.Filter.eq('belongsToObservedLayout', 1))
}

const countOccurrences = (text, fragment) => text.split(fragment).length - 1

const graphCharacteristics = collection => {
    const serialized = collection.serialize()
    return {
        serializedBytes: Buffer.byteLength(serialized),
        serializedCharacters: serialized.length,
        focalMaxNodes: countOccurrences(serialized, 'Image.focalMax'),
        reduceResolutionNodes: countOccurrences(serialized, 'Image.reduceResolution'),
        reduceToVectorsNodes: countOccurrences(serialized, 'Image.reduceToVectors'),
        reduceRegionsNodes: countOccurrences(serialized, 'Image.reduceRegions'),
        sampleRegionsNodes: countOccurrences(serialized, 'Image.sampleRegions')
    }
}

const assertSingleGraph = graph => {
    if (graph.focalMaxNodes !== 1
        || graph.reduceResolutionNodes !== 1
        || graph.reduceToVectorsNodes !== 1
        || graph.reduceRegionsNodes !== 1
        || graph.sampleRegionsNodes !== 0) {
        throw new Error(`Single-lattice graph shape mismatch: ${JSON.stringify(graph)}`)
    }
    return graph
}

const workloadEstimate = scenario => {
    const layouts = scenario.layouts.map(layout => {
        const latticeCellArea = layout.dxMetres * layout.dyMetres
        const exactMembershipDensityEstimate = layout.area / latticeCellArea
        return {
            stratum: layout.stratum,
            requested: layout.sampleSize,
            priorOneGridClosestCount: fixture.closestCounts[layout.stratum],
            priorOneGridClosestLevel: fixture.closestLevels[layout.stratum],
            area: layout.area,
            weight: layout.weight,
            diameter: layout.diameter,
            dx: layout.dxMetres,
            dy: layout.dyMetres,
            exactMembershipDensityEstimate,
            sameGridMooreProxyEstimate: exactMembershipDensityEstimate * 9,
            conservativeEqualScaleMisalignmentBound: exactMembershipDensityEstimate * 36
        }
    })
    const sum = property => layouts.reduce((total, layout) => total + layout[property], 0)
    const plan = singleLatticePlan(scenario)
    const predicates = plan.layouts.map(layout => ({
        stratum: layout.stratum,
        diameter: layout.diameter,
        ratio: layout.ratio,
        phase: {
            denseJ: 'phaseShiftJ + ratio * j',
            denseI: 'phaseShiftI + ratio * i + (ratio * parity(j) - parity(denseJ)) / 2'
        }
    }))
    return {
        layouts,
        nestedLattice: {
            densestDiameter: plan.densest.diameter,
            distinctDiameters: [...new Set(scenario.layouts.map(({diameter}) => diameter))],
            predicates
        },
        priorOneGridClosestTotalReference:
            Object.values(fixture.closestCounts).reduce((total, count) => total + count, 0),
        epsg32636ClosestTotalExpected: null,
        exactMembershipDensityEstimateTotal: sum('exactMembershipDensityEstimate'),
        singleLatticeClassIncidenceMooreProxyEstimateTotal: sum('sameGridMooreProxyEstimate'),
        singleLatticeConservativeProxyIncidenceBoundTotal: sum('conservativeEqualScaleMisalignmentBound'),
        uniqueProxyMarkerBoundNote:
            'The single marker collection cannot exceed the summed class-incidence bound; multi-class proxy hits share one marker.',
        conceptualTenMetreCellsPerFullRasterBranch:
            AOI_AREA_SQUARE_METRES / Math.pow(STRATIFICATION_SCALE, 2),
        conceptualTenMetreCellsAcrossSingleMultibandBranch:
            AOI_AREA_SQUARE_METRES / Math.pow(STRATIFICATION_SCALE, 2),
        fullRasterCosts: [
            'one nine-band EPSG:32636 eligible-class and Moore-expansion branch',
            'one multiband overlap reduction into the EPSG:6933 marker grid',
            'one sparse densest-lattice marker vectorization over the AOI'
        ],
        sparsePointCost: 'one combined exact reduceRegions over only the single-lattice proxy points',
        rejectedFiveGroupConceptualTenMetreCells:
            AOI_AREA_SQUARE_METRES / Math.pow(STRATIFICATION_SCALE, 2) * 5,
        previousWholeAoiFeatureCount: 722027106,
        previousSnowIceFeatureCount: 692767164
    }
}

const exportProperties = [
    'key', 'stratum', 'layoutGroupId', 'layoutStrata', 'densityOffset', 'i', 'j', 'level',
    'dx', 'dy', 'originX', 'originY', 'arrangementX', 'arrangementY',
    'observedClass', 'observedMask'
]

const isNotFound = error => /not found|does not exist|not yet|404/i.test(String(error))

const requests = {
    exportStarts: 0,
    taskStatusPolls: 0,
    metadataVisibilityPolls: 0,
    rowVisibilityPolls: 0,
    aggregateValidations: 0,
    taskCancels: 0,
    assetDeletes: 0,
    cleanupVerifications: 0
}

const taskStatus = async taskId => {
    requests.taskStatusPolls += 1
    const statuses = await callbackPromise(callback =>
        ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
    )
    return statuses[0]
}

const waitForTask = async ({task, startedAt}) => {
    const stateHistory = []
    let previousState
    let cancelReason = null
    let runningAt = null
    let cancelRequestedAt = null
    for (;;) {
        const status = await taskStatus(task.id)
        const elapsedSeconds = (Date.now() - startedAt) / 1000
        if (status.state === 'RUNNING' && runningAt === null) {
            runningAt = Date.now()
        }
        const runningSeconds = runningAt === null ? 0 : (Date.now() - runningAt) / 1000
        if (status.state !== previousState) {
            stateHistory.push({state: status.state, elapsedSeconds, runningSeconds, status})
            console.log(JSON.stringify({
                event: 'task-state',
                taskId: task.id,
                state: status.state,
                elapsedSeconds,
                runningSeconds
            }))
            previousState = status.state
        }
        if (!['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(status.state)) {
            return {
                status,
                stateHistory,
                elapsedSeconds,
                runningSeconds,
                cancelReason,
                cancellationLatencySeconds: cancelRequestedAt === null
                    ? null
                    : (Date.now() - cancelRequestedAt) / 1000
            }
        }
        const eecu = Number(status.batch_eecu_usage_seconds || 0)
        const runtimeExceeded = runningAt !== null && Date.now() - runningAt > MAX_TASK_RUNTIME_MS
        if (!cancelReason && (runtimeExceeded || eecu > MAX_BATCH_EECU_SECONDS)) {
            cancelReason = runtimeExceeded
                ? `runtime exceeded ${MAX_TASK_RUNTIME_MS / 60000} minutes`
                : `batch EECU exceeded ${MAX_BATCH_EECU_SECONDS} seconds`
            requests.taskCancels += 1
            cancelRequestedAt = Date.now()
            await callbackPromise(callback =>
                ee.data.cancelTask(task.id, (result, error) => callback(result, error))
            )
            console.log(JSON.stringify({
                event: 'task-cancel-requested',
                taskId: task.id,
                cancelReason,
                elapsedSeconds,
                runningSeconds,
                eecu
            }))
        }
        await sleep(TASK_POLL_INTERVAL_MS)
    }
}

const waitForVisibility = async ({assetId, kind}) => {
    const ledger = []
    let totalDelayMilliseconds = 0
    for (const delayMilliseconds of VISIBILITY_DELAYS_MS) {
        if (delayMilliseconds) {
            await sleep(delayMilliseconds)
            totalDelayMilliseconds += delayMilliseconds
        }
        const elapsedSeconds = totalDelayMilliseconds / 1000
        try {
            if (kind === 'metadata') {
                requests.metadataVisibilityPolls += 1
                const result = await callbackPromise(callback =>
                    ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
                )
                ledger.push({delayMilliseconds, elapsedSeconds, state: 'VISIBLE'})
                return {result, elapsedSeconds, ledger}
            }
            requests.rowVisibilityPolls += 1
            const result = await evaluate(ee.FeatureCollection(assetId).limit(1).size())
            ledger.push({delayMilliseconds, elapsedSeconds, state: 'READABLE'})
            return {result, elapsedSeconds, ledger}
        } catch (error) {
            if (!isNotFound(error)) {
                throw error
            }
            ledger.push({delayMilliseconds, elapsedSeconds, state: 'NOT_FOUND'})
        }
    }
    throw new Error(`${kind} was not visible within the established 7.5-second retry window: ${assetId}`)
}

const missingStructuralProperties = feature => ee.Number(
    ee.List(REQUIRED_PROPERTIES).map(property => ee.Number(ee.Algorithms.If(
        feature.propertyNames().contains(property),
        ee.Algorithms.IsEqual(feature.get(property), null),
        1
    ))).reduce(ee.Reducer.sum())
).gt(0)

const readyAssetValidation = ({assetId, scenario}) => {
    const ready = ee.FeatureCollection(assetId)
    const selectedSummary = systematicSelectionSummary(selectSystematicLevels({
        samples: ready,
        allocation: fixture.allocation,
        strategy: fixture.strategy
    }))
    const source = ee.Image(SOURCE_ASSET).select(SOURCE_BAND)
    const validationImage = source.unmask(SENTINEL).rename('validationClass')
        .addBands(source.mask().unmask(0).gt(0).toInt().rename('validationMask'))
        .setDefaultProjection(scenario.sourceProjection)
    const checked = validationImage.reduceRegions({
        collection: ready,
        reducer: ee.Reducer.first().forEach(['validationClass', 'validationMask']),
        crs: scenario.sourceProjection,
        scale: STRATIFICATION_SCALE,
        tileScale: 4,
        maxPixelsPerRegion: 1
    }).map(feature => {
        const stratum = feature.getNumber('stratum').toInt()
        const i = feature.getNumber('i').toInt()
        const j = feature.getNumber('j').toInt()
        const point = exactPoint({
            projection: scenario.projection,
            i,
            j,
            dx: feature.getNumber('dx'),
            dy: feature.getNumber('dy'),
            originX: feature.getNumber('originX'),
            originY: feature.getNumber('originY')
        })
        const coordinates = feature.geometry()
            .transform(scenario.projection, GEOMETRY_TOLERANCE)
            .coordinates()
        const displacement = ee.Number(coordinates.get(0)).subtract(point.x).pow(2)
            .add(ee.Number(coordinates.get(1)).subtract(point.y).pow(2))
            .sqrt()
        const expectedKey = stratum.format('%d')
            .cat(':').cat(i.format('%d'))
            .cat(':').cat(j.format('%d'))
        const validationClass = feature.getNumber('validationClass').toInt()
        const validationMask = feature.getNumber('validationMask').toInt()
        return feature.set({
            stratumLevel: stratum.format('%d').cat(':').cat(feature.getNumber('level').format()),
            membershipViolation: validationClass.neq(stratum),
            sourceMaskViolation: validationMask.neq(1),
            persistedClassMismatch: feature.getNumber('observedClass').toInt().neq(validationClass),
            persistedMaskMismatch: feature.getNumber('observedMask').toInt().neq(validationMask),
            missingStructuralProperties: missingStructuralProperties(feature),
            structuralKeyMismatch: ee.String(feature.get('key')).compareTo(expectedKey).neq(0),
            geometryDisplacementMetres: displacement,
            geometryViolation: displacement.gt(MAX_GEOMETRY_DISPLACEMENT_METRES)
        })
    })
    const sum = property => checked.aggregate_sum(property)
    return ee.Dictionary({
        size: ready.size(),
        checkedSize: checked.size(),
        perStratumCandidateCounts: ready.aggregate_histogram('stratum'),
        perLevelCandidateCounts: ready.aggregate_histogram('level'),
        perStratumLevelCandidateCounts: checked.aggregate_histogram('stratumLevel'),
        distinctStructuralKeys: ready.aggregate_count_distinct('key'),
        insideAoiCount: ready.filterBounds(scenario.region).size(),
        membershipViolations: sum('membershipViolation'),
        sourceMaskViolations: sum('sourceMaskViolation'),
        persistedClassMismatches: sum('persistedClassMismatch'),
        persistedMaskMismatches: sum('persistedMaskMismatch'),
        missingStructuralProperties: sum('missingStructuralProperties'),
        structuralKeyMismatches: sum('structuralKeyMismatch'),
        geometryViolations: sum('geometryViolation'),
        maximumGeometryDisplacementMetres: checked.aggregate_max('geometryDisplacementMetres'),
        selectionSummary: selectedSummary
    })
}

const summarizeSelection = summary => {
    const [strata, rawCounts, actualCounts, selectedLevels] = summary.selectionSummary
    const selection = strata.map((stratum, index) => ({
        stratum,
        requested: fixture.allocation.find(row => row.stratum === stratum).sampleSize,
        rawCount: rawCounts[index],
        selectedLevel: selectedLevels[index],
        impliedFinalCount: actualCounts[index]
    }))
    const impliedFinalTotal = selection.reduce((total, row) => total + row.impliedFinalCount, 0)
    return {
        selection,
        impliedFinalTotal,
        candidateInflationRelativeToRequest: summary.size / 100000,
        impliedFinalInflationRelativeToRequest: impliedFinalTotal / 100000
    }
}

const assertReadyAsset = summary => {
    const duplicateStructuralKeys = summary.size - summary.distinctStructuralKeys
    const aoiViolations = summary.size - summary.insideAoiCount
    const discrepancies = {
        checkedSizeMismatch: summary.checkedSize !== summary.size,
        duplicateStructuralKeys,
        aoiViolations,
        membershipViolations: summary.membershipViolations,
        sourceMaskViolations: summary.sourceMaskViolations,
        persistedClassMismatches: summary.persistedClassMismatches,
        persistedMaskMismatches: summary.persistedMaskMismatches,
        missingStructuralProperties: summary.missingStructuralProperties,
        structuralKeyMismatches: summary.structuralKeyMismatches,
        geometryViolations: summary.geometryViolations,
        maximumGeometryDisplacementMetres: summary.maximumGeometryDisplacementMetres
    }
    if (Object.entries(discrepancies).some(([property, value]) =>
        property === 'maximumGeometryDisplacementMetres'
            ? value > MAX_GEOMETRY_DISPLACEMENT_METRES
            : Boolean(value)
    )) {
        throw new Error(`Ready candidate asset validation failed: ${JSON.stringify(discrepancies)}`)
    }
    return {...discrepancies, passed: true}
}

const cleanupAsset = async assetId => {
    if (!assetId) {
        return {assetId: null, deleteAttempted: false, absent: true}
    }
    requests.assetDeletes += 1
    try {
        await callbackPromise(callback =>
            ee.data.deleteAsset(assetId, (result, error) => callback(result, error))
        )
    } catch (error) {
        if (!isNotFound(error)) {
            throw error
        }
    }
    requests.cleanupVerifications += 1
    const startedAt = Date.now()
    for (;;) {
        try {
            await callbackPromise(callback =>
                ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
            )
        } catch (error) {
            if (isNotFound(error)) {
                return {
                    assetId,
                    deleteAttempted: true,
                    absent: true,
                    elapsedSeconds: (Date.now() - startedAt) / 1000
                }
            }
            throw error
        }
        if (Date.now() - startedAt > DELETE_VISIBILITY_TIMEOUT_MS) {
            throw new Error(`Temporary asset still exists after cleanup timeout: ${assetId}`)
        }
        await sleep(2000)
    }
}

const cancelIfRunning = async task => {
    if (!task) {
        return {taskId: null, state: null, cancelRequested: false, cancellationLatencySeconds: null}
    }
    let status = await taskStatus(task.id)
    let cancelRequestedAt = null
    if (['READY', 'RUNNING'].includes(status.state)) {
        requests.taskCancels += 1
        cancelRequestedAt = Date.now()
        await callbackPromise(callback =>
            ee.data.cancelTask(task.id, (result, error) => callback(result, error))
        )
    }
    while (['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(status.state)) {
        await sleep(2000)
        status = await taskStatus(task.id)
    }
    return {
        taskId: task.id,
        state: status.state,
        cancelRequested: cancelRequestedAt !== null,
        cancellationLatencySeconds: cancelRequestedAt === null
            ? null
            : (Date.now() - cancelRequestedAt) / 1000
    }
}

const fixtureReport = () => ({
    sourceAsset: SOURCE_ASSET,
    sourceBand: SOURCE_BAND,
    aoiAsset: AOI_ASSET,
    aoiKeyColumn: AOI_KEY_COLUMN,
    aoiKey: AOI_KEY,
    arrangementCrs: ARRANGEMENT_CRS_ID,
    stratificationCrs: STRATIFICATION_CRS_ID,
    stratificationScale: STRATIFICATION_SCALE,
    strategy: fixture.strategy,
    gridOrigin: fixture.gridOrigin,
    seed: fixture.seed,
    minDistance: fixture.minDistance,
    requestedTotal: fixture.allocation.reduce((total, row) => total + row.sampleSize, 0),
    expectedClosestResultUnderEpsg32636: null
})

const occupancyExportProperties = ['tileKey', 'tileI', 'tileJ', 'tileSizeMetres', ...OCCUPANCY_BANDS]

const occupancyWorkload = scenario => ({
    tileSizeMetres: OCCUPANCY_TILE_SIZE_METRES,
    sourceCellCentreBoundGridUnits: SOURCE_GRID_BUFFER_RADIUS,
    occupancyEnvelope: occupancyEnvelopeAtScale(STRATIFICATION_SCALE),
    approximateAoiTileCount: AOI_AREA_SQUARE_METRES / Math.pow(OCCUPANCY_TILE_SIZE_METRES, 2),
    approximateNativePixelsPerFullTile: Math.pow(OCCUPANCY_TILE_SIZE_METRES / STRATIFICATION_SCALE, 2),
    conceptualNativePixelsAcrossAoi: AOI_AREA_SQUARE_METRES / Math.pow(STRATIFICATION_SCALE, 2),
    configuredClasses: fixture.allocation.map(({stratum}) => stratum),
    layoutDiameters: scenario.layouts.map(({stratum, diameter}) => ({stratum, diameter}))
})

const assertOccupancyGraph = graph => {
    if (graph.focalMaxNodes !== 0
        || graph.reduceResolutionNodes !== 0
        || graph.reduceToVectorsNodes !== 1
        || graph.reduceRegionsNodes !== 1
        || graph.sampleRegionsNodes !== 0) {
        throw new Error(`Occupancy graph shape mismatch: ${JSON.stringify(graph)}`)
    }
    return graph
}

const readyOccupancyValidation = ({assetId, scenario}) => {
    const ready = ee.FeatureCollection(assetId)
    const checked = ready.map(feature => {
        const tileI = feature.getNumber('tileI').toInt()
        const tileJ = feature.getNumber('tileJ').toInt()
        const expectedKey = tileI.format('%d').cat(':').cat(tileJ.format('%d'))
        const missing = ee.Number(ee.List(occupancyExportProperties).map(property => ee.Number(
            ee.Algorithms.If(feature.propertyNames().contains(property), 0, 1)
        )).reduce(ee.Reducer.sum()))
        return feature.setGeometry(occupancyTileGeometry({scenario, tileI, tileJ})).set({
            missingOccupancyProperties: missing,
            occupancyKeyMismatch: ee.String(feature.get('tileKey')).compareTo(expectedKey).neq(0)
        })
    })
    return ee.Dictionary({
        size: ready.size(),
        checkedSize: checked.size(),
        distinctTileKeys: ready.aggregate_count_distinct('tileKey'),
        insideAoiCount: checked.filterBounds(scenario.region).size(),
        missingOccupancyProperties: checked.aggregate_sum('missingOccupancyProperties'),
        occupancyKeyMismatches: checked.aggregate_sum('occupancyKeyMismatch'),
        occupiedByClass: ee.Dictionary(Object.fromEntries(fixture.allocation.map(({stratum}) => [
            String(stratum),
            ready.aggregate_sum(`has_${stratum}`)
        ])))
    })
}

const summarizeOccupancyAsset = ({summary, scenario}) => {
    const discrepancies = {
        checkedSizeMismatch: summary.checkedSize !== summary.size,
        duplicateTileKeys: summary.size - summary.distinctTileKeys,
        aoiTileViolations: summary.size - summary.insideAoiCount,
        missingOccupancyProperties: summary.missingOccupancyProperties,
        occupancyKeyMismatches: summary.occupancyKeyMismatches
    }
    if (Object.values(discrepancies).some(Boolean)) {
        throw new Error(`Ready occupancy validation failed: ${JSON.stringify(discrepancies)}`)
    }
    const impliedLatticePointBounds = Object.fromEntries(scenario.layouts.map(layout => [
        String(layout.stratum),
        Number(summary.occupiedByClass[String(layout.stratum)] || 0)
            * Math.pow(OCCUPANCY_TILE_SIZE_METRES, 2)
            / (layout.dxMetres * layout.dyMetres)
    ]))
    return {...summary, ...discrepancies, impliedLatticePointBounds, validationPassed: true}
}

const runPreflight = async () => {
    await authenticate({linkedUser: false})
    const scenario = buildScenario()
    const candidates = candidateGraph(scenario)
    const graph = assertSingleGraph(graphCharacteristics(candidates))
    console.log(JSON.stringify({
        checkpoint: 'C',
        status: 'PREFLIGHT_ONLY',
        fixture: fixtureReport(),
        workload: workloadEstimate(scenario),
        graph,
        exportsStarted: requests.exportStarts,
        assetsCreated: 0
    }, null, 2))
}

const runExport = async () => {
    if (process.stdin.isTTY) {
        throw new Error('Linked-user credential receiver must not be a TTY')
    }
    process.stderr.write('Credential receiver ready (stdinIsTTY=false)\n')
    process.stderr.write('Awaiting linked-user credentials on stdin (input is not echoed)\n')
    await authenticate({linkedUser: true})
    const scenario = buildScenario()
    const candidates = candidateGraph(scenario).select(exportProperties)
    const graph = assertSingleGraph(graphCharacteristics(candidates))
    const workload = workloadEstimate(scenario)
    const timestamp = Date.now()
    const assetId = `${ASSET_ROOT}/sd_systematic_single_base_${timestamp}`
    const description = `sd-systematic-single-base-${timestamp}`
    const task = ee.batch.Export.table.toAsset(candidates, description, assetId)
    let taskResult
    let cleanup
    let retainedForRecovery = false
    try {
        requests.exportStarts += 1
        const startedAt = Date.now()
        task.start()
        console.log(JSON.stringify({event: 'export-started', taskId: task.id, assetId, graph, workload}))
        if (process.env.SD_START_ONLY === '1') {
            retainedForRecovery = true
            console.log(JSON.stringify({
                checkpoint: 'SUDAN_BASE_CANDIDATE_STARTED',
                taskId: task.id,
                assetId,
                startedAt,
                graph,
                workload,
                requests
            }, null, 2))
            return
        }
        taskResult = await waitForTask({task, startedAt})
        if (taskResult.status.state !== 'COMPLETED') {
            throw new Error(`Sudan base-candidate export failed once: ${JSON.stringify(taskResult.status)}`)
        }
        const visibility = {
            metadata: await waitForVisibility({assetId, kind: 'metadata'}),
            rows: await waitForVisibility({assetId, kind: 'rows'})
        }
        requests.aggregateValidations += 1
        const summary = await evaluate(readyAssetValidation({assetId, scenario}))
        const validation = assertReadyAsset(summary)
        const selection = summarizeSelection(summary)
        console.log(JSON.stringify({
            checkpoint: 'SUDAN_BASE_CANDIDATE',
            status: 'PASS',
            fixture: fixtureReport(),
            assetId,
            taskId: task.id,
            graph,
            workload,
            task: taskResult,
            visibility,
            readyAsset: {
                ...summary,
                duplicateStructuralKeys: summary.size - summary.distinctStructuralKeys,
                aoiViolations: summary.size - summary.insideAoiCount,
                ...selection,
                validation
            },
            requests
        }, null, 2))
    } finally {
        if (retainedForRecovery) {
            console.log(JSON.stringify({event: 'retained-for-recovery', taskId: task.id, assetId}))
        } else {
            try {
                await cancelIfRunning(task)
            } finally {
                cleanup = await cleanupAsset(assetId)
                console.log(JSON.stringify({event: 'cleanup', cleanup, requests}))
            }
        }
    }
}

const recoverExport = async () => {
    const taskId = process.env.SD_RECOVER_TASK_ID
    const assetId = process.env.SD_RECOVER_ASSET_ID
    const startedAt = Number(process.env.SD_RECOVER_STARTED_AT)
    if (!taskId || !assetId || !Number.isSafeInteger(startedAt)) {
        throw new Error('Recovery requires task id, asset id, and integer start timestamp')
    }
    process.stderr.write('Awaiting linked-user credentials on stdin (input is not echoed)\n')
    await authenticate({linkedUser: true})
    const task = {id: taskId}
    const scenario = buildScenario()
    const graph = graphCharacteristics(candidateGraph(scenario).select(exportProperties))
    const workload = workloadEstimate(scenario)
    let cleanup
    try {
        if (process.env.SD_CANCEL_ONLY === '1') {
            const statusBeforeCancel = await taskStatus(taskId)
            if (['READY', 'RUNNING'].includes(statusBeforeCancel.state)) {
                requests.taskCancels += 1
                await callbackPromise(callback =>
                    ee.data.cancelTask(taskId, (result, error) => callback(result, error))
                )
            }
            let statusAfterCancel = await taskStatus(taskId)
            while (['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(statusAfterCancel.state)) {
                await sleep(2000)
                statusAfterCancel = await taskStatus(taskId)
            }
            console.log(JSON.stringify({
                checkpoint: 'SUDAN_BASE_CANDIDATE_CANCELLED',
                taskId,
                assetId,
                statusBeforeCancel,
                statusAfterCancel,
                exportsStartedByRecovery: 0,
                requests
            }, null, 2))
            return
        }
        const taskResult = await waitForTask({task, startedAt})
        if (taskResult.status.state !== 'COMPLETED') {
            throw new Error(`Existing Sudan base-candidate export failed: ${JSON.stringify(taskResult.status)}`)
        }
        const visibility = {
            metadata: await waitForVisibility({assetId, kind: 'metadata'}),
            rows: await waitForVisibility({assetId, kind: 'rows'})
        }
        requests.aggregateValidations += 1
        const summary = await evaluate(readyAssetValidation({assetId, scenario}))
        const validation = assertReadyAsset(summary)
        const selection = summarizeSelection(summary)
        console.log(JSON.stringify({
            checkpoint: 'SUDAN_BASE_CANDIDATE_RECOVERY',
            status: 'PASS',
            fixture: fixtureReport(),
            assetId,
            taskId,
            graph,
            workload,
            task: taskResult,
            visibility,
            readyAsset: {
                ...summary,
                duplicateStructuralKeys: summary.size - summary.distinctStructuralKeys,
                aoiViolations: summary.size - summary.insideAoiCount,
                ...selection,
                validation
            },
            requests,
            exportsStartedByRecovery: 0
        }, null, 2))
    } finally {
        try {
            await cancelIfRunning(task)
        } finally {
            cleanup = await cleanupAsset(assetId)
            console.log(JSON.stringify({event: 'cleanup', cleanup, requests}))
        }
    }
}

const runOccupancyPreflight = async () => {
    await authenticate({linkedUser: false})
    const scenario = buildScenario()
    const occupancy = occupancyTable(scenario).select(occupancyExportProperties)
    console.log(JSON.stringify({
        checkpoint: 'SUDAN_OCCUPANCY_PREFLIGHT',
        status: 'PASS',
        fixture: fixtureReport(),
        workload: occupancyWorkload(scenario),
        graph: assertOccupancyGraph(graphCharacteristics(occupancy)),
        exportsStarted: 0
    }, null, 2))
}

const runOccupancyGeometryCheck = async () => {
    await authenticate({linkedUser: false})
    const scenario = buildScenario()
    const tiles = occupancyTiles(scenario)
    const extremeTiles = ee.FeatureCollection([
        ee.Feature(tiles.sort('tileI').first()).set('extreme', 'minimum tileI'),
        ee.Feature(tiles.sort('tileI', false).first()).set('extreme', 'maximum tileI'),
        ee.Feature(tiles.sort('tileJ').first()).set('extreme', 'minimum tileJ'),
        ee.Feature(tiles.sort('tileJ', false).first()).set('extreme', 'maximum tileJ')
    ]).distinct('tileKey')
    const direct = occupancyHistogramTable(scenario, extremeTiles)
    const buffered = occupancyTable(scenario, extremeTiles)
    const compared = buffered.map(feature => {
        const directFeature = ee.Feature(direct
            .filter(ee.Filter.eq('tileKey', feature.get('tileKey')))
            .first())
        const directOccupied = ee.Number(ee.List(OCCUPANCY_BANDS).map(property =>
            ee.Number(directFeature.get(property))
        ).reduce(ee.Reducer.sum()))
        const bufferedOccupied = ee.Number(ee.List(OCCUPANCY_BANDS).map(property =>
            ee.Number(feature.get(property))
        ).reduce(ee.Reducer.sum()))
        const missing = ee.Number(ee.List(OCCUPANCY_BANDS).map(property => ee.Number(
            ee.Algorithms.If(
                ee.Number(directFeature.get(property)).eq(1)
                    .and(ee.Number(feature.get(property)).neq(1)),
                1,
                0
            )
        )).reduce(ee.Reducer.sum()))
        return feature.set({
            directOccupied,
            bufferedOccupied,
            missing
        })
    })
    const summary = await evaluate(ee.Dictionary({
        aoiArea: scenario.region.area(
            ee.ErrorMargin(OCCUPANCY_FILTER_TOLERANCE_METRES, 'meters')
        ),
        selectedExtremeTiles: compared.size(),
        extremes: compared.aggregate_array('extreme'),
        tileKeys: compared.aggregate_array('tileKey'),
        tileI: compared.aggregate_array('tileI'),
        tileJ: compared.aggregate_array('tileJ'),
        directOccupiedClasses: compared.aggregate_array('directOccupied'),
        bufferedOccupiedClasses: compared.aggregate_array('bufferedOccupied'),
        bufferedMonotonicityViolations: compared.aggregate_sum('missing'),
        envelope: occupancyEnvelopeAtScale(STRATIFICATION_SCALE)
    }))
    if (summary.selectedExtremeTiles < 4 || summary.bufferedMonotonicityViolations !== 0) {
        throw new Error(`Sudan occupancy monotonicity/API smoke mismatch: ${JSON.stringify(summary)}`)
    }
    console.log(JSON.stringify({
        checkpoint: 'SUDAN_OCCUPANCY_EXTREMA_MONOTONICITY_SMOKE',
        status: 'PASS',
        summary
    }, null, 2))
}

const runOccupancyExport = async () => {
    if (process.stdin.isTTY) {
        throw new Error('Linked-user credential receiver must not be a TTY')
    }
    process.stderr.write('Credential receiver ready (stdinIsTTY=false)\n')
    await authenticate({linkedUser: true})
    const scenario = buildScenario()
    const occupancy = occupancyTable(scenario).select(occupancyExportProperties)
    const graph = assertOccupancyGraph(graphCharacteristics(occupancy))
    const workload = occupancyWorkload(scenario)
    const timestamp = Date.now()
    const assetId = `${ASSET_ROOT}/sd_systematic_occupancy_sudan_${timestamp}`
    const description = `sd-systematic-occupancy-sudan-${timestamp}`
    const task = ee.batch.Export.table.toAsset(occupancy, description, assetId)
    let retainedForRecovery = false
    let cleanup
    let terminalTask
    try {
        requests.exportStarts += 1
        const startedAt = Date.now()
        task.start()
        console.log(JSON.stringify({event: 'occupancy-export-started', taskId: task.id, assetId, startedAt, graph, workload}))
        if (process.env.SD_START_ONLY === '1') {
            retainedForRecovery = true
            console.log(JSON.stringify({
                checkpoint: 'SUDAN_OCCUPANCY_STARTED',
                taskId: task.id,
                assetId,
                startedAt,
                graph,
                workload,
                requests
            }, null, 2))
            return
        }
        const taskResult = await waitForTask({task, startedAt})
        if (taskResult.status.state !== 'COMPLETED') {
            throw new Error(`Sudan occupancy export failed once: ${JSON.stringify(taskResult)}`)
        }
        const visibility = {
            metadata: await waitForVisibility({assetId, kind: 'metadata'}),
            rows: await waitForVisibility({assetId, kind: 'rows'})
        }
        requests.aggregateValidations += 1
        const summary = await evaluate(readyOccupancyValidation({assetId, scenario}))
        console.log(JSON.stringify({
            checkpoint: 'SUDAN_OCCUPANCY',
            status: 'PASS',
            taskId: task.id,
            assetId,
            graph,
            workload,
            task: taskResult,
            visibility,
            readyAsset: summarizeOccupancyAsset({summary, scenario}),
            requests
        }, null, 2))
    } finally {
        if (retainedForRecovery) {
            console.log(JSON.stringify({event: 'retained-for-recovery', taskId: task.id, assetId}))
        } else {
            try {
                terminalTask = await cancelIfRunning(task)
            } finally {
                cleanup = await cleanupAsset(assetId)
                console.log(JSON.stringify({event: 'cleanup', terminalTask, cleanup, requests}))
            }
        }
    }
}

const recoverOccupancyExport = async () => {
    const taskId = process.env.SD_OCCUPANCY_RECOVER_TASK_ID
    const assetId = process.env.SD_OCCUPANCY_RECOVER_ASSET_ID
    const startedAt = Number(process.env.SD_OCCUPANCY_RECOVER_STARTED_AT)
    if (!taskId || !assetId || !Number.isSafeInteger(startedAt)) {
        throw new Error('Occupancy recovery requires task id, asset id, and integer start timestamp')
    }
    if (process.stdin.isTTY) {
        throw new Error('Linked-user credential receiver must not be a TTY')
    }
    process.stderr.write('Credential receiver ready (stdinIsTTY=false)\n')
    await authenticate({linkedUser: true})
    const scenario = buildScenario()
    const graph = assertOccupancyGraph(graphCharacteristics(
        occupancyTable(scenario).select(occupancyExportProperties)
    ))
    const task = {id: taskId}
    let cleanup
    try {
        const taskResult = await waitForTask({task, startedAt})
        if (taskResult.status.state !== 'COMPLETED') {
            throw new Error(`Sudan occupancy export did not complete: ${JSON.stringify(taskResult)}`)
        }
        const visibility = {
            metadata: await waitForVisibility({assetId, kind: 'metadata'}),
            rows: await waitForVisibility({assetId, kind: 'rows'})
        }
        requests.aggregateValidations += 1
        const summary = await evaluate(readyOccupancyValidation({assetId, scenario}))
        console.log(JSON.stringify({
            checkpoint: 'SUDAN_OCCUPANCY_RECOVERY',
            status: 'PASS',
            taskId,
            assetId,
            graph,
            workload: occupancyWorkload(scenario),
            task: taskResult,
            visibility,
            readyAsset: summarizeOccupancyAsset({summary, scenario}),
            exportsStartedByRecovery: 0,
            requests
        }, null, 2))
    } finally {
        try {
            await cancelIfRunning(task)
        } finally {
            cleanup = await cleanupAsset(assetId)
            console.log(JSON.stringify({event: 'cleanup', cleanup, requests}))
        }
    }
}

const inspectOccupancyTask = async () => {
    const taskId = process.env.SD_OCCUPANCY_TASK_ID
    const assetId = process.env.SD_OCCUPANCY_ASSET_ID
    const startedAt = Number(process.env.SD_OCCUPANCY_STARTED_AT)
    if (!taskId || !assetId || !Number.isSafeInteger(startedAt)) {
        throw new Error('Occupancy status requires task id, asset id, and integer start timestamp')
    }
    if (process.stdin.isTTY) {
        throw new Error('Linked-user credential receiver must not be a TTY')
    }
    process.stderr.write('Credential receiver ready (stdinIsTTY=false)\n')
    await authenticate({linkedUser: true})
    const status = await taskStatus(taskId)
    console.log(JSON.stringify({
        checkpoint: 'SUDAN_OCCUPANCY_STATUS',
        taskId,
        assetId,
        elapsedSeconds: (Date.now() - startedAt) / 1000,
        status,
        requests
    }, null, 2))
}

if (process.env.SD_OCCUPANCY_RECOVER_TASK_ID) {
    await recoverOccupancyExport()
} else if (process.env.SD_OCCUPANCY_TASK_ID) {
    await inspectOccupancyTask()
} else if (process.env.SD_OCCUPANCY_EXPORT === '1') {
    await runOccupancyExport()
} else if (process.env.SD_OCCUPANCY_PREFLIGHT === '1') {
    await runOccupancyPreflight()
} else if (process.env.SD_OCCUPANCY_GEOMETRY_CHECK === '1') {
    await runOccupancyGeometryCheck()
} else if (process.env.SD_RECOVER_TASK_ID) {
    await recoverExport()
} else if (process.env.SD_EXPORT_BASE === '1') {
    await runExport()
} else {
    await runPreflight()
}
