import ee from '#sepal/ee/ee'

import {
    googleProjectId,
    serviceAccountCredentials
} from '#gee/config'
import {resolveSamplingGridCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {nestedLevel} from '#sepal/ee/samplingDesign/systematicLatticeMath'
import {
    selectSystematicLevels,
    systematicSelectionSummary
} from '#sepal/ee/samplingDesign/systematicSampling'

const ERROR_MARGIN = 0.001
const COORDINATE_TRANSFORM = [1, 0, 0, 0, -1, 0]
const NEAREST_COORDINATE_ERROR_BOUND = Math.sqrt(0.5)
const NOMINATION_NUMERICAL_MARGIN = 0.01
const DISTANCE_TIE_RELATIVE_EPSILON = 1e-12
const DISTANCE_TIE_ABSOLUTE_EPSILON = 1e-9
const SUDAN_RADIUS_INFLATION_FACTOR = 1.1
const SUDAN_RADIUS_INFLATION_METRES = 0.1
const SUDAN_VERIFIED_NOMINATION_RADIUS = 8.738460896509922
const CONTROL_MESH_STEPS = 20
const WIDTH = 8
const HEIGHT = 8
const ARRANGEMENT_CRS = resolveSamplingGridCrs('EPSG:6933')
const SENTINEL = -9999
const SQRT3 = Math.sqrt(3)
const NESTED_LEVELS = Array.from({length: 32}, (_unused, j) =>
    Array.from({length: 16}, (_unusedAgain, i) => nestedLevel(i, j))
).flat()
const SUDAN_SOURCE_ASSET = 'projects/fifth-bonbon-272108/assets/sudan-dynamic-world-2024'
const SUDAN_SOURCE_BAND = 'label'
const SUDAN_AOI_ASSET = 'users/wiell/SepalResources/gaul'
const SUDAN_AOI_KEY = 6
const SUDAN_STRATIFICATION_CRS = 'EPSG:32636'
const SUDAN_STRATIFICATION_SCALE = 10
const SUDAN_MINIMUM_DISTANCE = 20
const MAX_LATTICE_EXPONENT = 24
const MAX_DENSITY_OFFSETS = 24
const BASE_GRID_SLACK = 0.75
const ASSET_ROOT = 'projects/daniel-wiell/assets'
const MODEST_POLL_INTERVAL_MS = 2000
const SUDAN_POLL_INTERVAL_MS = 10000
const SUDAN_MAX_RUNNING_MS = 45 * 60 * 1000
const SUDAN_CANCEL_EECU = 25000
const SUDAN_HARD_EECU = 30000
const STAGE2_MAX_RUNNING_MS = 60 * 60 * 1000
const STAGE2_HARD_EECU = 10000
const VISIBILITY_DELAYS_MS = [0, 500, 1000, 2000, 4000]
const SUDAN_ALLOCATION = [
    {stratum: 0, area: 5465664655.29412, sampleSize: 2857},
    {stratum: 1, area: 73237008483.52942, sampleSize: 9697},
    {stratum: 2, area: 1963761640.7843134, sampleSize: 1702},
    {stratum: 3, area: 1044592860.7843137, sampleSize: 1237},
    {stratum: 4, area: 263708404850.58826, sampleSize: 19840},
    {stratum: 5, area: 248695078157.25507, sampleSize: 19034},
    {stratum: 6, area: 3832430202.745098, sampleSize: 2394},
    {stratum: 7, area: 1245111270211.3682, sampleSize: 43221},
    {stratum: 8, area: 226218.82352941178, sampleSize: 18}
]

const scenarios = [
    {
        name: 'same-crs-exact-arrangement-boundaries',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, -100, 0, -10, 100]},
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -110, 0, -20, 110]}
    },
    {
        name: 'same-crs-shifted-fractional',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, -100, 0, -10, 100]},
        source: {crs: ARRANGEMENT_CRS, transform: [17, 0, -107.3, 0, -17, 113.7]}
    },
    {
        name: 'cross-crs-shifted-utm',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, 280000, 0, -10, 5000]},
        source: {crs: 'EPSG:32631', transform: [20, 0, 166007, 0, -20, 1013]}
    }
]

const readCredentialsFromStdin = async () => {
    let input = ''
    for await (const chunk of process.stdin) {
        input += chunk
        if (input.includes('\n')) {
            process.stdin.pause()
            break
        }
    }
    return JSON.parse(input.trim())
}

const authenticate = async ({linkedUser = false} = {}) => {
    let projectId = googleProjectId
    if (linkedUser) {
        if (process.stdin.isTTY) {
            throw new Error('Linked-user credential receiver must not be a TTY')
        }
        process.stderr.write('Credential receiver ready (stdinIsTTY=false)\n')
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

const evaluate = value => new Promise((resolve, reject) =>
    value.evaluate((result, error) => error ? reject(error) : resolve(result))
)

const callbackPromise = operation => new Promise((resolve, reject) =>
    operation((result, error) => error ? reject(error) : resolve(result))
)

const affinePoint = ({transform, u, v}) => ({
    x: u.multiply(transform[0]).add(v.multiply(transform[1])).add(transform[2]),
    y: u.multiply(transform[3]).add(v.multiply(transform[4])).add(transform[5])
})

const coordinateRampComparison = config => {
    const arrangementProjection = ee.Projection(config.arrangement.crs, COORDINATE_TRANSFORM)
    const arrangementBaseProjection = ee.Projection(config.arrangement.crs)
    const sourceProjection = ee.Projection(config.source.crs, config.source.transform)
    const sourceCoordinates = ee.Image.pixelCoordinates(sourceProjection)
    const sourceI = sourceCoordinates.select('x').floor().toInt().rename('sourceI')
    const sourceJ = sourceCoordinates.select('y').floor().toInt().rename('sourceJ')
    const label = sourceJ.multiply(WIDTH).add(sourceI).add(1).toInt().rename('label')
    const arrangementRamp = ee.Image.pixelCoordinates(arrangementProjection)
        .toDouble()
        .rename(['rampI', 'rampJ'])
    const terminalImage = label.addBands(sourceI).addBands(sourceJ).addBands(arrangementRamp)
    const region = ee.Geometry.Rectangle([0, 0, WIDTH, HEIGHT], sourceProjection, false, true)
    const vectors = terminalImage.reduceToVectors({
        reducer: ee.Reducer.first().forEach(['sourceI', 'sourceJ', 'rampI', 'rampJ']),
        geometry: region,
        crs: config.source.crs,
        crsTransform: config.source.transform,
        geometryType: 'centroid',
        geometryInNativeProjection: true,
        eightConnected: false,
        labelProperty: 'label',
        maxPixels: 1e6,
        bestEffort: false
    }).map(feature => {
        const sourceGridI = feature.getNumber('sourceI').toInt()
        const sourceGridJ = feature.getNumber('sourceJ').toInt()
        const sourceCentre = ee.Geometry.Point([
            sourceGridI.add(0.5),
            sourceGridJ.add(0.5)
        ], sourceProjection)
        const expectedProjected = sourceCentre.transform(
            arrangementBaseProjection,
            ERROR_MARGIN
        ).coordinates()
        const expectedX = ee.Number(expectedProjected.get(0))
        const expectedY = ee.Number(expectedProjected.get(1))
        const rampI = feature.getNumber('rampI')
        const rampJ = feature.getNumber('rampJ')
        const rampProjected = affinePoint({
            transform: COORDINATE_TRANSFORM,
            u: rampI,
            v: rampJ
        })
        const errorX = rampProjected.x.subtract(expectedX).abs()
        const errorY = rampProjected.y.subtract(expectedY).abs()
        const planarError = errorX.pow(2).add(errorY.pow(2)).sqrt()
        return feature.set({
            scenario: config.name,
            expectedX,
            expectedY,
            rampI,
            rampJ,
            projectedX: rampProjected.x,
            projectedY: rampProjected.y,
            coordinateErrorX: errorX,
            coordinateErrorY: errorY,
            coordinatePlanarError: planarError,
            example: ee.Dictionary({
                sourceI: sourceGridI,
                sourceJ: sourceGridJ,
                expectedX,
                expectedY,
                rampI,
                rampJ,
                projectedX: rampProjected.x,
                projectedY: rampProjected.y,
                coordinateErrorX: errorX,
                coordinateErrorY: errorY,
                coordinatePlanarError: planarError
            })
        })
    })
    return ee.Dictionary({
        name: config.name,
        rows: vectors.size(),
        distinctLabels: vectors.aggregate_count_distinct('label'),
        maxCoordinateErrorX: vectors.aggregate_max('coordinateErrorX'),
        maxCoordinateErrorY: vectors.aggregate_max('coordinateErrorY'),
        maxCoordinatePlanarError: vectors.aggregate_max('coordinatePlanarError'),
        theoreticalPlanarBound: NEAREST_COORDINATE_ERROR_BOUND,
        examples: vectors.limit(4).aggregate_array('example')
    })
}

const finiteConfigs = [
    {
        name: 'finite-same-crs-fixed-boundaries',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, -200, 0, -10, 200]},
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        origin: {x: 0, y: 0},
        classShift: 0
    },
    {
        name: 'finite-same-crs-seeded-shift',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, -200, 0, -10, 200]},
        source: {crs: ARRANGEMENT_CRS, transform: [17, 0, -137.3, 0, -17, 138.7]},
        origin: {x: 13.25, y: -17.75},
        classShift: 1
    },
    {
        name: 'finite-cross-crs-fixed-boundaries',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, -200, 0, -10, 200]},
        source: {crs: 'EPSG:32631', transform: [20, 0, 165861, 0, -20, 160]},
        origin: {x: 0, y: 0},
        classShift: 2
    },
    {
        name: 'finite-cross-crs-seeded-shift',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, -200, 0, -10, 200]},
        source: {crs: 'EPSG:32631', transform: [23, 0, 165843, 0, -23, 184]},
        origin: {x: -11.5, y: 19.25},
        classShift: 0
    },
    {
        name: 'finite-same-crs-isolated-pixel',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, -200, 0, -10, 200]},
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        origin: {x: 10, y: -10},
        classShift: 0,
        isolatedClass: true
    },
    {
        name: 'finite-cross-crs-repair-density-near-spacing-limit',
        arrangement: {crs: ARRANGEMENT_CRS, transform: [10, 0, -200, 0, -10, 200]},
        source: {crs: 'EPSG:32631', transform: [16, 0, 165853, 0, -16, 176]},
        origin: {x: -7.5, y: 11.25},
        classShift: 1,
        diameterFactor: 0.5
    }
]

const buildFiniteScenario = config => {
    const arrangementProjection = ee.Projection(config.arrangement.crs, config.arrangement.transform)
    const arrangementBaseProjection = ee.Projection(config.arrangement.crs)
    const coordinateProjection = ee.Projection(config.arrangement.crs, COORDINATE_TRANSFORM)
    const sourceProjection = ee.Projection(config.source.crs, config.source.transform)
    const sourceBaseProjection = ee.Projection(config.source.crs)
    const outer = [[0, 0], [16, 0], [16, 16], [0, 16], [0, 0]]
    const hole = [[6, 6], [10, 6], [10, 10], [6, 10], [6, 6]]
    const region = ee.Geometry.Polygon([outer, hole], sourceProjection, false)
    const sourceCoordinates = ee.Image.pixelCoordinates(sourceProjection)
    const sourceI = sourceCoordinates.select('x').floor().toInt()
    const sourceJ = sourceCoordinates.select('y').floor().toInt()
    const sourceMask = sourceI.multiply(7).add(sourceJ.multiply(11)).mod(13).neq(0).toInt()
    let sourceClass = sourceI.multiply(3).add(sourceJ.multiply(5)).add(config.classShift)
        .mod(3).add(1).toInt()
    if (config.isolatedClass) {
        sourceClass = sourceI.add(sourceJ).mod(2).add(1).toInt()
            .where(sourceI.eq(8).and(sourceJ.eq(8)), 3)
    }
    const lookupImage = sourceClass.updateMask(sourceMask).unmask(SENTINEL).rename('observedClass')
        .addBands(sourceMask.unmask(0).rename('observedMask'))
        .setDefaultProjection(sourceProjection)
    const layouts = [
        {stratum: 1, diameter: 32},
        {stratum: 2, diameter: 64},
        {stratum: 3, diameter: 128}
    ].map(layout => ({
        ...layout,
        diameter: layout.diameter * (config.diameterFactor || 1),
        dx: layout.diameter * (config.diameterFactor || 1) * SQRT3,
        dy: layout.diameter * (config.diameterFactor || 1) * 1.5,
        originX: config.origin.x,
        originY: config.origin.y
    }))
    const sourcePixelSize = Math.max(Math.abs(config.source.transform[0]), Math.abs(config.source.transform[4]))
    return {
        ...config,
        arrangementProjection,
        arrangementBaseProjection,
        coordinateProjection,
        sourceProjection,
        sourceBaseProjection,
        sourcePixelSize,
        vectorizationPadding: sourcePixelSize * 2,
        nominationRadius: config.nominationRadius,
        region,
        sourceClass,
        sourceMask,
        lookupImage,
        layouts
    }
}

const exactPoint = ({scenario, layout, i, j}) => {
    const eeI = ee.Number(i).toInt()
    const eeJ = ee.Number(j).toInt()
    const parity = eeJ.mod(2).add(2).mod(2)
    const dx = ee.Number(layout.dx)
    const dy = ee.Number(layout.dy)
    const x = ee.Number(layout.originX).add(eeI.multiply(dx))
        .add(parity.multiply(dx.divide(2)))
    const y = ee.Number(layout.originY).add(eeJ.multiply(dy))
    return {
        x,
        y,
        geometry: ee.Geometry.Point([x, y], scenario.arrangementBaseProjection)
    }
}

const residueOf = (i, j) => ee.Number(j).mod(32).add(32).mod(32).multiply(16)
    .add(ee.Number(i).mod(16).add(16).mod(16)).toInt()

const rawReference = scenario => ee.FeatureCollection(scenario.layouts.map(layout => {
    const rows = ee.List.sequence(-20, 20).map(j => ee.List.sequence(-20, 20).map(i => {
        const point = exactPoint({scenario, layout, i, j})
        const sourceGrid = point.geometry.transform(scenario.sourceProjection, ERROR_MARGIN).coordinates()
        const residue = residueOf(i, j)
        return ee.Feature(point.geometry, {
            stratum: layout.stratum,
            i,
            j,
            level: ee.List(NESTED_LEVELS).get(residue),
            key: ee.Number(layout.stratum).format('%d')
                .cat(':').cat(ee.Number(i).format('%d')).cat(':').cat(ee.Number(j).format('%d')),
            arrangementX: point.x,
            arrangementY: point.y,
            sourceU: sourceGrid.get(0),
            sourceV: sourceGrid.get(1)
        })
    }).flatten())
    return ee.FeatureCollection(rows.flatten())
})).flatten().filterBounds(scenario.region)

const exactLookup = ({scenario, collection}) => scenario.lookupImage.reduceRegions({
    collection,
    reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
    crs: scenario.sourceProjection,
    tileScale: 4,
    maxPixelsPerRegion: 1
})
    .filter(ee.Filter.eq('observedMask', 1))
    .filter(ee.Filter.equals({leftField: 'stratum', rightField: 'observedClass'}))

const layoutParameterImages = scenario => {
    const strata = scenario.layouts.map(({stratum}) => stratum)
    const remap = (values, defaultValue) => scenario.sourceClass.remap(strata, values, defaultValue)
    return {
        layoutIndex: remap(scenario.layouts.map((_layout, index) => index), -1).toInt(),
        dx: remap(scenario.layouts.map(({dx}) => dx), 0).toDouble(),
        dy: remap(scenario.layouts.map(({dy}) => dy), 0).toDouble(),
        originX: remap(scenario.layouts.map(({originX}) => originX), 0).toDouble(),
        originY: remap(scenario.layouts.map(({originY}) => originY), 0).toDouble()
    }
}

const latticeRowImage = ({projected, dx, dy, originX, originY, j}) => {
    const parity = j.mod(2).add(2).mod(2)
    const i = projected.x.subtract(originX).subtract(parity.multiply(dx.divide(2)))
        .divide(dx).round().toInt()
    const x = originX.add(i.multiply(dx)).add(parity.multiply(dx.divide(2)))
    const y = originY.add(j.multiply(dy))
    return {
        i,
        j,
        distance: projected.x.subtract(x).pow(2).add(projected.y.subtract(y).pow(2))
    }
}

const meaningfullyLessImage = (left, right) => {
    const tolerance = left.abs().add(right.abs())
        .multiply(DISTANCE_TIE_RELATIVE_EPSILON)
        .add(DISTANCE_TIE_ABSOLUTE_EPSILON)
    return left.lt(right.subtract(tolerance))
}

const nearestHexTwoRows = ({projected, dx, dy, originX, originY}) => {
    const lowerJ = projected.y.subtract(originY).divide(dy).floor().toInt()
    const lower = latticeRowImage({projected, dx, dy, originX, originY, j: lowerJ})
    const upper = latticeRowImage({projected, dx, dy, originX, originY, j: lowerJ.add(1).toInt()})
    const useUpper = meaningfullyLessImage(upper.distance, lower.distance)
    return {
        i: lower.i.where(useUpper, upper.i).toInt(),
        j: lower.j.where(useUpper, upper.j).toInt(),
        distance: lower.distance.where(useUpper, upper.distance).toDouble()
    }
}

const nearestHexFiveRows = ({projected, dx, dy, originX, originY}) => {
    const baseJ = projected.y.subtract(originY).divide(dy).floor().toInt()
    let best = {
        i: ee.Image(0).toInt(),
        j: ee.Image(0).toInt(),
        distance: ee.Image(1e30).toDouble()
    }
    for (let rowOffset = -2; rowOffset <= 2; rowOffset++) {
        const candidate = latticeRowImage({
            projected,
            dx,
            dy,
            originX,
            originY,
            j: baseJ.add(rowOffset).toInt()
        })
        const better = meaningfullyLessImage(candidate.distance, best.distance)
        best = {
            i: best.i.where(better, candidate.i).toInt(),
            j: best.j.where(better, candidate.j).toInt(),
            distance: best.distance.where(better, candidate.distance).toDouble()
        }
    }
    return best
}

const layoutLookup = scenario => ee.List(scenario.layouts.map(value => ee.Dictionary(value)))

const reconstructNomination = ({scenario, feature, layout}) => {
    const i = feature.getNumber('i').toInt()
    const j = feature.getNumber('j').toInt()
    const point = exactPoint({
        scenario,
        layout: {
            dx: layout.getNumber('dx'),
            dy: layout.getNumber('dy'),
            originX: layout.getNumber('originX'),
            originY: layout.getNumber('originY')
        },
        i,
        j
    })
    const stratum = layout.getNumber('stratum').toInt()
    return feature.setGeometry(point.geometry).set({
        stratum,
        i,
        j,
        level: ee.List(NESTED_LEVELS).get(residueOf(i, j)),
        arrangementX: point.x,
        arrangementY: point.y
    })
}

const sourceGridNominations = scenario => {
    if (!(Number(scenario.nominationRadius) > 0)) {
        throw new Error(`A positive nomination radius is required for ${scenario.name}`)
    }
    const ramp = ee.Image.pixelCoordinates(scenario.coordinateProjection).toDouble()
    const projected = affinePoint({
        transform: COORDINATE_TRANSFORM,
        u: ramp.select('x'),
        v: ramp.select('y')
    })
    const parameters = layoutParameterImages(scenario)
    const nearest = nearestHexTwoRows({...parameters, projected})
    const residue = nearest.j.mod(32).add(32).mod(32).multiply(16)
        .add(nearest.i.mod(16).add(16).mod(16))
    const label = parameters.layoutIndex.multiply(512).add(residue).add(1).toInt().rename('label')
    const nominated = scenario.sourceMask.eq(1)
        .and(parameters.layoutIndex.gte(0))
        .and(nearest.distance.lte(Math.pow(scenario.nominationRadius, 2)))
    const vectorizationRegion = scenario.region.buffer(
        scenario.vectorizationPadding,
        ee.ErrorMargin(scenario.sourcePixelSize, 'projected'),
        scenario.sourceBaseProjection
    )
    const vectorized = label.addBands(nearest.i.rename('i')).addBands(nearest.j.rename('j'))
        .updateMask(nominated)
        .reduceToVectors({
            reducer: ee.Reducer.first().forEach(['i', 'j']),
            geometry: vectorizationRegion,
            crs: scenario.sourceProjection,
            geometryType: 'centroid',
            geometryInNativeProjection: true,
            eightConnected: false,
            labelProperty: 'label',
            maxPixels: 1e13,
            bestEffort: false
        })
    const layouts = layoutLookup(scenario)
    const nominations = vectorized.map(feature => {
        const layoutIndexValue = feature.getNumber('label').subtract(1).divide(512).floor().toInt()
        return reconstructNomination({
            scenario,
            feature,
            layout: ee.Dictionary(layouts.get(layoutIndexValue))
        })
    }).filterBounds(scenario.region)
        .select(['stratum', 'i', 'j', 'level', 'arrangementX', 'arrangementY'])
    return {nominations, vectorized}
}

const exactCandidatesFromReadyNominations = ({scenario, nominations}) => {
    const numericDistinct = nominations.distinct(['stratum', 'i', 'j'])
    const byStratum = ee.Dictionary.fromLists(
        scenario.layouts.map(({stratum}) => String(stratum)),
        scenario.layouts.map(layout => ee.Dictionary(layout))
    )
    const reconstructedDistinct = numericDistinct.map(feature => {
        const stratum = feature.getNumber('stratum').toInt()
        return reconstructNomination({
            scenario,
            feature,
            layout: ee.Dictionary(byStratum.get(stratum.format('%d')))
        })
    }).select(sourceGridExportProperties)
    const lookup = exactLookup({scenario, collection: reconstructedDistinct})
    const candidates = lookup.select(sourceGridExportProperties)
    return {numericDistinct, reconstructedDistinct, lookup, candidates}
}

const withDiagnosticKey = collection => collection.map(feature => {
    const stratum = feature.getNumber('stratum').toInt()
    const i = feature.getNumber('i').toInt()
    const j = feature.getNumber('j').toInt()
    return feature.set('key', stratum.format('%d')
        .cat(':').cat(i.format('%d')).cat(':').cat(j.format('%d')))
})

const maximumSourcePixelRadius = scenario => {
    const cells = ee.FeatureCollection(ee.List.sequence(0, 15).map(j =>
        ee.List.sequence(0, 15).map(i => {
            const transformed = (x, y) => ee.Geometry.Point([x, y], scenario.sourceProjection)
                .transform(scenario.arrangementBaseProjection, ERROR_MARGIN).coordinates()
            const centre = transformed(ee.Number(i).add(0.5), ee.Number(j).add(0.5))
            const cx = ee.Number(centre.get(0))
            const cy = ee.Number(centre.get(1))
            const radii = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([di, dj]) => {
                const corner = transformed(ee.Number(i).add(di), ee.Number(j).add(dj))
                return ee.Number(corner.get(0)).subtract(cx).pow(2)
                    .add(ee.Number(corner.get(1)).subtract(cy).pow(2)).sqrt()
            })
            return ee.Feature(null, {radius: ee.Number(ee.List(radii).reduce(ee.Reducer.max()))})
        }).flatten()
    ).flatten())
    return cells.aggregate_max('radius')
}

const positiveMod = (value, modulus) => ((value % modulus) + modulus) % modulus

const latticeRowValue = ({x, y, layout, j}) => {
    const parity = positiveMod(j, 2)
    const i = Math.round((x - layout.originX - parity * layout.dx / 2) / layout.dx)
    const candidateX = layout.originX + i * layout.dx + parity * layout.dx / 2
    const candidateY = layout.originY + j * layout.dy
    return {i, j, distance: Math.pow(x - candidateX, 2) + Math.pow(y - candidateY, 2)}
}

const meaningfullyLessValue = (left, right) => {
    const tolerance = (Math.abs(left) + Math.abs(right)) * DISTANCE_TIE_RELATIVE_EPSILON
        + DISTANCE_TIE_ABSOLUTE_EPSILON
    return left < right - tolerance
}

const nearestHexTwoRowsValue = ({x, y, layout}) => {
    const lowerJ = Math.floor((y - layout.originY) / layout.dy)
    const lower = latticeRowValue({x, y, layout, j: lowerJ})
    const upper = latticeRowValue({x, y, layout, j: lowerJ + 1})
    return meaningfullyLessValue(upper.distance, lower.distance) ? upper : lower
}

const nearestHexFiveRowsValue = ({x, y, layout}) => {
    const baseJ = Math.floor((y - layout.originY) / layout.dy)
    let best = {i: 0, j: 0, distance: 1e30}
    for (let rowOffset = -2; rowOffset <= 2; rowOffset++) {
        const candidate = latticeRowValue({x, y, layout, j: baseJ + rowOffset})
        if (meaningfullyLessValue(candidate.distance, best.distance)) {
            best = candidate
        }
    }
    return best
}

const pureBoundaryRoundingControls = () => {
    const summaries = finiteConfigs.map(config => {
        const layouts = [32, 64, 128].map(diameter => ({
            diameter: diameter * (config.diameterFactor || 1),
            dx: diameter * (config.diameterFactor || 1) * SQRT3,
            dy: diameter * (config.diameterFactor || 1) * 1.5,
            originX: config.origin.x,
            originY: config.origin.y
        }))
        const controls = layouts.flatMap(layout =>
            [-3, -2, -1, 0, 1, 2].flatMap(j => [-2, 0, 2].flatMap(i => {
                const parity = positiveMod(j, 2)
                const nextParity = positiveMod(j + 1, 2)
                const ax = layout.originX + i * layout.dx + parity * layout.dx / 2
                const ay = layout.originY + j * layout.dy
                const bx = layout.originX + i * layout.dx + nextParity * layout.dx / 2
                const by = layout.originY + (j + 1) * layout.dy
                return [-1e-7, 0, 1e-7].map(offset => {
                    const x = (ax + bx) / 2 + (bx - ax) * offset
                    const y = (ay + by) / 2 + (by - ay) * offset
                    const two = nearestHexTwoRowsValue({x, y, layout})
                    const five = nearestHexFiveRowsValue({x, y, layout})
                    return {
                        mismatch: two.i !== five.i || two.j !== five.j,
                        tieChoiceMismatch: offset === 0 && two.j !== j,
                        epsilonChoiceMismatch: offset < 0 && two.j !== j
                            || offset > 0 && two.j !== j + 1,
                        exactTie: offset === 0,
                        negativeIndexCase: i < 0 || j < 0
                    }
                })
            }))
        )
        return {
            name: config.name,
            controls: controls.length,
            mismatches: controls.filter(({mismatch}) => mismatch).length,
            exactTieControls: controls.filter(({exactTie}) => exactTie).length,
            tieChoiceMismatches: controls.filter(({tieChoiceMismatch}) => tieChoiceMismatch).length,
            epsilonChoiceMismatches: controls.filter(({epsilonChoiceMismatch}) => epsilonChoiceMismatch).length,
            negativeIndexControls: controls.filter(({negativeIndexCase}) => negativeIndexCase).length,
            layoutDiameters: layouts.map(({diameter}) => diameter)
        }
    })
    const failed = summaries.filter(summary => summary.mismatches
        || summary.tieChoiceMismatches
        || summary.epsilonChoiceMismatches
        || !summary.exactTieControls
        || !summary.negativeIndexControls)
    if (failed.length) {
        throw new Error(`Pure two-row boundary oracle failed: ${JSON.stringify(failed)}`)
    }
    return summaries
}

const nearestRoundingDiagnostic = scenario => {
    const ramp = ee.Image.pixelCoordinates(scenario.coordinateProjection).toDouble()
    const projected = affinePoint({
        transform: COORDINATE_TRANSFORM,
        u: ramp.select('x'),
        v: ramp.select('y')
    })
    const parameters = layoutParameterImages(scenario)
    const two = nearestHexTwoRows({...parameters, projected})
    const five = nearestHexFiveRows({...parameters, projected})
    const eligible = scenario.sourceMask.eq(1).and(parameters.layoutIndex.gte(0))
    const mismatch = two.i.neq(five.i).or(two.j.neq(five.j)).updateMask(eligible)
    const imageCounts = ee.Dictionary({
        tested: eligible.updateMask(eligible).reduceRegion({
            reducer: ee.Reducer.count(),
            geometry: scenario.region,
            crs: scenario.sourceProjection,
            maxPixels: 1e7
        }).values().get(0),
        mismatches: mismatch.reduceRegion({
            reducer: ee.Reducer.sum(),
            geometry: scenario.region,
            crs: scenario.sourceProjection,
            maxPixels: 1e7
        }).values().get(0)
    })
    return ee.Dictionary({
        imageCounts
    })
}

const candidateRecord = feature => ee.Dictionary({
    key: feature.get('key'),
    stratum: feature.get('stratum'),
    i: feature.get('i'),
    j: feature.get('j'),
    level: feature.get('level'),
    arrangementX: feature.get('arrangementX'),
    arrangementY: feature.get('arrangementY'),
    observedClass: feature.get('observedClass'),
    observedMask: feature.get('observedMask'),
    sourceU: feature.get('sourceU'),
    sourceV: feature.get('sourceV')
})

const finiteComparison = config => {
    const scenario = buildFiniteScenario(config)
    const reference = exactLookup({scenario, collection: rawReference(scenario)})
    const stage1 = sourceGridNominations(scenario)
    const nominationDiagnostics = withDiagnosticKey(stage1.nominations)
    const stage2 = exactCandidatesFromReadyNominations({scenario, nominations: stage1.nominations})
    const referenceRows = reference.map(feature => ee.Feature(null, {
        record: candidateRecord(feature)
    }))
    const proxyRows = withDiagnosticKey(stage2.candidates).map(feature => ee.Feature(null, {
        record: candidateRecord(feature)
    }))
    const minimumHalfSpacing = Math.min(...scenario.layouts.map(({dx}) => dx / 2))
    const sourceBoundaryCandidates = reference.map(feature => {
        const u = feature.getNumber('sourceU')
        const v = feature.getNumber('sourceV')
        const du = u.subtract(u.round()).abs()
        const dv = v.subtract(v.round()).abs()
        return feature.set({
            sourceBoundaryDistance: du.min(dv),
            sourceCornerDistance: du.max(dv)
        })
    }).filter(ee.Filter.lt('sourceBoundaryDistance', 1e-8))
    return ee.Dictionary({
        name: scenario.name,
        referenceRecords: referenceRows.aggregate_array('record'),
        proxyRecords: proxyRows.aggregate_array('record'),
        nominationKeys: nominationDiagnostics.aggregate_array('key'),
        vectorizedRegions: stage1.vectorized.size(),
        nominations: stage1.nominations.size(),
        distinctNominations: stage2.numericDistinct.size(),
        duplicateNominations: stage1.nominations.size().subtract(stage2.numericDistinct.size()),
        sourceBoundaryCandidates: sourceBoundaryCandidates.size(),
        sourceCornerCandidates: sourceBoundaryCandidates
            .filter(ee.Filter.lt('sourceCornerDistance', 1e-8)).size(),
        referenceByClass: reference.aggregate_histogram('stratum'),
        proxyByClass: stage2.candidates.aggregate_histogram('stratum'),
        maximumTransformedPixelRadius: config.maximumTransformedPixelRadius,
        nearestCoordinateErrorBound: NEAREST_COORDINATE_ERROR_BOUND,
        nominationRadius: scenario.nominationRadius,
        minimumHalfLatticeSpacing: minimumHalfSpacing,
        spacingMargin: ee.Number(minimumHalfSpacing).subtract(scenario.nominationRadius)
    })
}

const summarizeFinite = result => {
    const reference = new Map(result.referenceRecords.map(record => [record.key, record]))
    const proxy = new Map(result.proxyRecords.map(record => [record.key, record]))
    const nominationKeys = new Set(result.nominationKeys)
    const nominationFalseNegatives = [...reference.keys()].filter(key => !nominationKeys.has(key))
    const missing = [...reference.keys()].filter(key => !proxy.has(key))
    const extra = [...proxy.keys()].filter(key => !reference.has(key))
    const propertyMismatches = []
    reference.forEach((expected, key) => {
        const actual = proxy.get(key)
        if (actual && (Number(actual.stratum) !== Number(expected.stratum)
            || Number(actual.i) !== Number(expected.i)
            || Number(actual.j) !== Number(expected.j)
            || Number(actual.level) !== Number(expected.level)
            || Math.abs(Number(actual.arrangementX) - Number(expected.arrangementX)) > 0.001
            || Math.abs(Number(actual.arrangementY) - Number(expected.arrangementY)) > 0.001
            || Number(actual.observedClass) !== Number(expected.stratum)
            || Number(actual.observedMask) !== 1)) {
            propertyMismatches.push(key)
        }
    })
    return {
        name: result.name,
        referenceCandidates: reference.size,
        proxyCandidates: proxy.size,
        vectorizedRegions: result.vectorizedRegions,
        nominations: result.nominations,
        distinctNominations: result.distinctNominations,
        duplicateNominations: result.duplicateNominations,
        nominationInflation: reference.size ? result.nominations / reference.size : null,
        nominationFalseNegatives: nominationFalseNegatives.length,
        sourceBoundaryCandidates: result.sourceBoundaryCandidates,
        sourceCornerCandidates: result.sourceCornerCandidates,
        referenceByClass: result.referenceByClass,
        proxyByClass: result.proxyByClass,
        maximumTransformedPixelRadius: result.maximumTransformedPixelRadius,
        nearestCoordinateErrorBound: result.nearestCoordinateErrorBound,
        nominationRadius: result.nominationRadius,
        minimumHalfLatticeSpacing: result.minimumHalfLatticeSpacing,
        spacingMargin: result.spacingMargin,
        missing: missing.length,
        extra: extra.length,
        propertyMismatches: propertyMismatches.length,
        examples: {
            nominationFalseNegatives: nominationFalseNegatives.slice(0, 5),
            missing: missing.slice(0, 5),
            extra: extra.slice(0, 5),
            propertyMismatches: propertyMismatches.slice(0, 5)
        }
    }
}

const wrongGeometryStage2Witness = () => {
    const sourceProjection = ee.Projection(ARRANGEMENT_CRS, [10, 0, -50, 0, -10, 50])
    const sourceCoordinates = ee.Image.pixelCoordinates(sourceProjection)
    const sourceI = sourceCoordinates.select('x').floor().toInt()
    const sourceJ = sourceCoordinates.select('y').floor().toInt()
    const classACell = sourceI.eq(5).and(sourceJ.eq(5))
    const sourceClass = ee.Image.constant(2).where(classACell, 1).toInt()
        .setDefaultProjection(sourceProjection)
    const sourceMask = ee.Image.constant(1).toInt().setDefaultProjection(sourceProjection)
    const scenario = {
        name: 'stage2-deterministic-wrong-persisted-geometry',
        arrangementBaseProjection: ee.Projection(ARRANGEMENT_CRS),
        sourceProjection,
        lookupImage: sourceClass.rename('observedClass')
            .addBands(sourceMask.rename('observedMask')),
        layouts: [{
            stratum: 1,
            dx: 32 * SQRT3,
            dy: 48,
            originX: 5,
            originY: -5
        }]
    }
    const authoritative = {
        stratum: 1,
        i: 0,
        j: 0,
        level: -999,
        arrangementX: -999,
        arrangementY: -999
    }
    const wrongA = ee.Geometry.Point([25, -5], scenario.arrangementBaseProjection)
    const wrongB = ee.Geometry.Point([35, -5], scenario.arrangementBaseProjection)
    const nominations = ee.FeatureCollection([
        ee.Feature(wrongA, authoritative),
        ee.Feature(wrongB, authoritative)
    ])
    const storedLookup = scenario.lookupImage.reduceRegions({
        collection: nominations,
        reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
        crs: sourceProjection,
        maxPixelsPerRegion: 1
    })
    const stage2 = exactCandidatesFromReadyNominations({scenario, nominations})
    const candidate = ee.Feature(stage2.candidates.first())
    const reconstructed = ee.Feature(stage2.reconstructedDistinct.first())
    const exactLookupCandidate = ee.Feature(stage2.lookup.first())
    const displacementFromExactPoint = feature => {
        const coordinates = ee.Feature(feature).geometry()
            .transform(scenario.arrangementBaseProjection, ERROR_MARGIN)
            .coordinates()
        return ee.Number(coordinates.get(0)).subtract(5).pow(2)
            .add(ee.Number(coordinates.get(1)).add(5).pow(2))
            .sqrt()
    }
    return ee.Dictionary({
        scenario: scenario.name,
        inputRows: nominations.size(),
        inputDistinctTuples: nominations.distinct(['stratum', 'i', 'j']).size(),
        stage2DistinctTuples: stage2.numericDistinct.size(),
        reconstructedRows: stage2.reconstructedDistinct.size(),
        exactCandidateRows: stage2.candidates.size(),
        targetStratum: 1,
        targetI: 0,
        targetJ: 0,
        targetLevel: NESTED_LEVELS[0],
        wrongPersistedClasses: storedLookup.aggregate_array('observedClass'),
        wrongPersistedMasks: storedLookup.aggregate_array('observedMask'),
        wrongGeometryDisplacementsMetres: [
            wrongA.distance(ee.Geometry.Point([5, -5], scenario.arrangementBaseProjection), ERROR_MARGIN),
            wrongB.distance(ee.Geometry.Point([5, -5], scenario.arrangementBaseProjection), ERROR_MARGIN)
        ],
        reconstructedGeometryDisplacementMetres: displacementFromExactPoint(reconstructed),
        candidateGeometryDisplacementMetres: displacementFromExactPoint(candidate),
        exactObservedClass: exactLookupCandidate.get('observedClass'),
        exactObservedMask: exactLookupCandidate.get('observedMask'),
        candidateStratum: candidate.get('stratum'),
        candidateI: candidate.get('i'),
        candidateJ: candidate.get('j'),
        candidateLevel: candidate.get('level'),
        candidateProperties: candidate.propertyNames()
    })
}

const assertWrongGeometryStage2Witness = result => {
    const candidateProperties = result.candidateProperties || []
    const wrongClasses = result.wrongPersistedClasses.map(Number)
    const wrongDisplacements = result.wrongGeometryDisplacementsMetres.map(Number)
    const discrepancies = {
        inputRows: Number(result.inputRows) !== 2,
        inputDistinctTuples: Number(result.inputDistinctTuples) !== 1,
        stage2DistinctTuples: Number(result.stage2DistinctTuples) !== 1,
        reconstructedRows: Number(result.reconstructedRows) !== 1,
        exactCandidateRows: Number(result.exactCandidateRows) !== 1,
        wrongClassesAreClassB: wrongClasses.length !== 2 || wrongClasses.some(value => value !== 2),
        wrongMasksAreEligible: result.wrongPersistedMasks.map(Number).some(value => value !== 1),
        wrongGeometriesDifferFromTarget: wrongDisplacements.some(value => !(value > 0.5)),
        reconstructedGeometry: Number(result.reconstructedGeometryDisplacementMetres) > 1e-6,
        candidateGeometry: Number(result.candidateGeometryDisplacementMetres) > 1e-6,
        exactObservedClass: Number(result.exactObservedClass) !== Number(result.targetStratum),
        exactObservedMask: Number(result.exactObservedMask) !== 1,
        candidateStratum: Number(result.candidateStratum) !== Number(result.targetStratum),
        candidateI: Number(result.candidateI) !== Number(result.targetI),
        candidateJ: Number(result.candidateJ) !== Number(result.targetJ),
        candidateLevel: Number(result.candidateLevel) !== Number(result.targetLevel),
        missingProperties: sourceGridExportProperties.some(property => !candidateProperties.includes(property)),
        lookupPropertiesRetained: ['observedClass', 'observedMask']
            .some(property => candidateProperties.includes(property))
    }
    const failures = Object.entries(discrepancies)
        .filter(([_property, failed]) => failed)
        .map(([property]) => property)
    if (failures.length) {
        throw new Error(`Wrong-geometry stage-2 witness failed: ${JSON.stringify({failures, result})}`)
    }
    return {...result, failures}
}

const finiteRadius = config => {
    const scenario = buildFiniteScenario({...config, nominationRadius: 1})
    return maximumSourcePixelRadius(scenario)
}

const finiteRounding = config => nearestRoundingDiagnostic(
    buildFiniteScenario({...config, nominationRadius: 1})
)

const sudanLayoutValues = ({area, sampleSize}, densityOffset = 0) => {
    const targetDiameter = Math.sqrt(area / sampleSize / (1.5 * SQRT3)) * BASE_GRID_SLACK
    const baseExponent = Math.floor(Math.log(targetDiameter) / Math.LN2)
    const targetExponent = baseExponent - densityOffset
    const minimumDiameter = Math.max(
        SUDAN_MINIMUM_DISTANCE,
        SUDAN_STRATIFICATION_SCALE * 2
    ) / SQRT3
    const minimumExponent = Math.ceil(Math.log(minimumDiameter) / Math.LN2)
    const exponent = Math.max(targetExponent, minimumExponent)
    const diameter = Math.pow(2, exponent)
    return {
        baseExponent,
        minimumExponent,
        maximumDensityOffset: Math.min(
            MAX_DENSITY_OFFSETS,
            Math.max(0, baseExponent - minimumExponent)
        ),
        exponent,
        diameter,
        dx: diameter * SQRT3,
        dy: diameter * 1.5
    }
}

const buildSudanScenario = ({
    tileRadiusMetres = null,
    nominationRadius = null,
    densityOffset = 0
} = {}) => {
    const arrangement = {crs: ARRANGEMENT_CRS, transform: [1, 0, 0, 0, -1, 0]}
    const arrangementProjection = ee.Projection(arrangement.crs, arrangement.transform)
    const arrangementBaseProjection = ee.Projection(arrangement.crs)
    const coordinateProjection = ee.Projection(arrangement.crs, COORDINATE_TRANSFORM)
    const sourceProjection = ee.Projection(SUDAN_STRATIFICATION_CRS).atScale(SUDAN_STRATIFICATION_SCALE)
    const sourceBaseProjection = ee.Projection(SUDAN_STRATIFICATION_CRS)
    const aoi = ee.FeatureCollection(SUDAN_AOI_ASSET)
        .filter(ee.Filter.eq('id', SUDAN_AOI_KEY))
        .geometry(ee.ErrorMargin(1, 'meters'))
    const region = tileRadiusMetres
        ? ee.Geometry.Point([32.55, 15.55], 'EPSG:4326')
            .transform(arrangementBaseProjection, ee.ErrorMargin(1, 'meters'))
            .buffer(
                tileRadiusMetres,
                ee.ErrorMargin(10, 'projected'),
                arrangementBaseProjection
            )
            .bounds(ee.ErrorMargin(10, 'projected'), arrangementBaseProjection)
            .intersection(aoi, ee.ErrorMargin(10, 'meters'))
        : aoi
    const source = ee.Image(SUDAN_SOURCE_ASSET).select(SUDAN_SOURCE_BAND)
    const sourceClass = source.unmask(SENTINEL).toInt()
    const sourceMask = source.mask().unmask(0).gt(0).toInt()
    const lookupImage = sourceClass.rename('observedClass').addBands(sourceMask.rename('observedMask'))
        .setDefaultProjection(sourceProjection)
    const seed = ee.Number(2)
    const randomOrigin = ee.FeatureCollection([ee.Feature(null, null)])
        .randomColumn('x', seed.add(2))
        .randomColumn('y', seed.add(3))
        .first()
    const rootOrigin = {
        x: ee.Number(randomOrigin.get('x')).multiply(SQRT3 * Math.pow(2, MAX_LATTICE_EXPONENT)),
        y: ee.Number(randomOrigin.get('y')).multiply(3 * Math.pow(2, MAX_LATTICE_EXPONENT))
    }
    const layouts = SUDAN_ALLOCATION.map(allocation => {
        const values = sudanLayoutValues(allocation, densityOffset)
        return {
            ...allocation,
            ...values,
            originX: rootOrigin.x.mod(values.dx * 16),
            originY: rootOrigin.y.mod(values.dy * 32)
        }
    })
    return {
        name: tileRadiusMetres
            ? `sudan-khartoum-${tileRadiusMetres * 2 / 1000}km-source-grid-tile`
            : 'sudan-full-source-grid',
        arrangement,
        source: {crs: SUDAN_STRATIFICATION_CRS},
        arrangementProjection,
        arrangementBaseProjection,
        coordinateProjection,
        sourceProjection,
        sourceBaseProjection,
        sourcePixelSize: SUDAN_STRATIFICATION_SCALE,
        vectorizationPadding: SUDAN_STRATIFICATION_SCALE * 2,
        densityOffset,
        nominationRadius,
        region,
        sourceClass,
        sourceMask,
        lookupImage,
        layouts
    }
}

const sudanRadiusControlMesh = scenario => {
    const ring = ee.List(scenario.region.bounds(
        ee.ErrorMargin(10, 'projected'),
        scenario.sourceProjection
    ).coordinates().get(0))
    const us = ring.map(point => ee.List(point).getNumber(0))
    const vs = ring.map(point => ee.List(point).getNumber(1))
    const minU = ee.Number(us.reduce(ee.Reducer.min())).floor()
    const maxU = ee.Number(us.reduce(ee.Reducer.max())).ceil()
    const minV = ee.Number(vs.reduce(ee.Reducer.min())).floor()
    const maxV = ee.Number(vs.reduce(ee.Reducer.max())).ceil()
    const mesh = ee.FeatureCollection(ee.List.sequence(0, CONTROL_MESH_STEPS).map(vStep =>
        ee.List.sequence(0, CONTROL_MESH_STEPS).map(uStep => {
            const u = minU.add(maxU.subtract(minU).multiply(uStep).divide(CONTROL_MESH_STEPS)).floor()
            const v = minV.add(maxV.subtract(minV).multiply(vStep).divide(CONTROL_MESH_STEPS)).floor()
            const transformed = (du, dv) => ee.Geometry.Point([
                u.add(du),
                v.add(dv)
            ], scenario.sourceProjection).transform(
                scenario.arrangementBaseProjection,
                ERROR_MARGIN
            ).coordinates()
            const centre = transformed(0.5, 0.5)
            const cx = ee.Number(centre.get(0))
            const cy = ee.Number(centre.get(1))
            const radii = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([du, dv]) => {
                const corner = transformed(du, dv)
                return ee.Number(corner.get(0)).subtract(cx).pow(2)
                    .add(ee.Number(corner.get(1)).subtract(cy).pow(2)).sqrt()
            })
            return ee.Feature(null, {
                u,
                v,
                radius: ee.Number(ee.List(radii).reduce(ee.Reducer.max())),
                projectedExtremum: ee.Number(uStep).eq(0).or(ee.Number(uStep).eq(CONTROL_MESH_STEPS))
                    .and(ee.Number(vStep).eq(0).or(ee.Number(vStep).eq(CONTROL_MESH_STEPS)))
            })
        }).flatten()
    ).flatten())
    return ee.Dictionary({
        controlCells: mesh.size(),
        projectedExtrema: mesh.filter(ee.Filter.eq('projectedExtremum', 1)).size(),
        maximumTransformedPixelRadius: mesh.aggregate_max('radius'),
        examples: mesh.sort('radius', false).limit(5).aggregate_array('radius')
    })
}

const serializedExpression = value => {
    const serialized = value.serialize()
    return typeof serialized === 'string' ? serialized : JSON.stringify(serialized)
}

const graphCharacteristics = value => {
    const serialized = serializedExpression(value)
    const count = pattern => (serialized.match(pattern) || []).length
    const functionNames = [...serialized.matchAll(/"functionName":"([^"]+)"/g)]
        .map(match => match[1])
    const relevantFunctionHistogram = functionNames
        .filter(name => /reduce|distinct|resample|focal|format|cat/i.test(name))
        .reduce((histogram, name) => ({...histogram, [name]: (histogram[name] || 0) + 1}), {})
    return {
        serializedBytes: Buffer.byteLength(serialized),
        resampleNodes: count(/Image\.resample/g),
        reduceToVectorsNodes: count(/Image\.reduceToVectors/g),
        reduceRegionsNodes: count(/Image\.reduceRegions/g),
        focalMaxNodes: count(/Image\.focalMax/g),
        reduceResolutionNodes: count(/Image\.reduceResolution/g),
        sampleRegionsNodes: count(/Image\.sampleRegions/g),
        distinctNodes: count(/Collection\.distinct/g),
        numberFormatNodes: count(/Number\.format/g),
        stringCatNodes: count(/String\.cat/g),
        relevantFunctionHistogram,
        containsObservedClass: serialized.includes('observedClass'),
        containsObservedMask: serialized.includes('observedMask'),
        containsDiagnosticSource: serialized.includes('"source"')
    }
}

const sourceGridExportProperties = [
    'stratum', 'i', 'j', 'level', 'arrangementX', 'arrangementY'
]

const historicalGraph = {
    serializedBytes: 59982,
    resampleNodes: 1,
    reduceToVectorsNodes: 1,
    reduceRegionsNodes: 1,
    focalMaxNodes: 0,
    reduceResolutionNodes: 0,
    sampleRegionsNodes: 0,
    distinctNodes: 1
}

const assertStage1Graph = graph => {
    const expected = {
        reduceToVectorsNodes: 1,
        reduceRegionsNodes: 0,
        sampleRegionsNodes: 0,
        resampleNodes: 0,
        focalMaxNodes: 0,
        reduceResolutionNodes: 0,
        distinctNodes: 0,
        numberFormatNodes: 0,
        stringCatNodes: 0,
        containsObservedClass: false,
        containsObservedMask: false,
        containsDiagnosticSource: false
    }
    const mismatches = Object.entries(expected)
        .filter(([property, value]) => graph[property] !== value)
        .map(([property, value]) => ({property, expected: value, actual: graph[property]}))
    if (mismatches.length) {
        throw new Error(`Stage-1 graph contract failed: ${JSON.stringify(mismatches)}`)
    }
}

const fullSudanWorkload = scenario => ({
    aoiAreaSquareMetres: 1843058575134.7393,
    nativeSourcePixels: 1843058575134.7393 / Math.pow(SUDAN_STRATIFICATION_SCALE, 2),
    classSpecificLatticeEstimate: scenario.layouts.reduce((total, layout) =>
        total + layout.area / (layout.dx * layout.dy), 0),
    layouts: scenario.layouts.map(({stratum, diameter, dx, dy, area}) => ({
        stratum,
        diameter,
        dx,
        dy,
        classSpecificEstimate: area / (dx * dy)
    }))
})

const densestSudanRepairOffset = () => Math.max(
    ...SUDAN_ALLOCATION.map(allocation => sudanLayoutValues(allocation).maximumDensityOffset)
)

const MAX_DIAGNOSTIC_PAYLOAD_BYTES = 8 * 1024 * 1024

const evaluateBounded = async ({scenario, checkpoint, value}) => {
    const serializedBytes = Buffer.byteLength(serializedExpression(value))
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_DIAGNOSTIC_PAYLOAD',
        scenario,
        operation: checkpoint,
        serializedBytes,
        maximumBytes: MAX_DIAGNOSTIC_PAYLOAD_BYTES,
        status: serializedBytes < MAX_DIAGNOSTIC_PAYLOAD_BYTES ? 'PASS' : 'FAIL'
    }))
    if (serializedBytes >= MAX_DIAGNOSTIC_PAYLOAD_BYTES) {
        throw new Error(`Diagnostic payload is not comfortably below 10 MiB: ${JSON.stringify({
            scenario,
            checkpoint,
            serializedBytes
        })}`)
    }
    return {
        serializedBytes,
        result: await evaluate(value)
    }
}

const prepareFiniteConfig = (config, preparation) => {
    const maximumTransformedPixelRadius = Number(preparation.maximumTransformedPixelRadius)
    const nominationRadius = maximumTransformedPixelRadius
        + NEAREST_COORDINATE_ERROR_BOUND
        + NOMINATION_NUMERICAL_MARGIN
    const minimumHalfSpacing = Math.min(...[32, 64, 128]
        .map(diameter => diameter * (config.diameterFactor || 1) * SQRT3 / 2))
    const rounding = preparation.rounding
    const imageMismatches = Number(rounding.imageCounts.mismatches || 0)
    if (!Number(rounding.imageCounts.tested)
        || imageMismatches) {
        throw new Error(`Two-row rounding differs from the five-row oracle: ${JSON.stringify(preparation)}`)
    }
    if (!(nominationRadius < minimumHalfSpacing)) {
        throw new Error(`No safe nomination radius for ${config.name}: ${JSON.stringify({
            maximumTransformedPixelRadius,
            nominationRadius,
            minimumHalfSpacing
        })}`)
    }
    return {
        ...config,
        maximumTransformedPixelRadius,
        nominationRadius,
        rounding
    }
}

const sudanPreflight = radiusEvidence => {
    const measuredRadius = Number(radiusEvidence.maximumTransformedPixelRadius)
    const inflatedPixelRadius = measuredRadius * SUDAN_RADIUS_INFLATION_FACTOR
        + SUDAN_RADIUS_INFLATION_METRES
    const nominationRadius = inflatedPixelRadius
        + NEAREST_COORDINATE_ERROR_BOUND
        + NOMINATION_NUMERICAL_MARGIN
    const scenario = buildSudanScenario({nominationRadius})
    const minimumHalfSpacing = Math.min(...scenario.layouts.map(({dx}) => dx / 2))
    if (!(nominationRadius < minimumHalfSpacing)) {
        throw new Error(`Sudan nomination radius does not fit the lattice-spacing bound: ${JSON.stringify({
            measuredRadius,
            inflatedPixelRadius,
            nominationRadius,
            minimumHalfSpacing
        })}`)
    }
    const nominations = sourceGridNominations(scenario).nominations.select(sourceGridExportProperties)
    const graph = graphCharacteristics(nominations)
    assertStage1Graph(graph)
    return {
        scenario,
        evidence: {
            ...radiusEvidence,
            inflationFactor: SUDAN_RADIUS_INFLATION_FACTOR,
            inflationMetres: SUDAN_RADIUS_INFLATION_METRES,
            inflatedPixelRadius,
            nearestCoordinateErrorBound: NEAREST_COORDINATE_ERROR_BOUND,
            numericalMargin: NOMINATION_NUMERICAL_MARGIN,
            nominationRadius,
            minimumHalfSpacing,
            remainingSpacingMargin: minimumHalfSpacing - nominationRadius
        },
        graph,
        workload: fullSudanWorkload(scenario)
    }
}

const isNotFound = error => /not found|does not exist|404/i.test(String(error))
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const cleanupAsset = async assetId => {
    try {
        await callbackPromise(callback =>
            ee.data.deleteAsset(assetId, (result, error) => callback(result, error))
        )
    } catch (error) {
        if (!isNotFound(error)) {
            throw error
        }
    }
    const startedAt = Date.now()
    for (;;) {
        try {
            await callbackPromise(callback =>
                ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
            )
        } catch (error) {
            if (isNotFound(error)) {
                return {assetId, absent: true, elapsedSeconds: (Date.now() - startedAt) / 1000}
            }
            throw error
        }
        if (Date.now() - startedAt > 120000) {
            throw new Error(`Temporary asset still exists after cleanup timeout: ${assetId}`)
        }
        await sleep(MODEST_POLL_INTERVAL_MS)
    }
}

const waitForVisibility = async assetId => {
    const startedAt = Date.now()
    const ledger = []
    for (const delay of VISIBILITY_DELAYS_MS) {
        await sleep(delay)
        try {
            await callbackPromise(callback =>
                ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
            )
            ledger.push({elapsedSeconds: (Date.now() - startedAt) / 1000, state: 'VISIBLE'})
            return {elapsedSeconds: (Date.now() - startedAt) / 1000, ledger}
        } catch (error) {
            if (!isNotFound(error)) {
                throw error
            }
            ledger.push({elapsedSeconds: (Date.now() - startedAt) / 1000, state: 'NOT_FOUND'})
        }
    }
    throw new Error(`Modest nomination asset was not visible within 7.5 seconds: ${assetId}`)
}

const waitForTask = async taskId => {
    const history = []
    for (;;) {
        const statuses = await callbackPromise(callback =>
            ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
        )
        const status = statuses[0]
        history.push({
            state: status.state,
            timestamp: Date.now(),
            eecu: Number(status.batch_eecu_usage_seconds || 0)
        })
        if (!['READY', 'RUNNING'].includes(status.state)) {
            return {status, history}
        }
        await sleep(MODEST_POLL_INTERVAL_MS)
    }
}

const listRelevantTaskState = async () => {
    const tasks = await callbackPromise(callback =>
        ee.data.getTaskList((result, error) => callback(result, error))
    )
    const taskRows = Array.isArray(tasks) ? tasks : tasks?.tasks
    if (!Array.isArray(taskRows)) {
        throw new Error(`Unexpected task-list response: ${JSON.stringify(Object.keys(tasks || {}))}`)
    }
    const selected = taskRows
        .filter(task => /sd-systematic-(source-grid|production-baseline)/.test(task.description || ''))
        .map(task => ({
            id: task.id,
            description: task.description,
            state: task.state,
            attempt: Number(task.attempt || 0),
            creationTimestampMs: Number(task.creation_timestamp_ms || 0),
            startTimestampMs: Number(task.start_timestamp_ms || 0),
            updateTimestampMs: Number(task.update_timestamp_ms || 0),
            eecu: Number(task.batch_eecu_usage_seconds || 0),
            errorMessage: task.error_message || null
        }))
    return {
        relevant: selected,
        activeSourceGrid: selected.filter(task =>
            /sd-systematic-source-grid/.test(task.description)
                && ['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(task.state)
        ),
        productionBaseline: selected.filter(task =>
            /sd-systematic-production-baseline/.test(task.description)
        )
    }
}

const sudanStage1Preflight = densityOffset => {
    const scenario = buildSudanScenario({
        nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS,
        densityOffset
    })
    const nominations = sourceGridNominations(scenario).nominations.select(sourceGridExportProperties)
    const graph = graphCharacteristics(nominations)
    assertStage1Graph(graph)
    const minimumHalfSpacing = Math.min(...scenario.layouts.map(({dx}) => dx / 2))
    const remainingSpacingMargin = SUDAN_VERIFIED_NOMINATION_RADIUS < minimumHalfSpacing
        ? minimumHalfSpacing - SUDAN_VERIFIED_NOMINATION_RADIUS
        : 0
    if (!(remainingSpacingMargin > 0)) {
        throw new Error(`Sudan density offset ${densityOffset} has no positive nomination margin: ${JSON.stringify({
            nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS,
            minimumHalfSpacing,
            remainingSpacingMargin
        })}`)
    }
    return {
        densityOffset,
        scenario,
        nominations,
        graph,
        radius: {
            nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS,
            minimumHalfSpacing,
            remainingSpacingMargin
        },
        layouts: scenario.layouts.map(layout => ({
            stratum: layout.stratum,
            baseExponent: layout.baseExponent,
            minimumExponent: layout.minimumExponent,
            maximumDensityOffset: layout.maximumDensityOffset,
            effectiveExponent: layout.exponent,
            diameter: layout.diameter,
            dx: layout.dx,
            dy: layout.dy
        }))
    }
}

const fullSudanStage1Preflight = () => {
    const densestRepairOffset = densestSudanRepairOffset()
    return {
        densestRepairOffset,
        base: sudanStage1Preflight(0),
        densestRepair: sudanStage1Preflight(densestRepairOffset)
    }
}

const waitForSudanTask = async ({
    taskId,
    enforceLimits = true,
    checkpoint = 'SOURCE_GRID_SUDAN_STAGE1_TASK_POLL',
    cancellationCheckpoint = 'SOURCE_GRID_SUDAN_STAGE1_CANCEL_REQUESTED',
    limits = {}
}) => {
    const maxRunningMs = limits.maxRunningMs ?? SUDAN_MAX_RUNNING_MS
    const cancelEecu = limits.cancelEecu ?? SUDAN_CANCEL_EECU
    const hardEecu = limits.hardEecu ?? SUDAN_HARD_EECU
    const cancelOnProjectedEecu = limits.cancelOnProjectedEecu ?? true
    const history = []
    let cancellation = null
    for (;;) {
        const statuses = await callbackPromise(callback =>
            ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
        )
        const status = statuses[0]
        const now = Date.now()
        const eecu = Number(status.batch_eecu_usage_seconds || 0)
        const runningElapsedSeconds = Number(status.start_timestamp_ms)
            ? (now - Number(status.start_timestamp_ms)) / 1000
            : 0
        const runningHistory = history.filter(entry => entry.state === 'RUNNING')
        const previous = runningHistory.at(-1)
        const growthPerSecond = previous && now > previous.timestamp
            ? Math.max(0, eecu - previous.eecu) / ((now - previous.timestamp) / 1000)
            : 0
        const projectedEecuAfterTwoPolls = eecu + growthPerSecond * (SUDAN_POLL_INTERVAL_MS * 2 / 1000)
        const entry = {
            state: status.state,
            timestamp: now,
            runningElapsedSeconds,
            eecu,
            growthPerSecond,
            projectedEecuAfterTwoPolls
        }
        history.push(entry)
        console.log(JSON.stringify({checkpoint, taskId, ...entry}))
        if (!['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(status.state)) {
            return {status, history, cancellation}
        }
        if (enforceLimits && !cancellation && status.state === 'RUNNING') {
            const reason = eecu >= cancelEecu
                ? `EECU reached the cancellation threshold (${eecu} >= ${cancelEecu})`
                : cancelOnProjectedEecu && projectedEecuAfterTwoPolls >= hardEecu
                    ? `Observed growth projects ${projectedEecuAfterTwoPolls} EECU within two polls`
                    : runningElapsedSeconds * 1000 >= maxRunningMs
                        ? `RUNNING time reached ${maxRunningMs / 60000} minutes`
                        : null
            if (reason) {
                await callbackPromise(callback =>
                    ee.data.cancelTask(taskId, (result, error) => callback(result, error))
                )
                cancellation = {requestedAt: Date.now(), reason, requestCount: 1}
                console.log(JSON.stringify({
                    checkpoint: cancellationCheckpoint,
                    taskId,
                    ...cancellation
                }))
            }
        }
        await sleep(SUDAN_POLL_INTERVAL_MS)
    }
}

const waitForFullVisibility = async assetId => {
    const startedAt = Date.now()
    const ledger = []
    for (;;) {
        try {
            await callbackPromise(callback =>
                ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
            )
            ledger.push({elapsedSeconds: (Date.now() - startedAt) / 1000, state: 'VISIBLE'})
            return {elapsedSeconds: (Date.now() - startedAt) / 1000, ledger}
        } catch (error) {
            if (!isNotFound(error)) {
                throw error
            }
            ledger.push({elapsedSeconds: (Date.now() - startedAt) / 1000, state: 'NOT_FOUND'})
        }
        if (Date.now() - startedAt >= 120000) {
            throw new Error(`Sudan nomination asset was not visible within 120 seconds: ${assetId}`)
        }
        await sleep(MODEST_POLL_INTERVAL_MS)
    }
}

const sudanStage1ValidationSummary = ({scenario, assetId}) => {
    const nominations = ee.FeatureCollection(assetId)
    const layouts = ee.Dictionary.fromLists(
        scenario.layouts.map(({stratum}) => String(stratum)),
        scenario.layouts.map(layout => ee.Dictionary(layout))
    )
    const checked = nominations.map(feature => {
        const stratum = feature.getNumber('stratum').toInt()
        const reconstructed = reconstructNomination({
            scenario,
            feature,
            layout: ee.Dictionary(layouts.get(stratum.format('%d')))
        })
        const expectedX = reconstructed.getNumber('arrangementX')
        const expectedY = reconstructed.getNumber('arrangementY')
        const actual = feature.geometry().transform(
            scenario.arrangementBaseProjection,
            ee.ErrorMargin(ERROR_MARGIN, 'meters')
        ).coordinates()
        const actualX = ee.Number(actual.get(0))
        const actualY = ee.Number(actual.get(1))
        const geometryDisplacement = actualX.subtract(expectedX).pow(2)
            .add(actualY.subtract(expectedY).pow(2)).sqrt()
        const propertyDisplacement = feature.getNumber('arrangementX').subtract(expectedX).pow(2)
            .add(feature.getNumber('arrangementY').subtract(expectedY).pow(2)).sqrt()
        return feature.set({
            _geometryType: feature.geometry().type(),
            _geometryDisplacement: geometryDisplacement,
            _propertyDisplacement: propertyDisplacement
        })
    })
    const total = nominations.size()
    const distinct = nominations.distinct(['stratum', 'i', 'j']).size()
    const nonNull = nominations.filter(ee.Filter.notNull(sourceGridExportProperties)).size()
    const firstProperties = ee.Feature(nominations.first()).propertyNames()
    const summary = {
        total,
        distinctNumericTuples: distinct,
        duplicates: total.subtract(distinct),
        rowsMissingRequiredProperties: total.subtract(nonNull),
        firstPropertiesCsv: firstProperties.join(','),
        pointGeometryRows: checked.filter(ee.Filter.eq('_geometryType', 'Point')).size(),
        maximumGeometryDisplacementMetres: checked.aggregate_max('_geometryDisplacement'),
        maximumPropertyDisplacementMetres: checked.aggregate_max('_propertyDisplacement')
    }
    SUDAN_ALLOCATION.forEach(({stratum}) => {
        summary[`stratum_${stratum}_rows`] = nominations.filter(ee.Filter.eq('stratum', stratum)).size()
    })
    return ee.FeatureCollection([ee.Feature(ee.Geometry.Point([0, 0]), summary)])
}

const interpretSudanStage1Validation = result => {
    const firstProperties = result.firstPropertiesCsv
        ? result.firstPropertiesCsv.split(',')
        : []
    const allowedProperties = new Set([...sourceGridExportProperties, 'system:index'])
    const unexpectedProperties = firstProperties.filter(property => !allowedProperties.has(property))
    const missingSchemaProperties = sourceGridExportProperties
        .filter(property => !firstProperties.includes(property))
    const forbiddenProperties = ['key', 'source', 'observedClass', 'observedMask']
        .filter(property => firstProperties.includes(property))
    const valid = Number(result.total) > 0
        && Number(result.rowsMissingRequiredProperties) === 0
        && Number(result.pointGeometryRows) === Number(result.total)
        && Number(result.maximumGeometryDisplacementMetres) <= 0.5
        && Number(result.maximumPropertyDisplacementMetres) <= 1e-6
        && unexpectedProperties.length === 0
        && missingSchemaProperties.length === 0
        && forbiddenProperties.length === 0
    return {
        ...result,
        duplicatesExpectedAtNominationBoundary: true,
        firstProperties,
        unexpectedProperties,
        missingSchemaProperties,
        forbiddenProperties,
        valid
    }
}

const readySudanStage1Validation = async ({scenario, assetId}) => {
    const summary = sudanStage1ValidationSummary({scenario, assetId})
    const result = await evaluate(ee.Feature(summary.first()).toDictionary())
    return interpretSudanStage1Validation(result)
}

const readyModestValidation = async ({scenario, assetId}) => {
    const nominations = ee.FeatureCollection(assetId)
    const reference = exactLookup({scenario, collection: rawReference(scenario)})
    const stage2 = exactCandidatesFromReadyNominations({scenario, nominations})
    const nominationDiagnostics = withDiagnosticKey(nominations)
    const referenceRows = reference.map(feature => ee.Feature(null, {record: candidateRecord(feature)}))
    const proxyRows = withDiagnosticKey(stage2.candidates)
        .map(feature => ee.Feature(null, {record: candidateRecord(feature)}))
    const result = await evaluate(ee.Dictionary({
        name: scenario.name,
        referenceRecords: referenceRows.aggregate_array('record'),
        proxyRecords: proxyRows.aggregate_array('record'),
        nominationKeys: nominationDiagnostics.aggregate_array('key'),
        vectorizedRegions: nominations.size(),
        nominations: nominations.size(),
        distinctNominations: stage2.numericDistinct.size(),
        duplicateNominations: nominations.size().subtract(stage2.numericDistinct.size()),
        sourceBoundaryCandidates: 0,
        sourceCornerCandidates: 0,
        referenceByClass: reference.aggregate_histogram('stratum'),
        proxyByClass: stage2.candidates.aggregate_histogram('stratum'),
        maximumTransformedPixelRadius: scenario.maximumTransformedPixelRadius,
        nearestCoordinateErrorBound: NEAREST_COORDINATE_ERROR_BOUND,
        nominationRadius: scenario.nominationRadius,
        minimumHalfLatticeSpacing: Math.min(...scenario.layouts.map(({dx}) => dx / 2)),
        spacingMargin: Math.min(...scenario.layouts.map(({dx}) => dx / 2)) - scenario.nominationRadius,
        firstProperties: ee.Feature(nominations.first()).propertyNames()
    }))
    const summary = summarizeFinite(result)
    const forbiddenProperties = ['key', 'source', 'observedClass', 'observedMask']
        .filter(property => result.firstProperties.includes(property))
    if (summary.nominationFalseNegatives
        || summary.missing
        || summary.extra
        || summary.propertyMismatches
        || forbiddenProperties.length) {
        throw new Error(`Ready modest nomination validation failed: ${JSON.stringify({summary, forbiddenProperties})}`)
    }
    return {summary, forbiddenProperties, firstProperties: result.firstProperties}
}

const runModestExport = async () => {
    pureBoundaryRoundingControls()
    await authenticate({linkedUser: true})
    const config = finiteConfigs.find(({name}) => name === 'finite-cross-crs-seeded-shift')
    const radius = await evaluateBounded({
        scenario: config.name,
        checkpoint: 'transformed-source-pixel-radius',
        value: finiteRadius(config)
    })
    const rounding = await evaluateBounded({
        scenario: config.name,
        checkpoint: 'image-two-row-five-row-comparison',
        value: finiteRounding(config)
    })
    const prepared = prepareFiniteConfig(config, {
        maximumTransformedPixelRadius: radius.result,
        rounding: rounding.result
    })
    const scenario = buildFiniteScenario(prepared)
    const nominations = sourceGridNominations(scenario).nominations.select(sourceGridExportProperties)
    const graph = graphCharacteristics(nominations)
    assertStage1Graph(graph)
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_systematic_source_grid_nominations_modest_${startedAt}`
    const task = ee.batch.Export.table.toAsset(
        nominations,
        `sd-systematic-source-grid-nominations-modest-${startedAt}`,
        assetId
    )
    task.start()
    let taskResult = null
    let visibility = null
    let validation = null
    let cleanup = null
    try {
        taskResult = await waitForTask(task.id)
        if (taskResult.status.state !== 'COMPLETED') {
            throw new Error(`Modest nomination export failed once: ${JSON.stringify(taskResult.status)}`)
        }
        visibility = await waitForVisibility(assetId)
        validation = await readyModestValidation({scenario, assetId})
    } finally {
        cleanup = await cleanupAsset(assetId)
    }
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_MODEST_NOMINATION_EXPORT',
        status: 'PASS',
        taskId: task.id,
        assetId,
        graph,
        nominationRadius: {
            maximumTransformedPixelRadius: prepared.maximumTransformedPixelRadius,
            nearestCoordinateErrorBound: NEAREST_COORDINATE_ERROR_BOUND,
            numericalMargin: NOMINATION_NUMERICAL_MARGIN,
            radius: prepared.nominationRadius
        },
        task: taskResult,
        runtimeSeconds: (Number(taskResult.status.update_timestamp_ms) - Number(taskResult.status.start_timestamp_ms)) / 1000,
        eecu: Number(taskResult.status.batch_eecu_usage_seconds || 0),
        visibility,
        validation,
        cleanup,
        attempts: 1
    }, null, 2))
}

const runGraphOnly = async () => {
    await authenticate()
    const scenario = buildSudanScenario({nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS})
    const nominations = sourceGridNominations(scenario).nominations.select(sourceGridExportProperties)
    const graph = graphCharacteristics(nominations)
    assertStage1Graph(graph)
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_GRAPH_ONLY',
        status: 'PASS',
        nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS,
        graph,
        eeValueRequests: 0,
        exportsStarted: 0,
        assetsCreated: 0
    }, null, 2))
}

const printableSudanStage1Preflight = preflight => ({
    densestRepairOffset: preflight.densestRepairOffset,
    base: {
        densityOffset: preflight.base.densityOffset,
        graph: preflight.base.graph,
        radius: preflight.base.radius,
        layouts: preflight.base.layouts
    },
    densestRepair: {
        densityOffset: preflight.densestRepair.densityOffset,
        graph: preflight.densestRepair.graph,
        radius: preflight.densestRepair.radius,
        layouts: preflight.densestRepair.layouts
    }
})

const runFullSudanPreflight = async () => {
    await authenticate()
    const preflight = fullSudanStage1Preflight()
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_FULL_STAGE1_PREFLIGHT',
        status: 'PASS',
        ...printableSudanStage1Preflight(preflight),
        exportsStarted: 0,
        assetsCreated: 0
    }, null, 2))
}

const runWrongGeometryStage2Witness = async () => {
    await authenticate()
    const evaluated = await evaluateBounded({
        scenario: 'finite-cross-crs-seeded-shift',
        checkpoint: 'stage2-wrong-persisted-geometry',
        value: wrongGeometryStage2Witness()
    })
    const result = assertWrongGeometryStage2Witness(evaluated.result)
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_STAGE2_WRONG_GEOMETRY_WITNESS',
        status: 'PASS',
        payloadBytes: evaluated.serializedBytes,
        authenticatedValueRequests: 1,
        exportsStarted: 0,
        result
    }, null, 2))
}

const finishSudanStage1Task = async ({taskId, assetId}) => {
    let taskResult
    try {
        taskResult = await waitForSudanTask({taskId})
    } catch (error) {
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_RECOVERY_REQUIRED',
            taskId,
            assetId,
            error: String(error)
        }))
        throw error
    }
    const status = taskResult.status
    const runtimeSeconds = Number(status.start_timestamp_ms) && Number(status.update_timestamp_ms)
        ? (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000
        : null
    if (status.state !== 'COMPLETED') {
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_EXPORT',
            status: 'FAIL',
            taskId,
            assetId,
            task: taskResult,
            runtimeSeconds,
            eecu: Number(status.batch_eecu_usage_seconds || 0),
            assetDisposition: 'retained-until-explicit-cleanup',
            attempts: Number(status.attempt || 1)
        }, null, 2))
        process.exitCode = 1
        return
    }
    let visibility
    try {
        visibility = await waitForFullVisibility(assetId)
    } catch (error) {
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_EXPORT',
            status: 'COMPLETED_VALIDATION_PENDING',
            taskId,
            assetId,
            task: taskResult,
            runtimeSeconds,
            eecu: Number(status.batch_eecu_usage_seconds || 0),
            visibility,
            error: String(error),
            assetDisposition: 'retained-until-analysis-completes',
            attempts: Number(status.attempt || 1)
        }, null, 2))
        return
    }
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_EXPORT',
        status: 'PASS',
        taskId,
        assetId,
        task: taskResult,
        runtimeSeconds,
        eecu: Number(status.batch_eecu_usage_seconds || 0),
        visibility,
        validation: 'deferred-to-separate-read-only-process',
        assetDisposition: 'retained-until-analysis-completes',
        attempts: Number(status.attempt || 1)
    }, null, 2))
}

const runFullSudanExport = async () => {
    await authenticate({linkedUser: true})
    const taskState = await listRelevantTaskState()
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_ACTIVE_TASK_CHECK',
        status: taskState.activeSourceGrid.length ? 'FAIL' : 'PASS',
        ...taskState
    }, null, 2))
    if (taskState.activeSourceGrid.length) {
        throw new Error(`A previous source-grid task is active: ${JSON.stringify(taskState.activeSourceGrid)}`)
    }
    const preflight = fullSudanStage1Preflight()
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_FULL_STAGE1_PREFLIGHT',
        status: 'PASS',
        ...printableSudanStage1Preflight(preflight)
    }, null, 2))
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_systematic_source_grid_nominations_sudan_${startedAt}`
    const description = `sd-systematic-source-grid-nominations-sudan-${startedAt}`
    const task = ee.batch.Export.table.toAsset(preflight.base.nominations, description, assetId)
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_STARTED',
        taskId: task.id,
        assetId,
        startedAt,
        graph: preflight.base.graph,
        radius: preflight.base.radius,
        exportAttempts: 1
    }))
    await finishSudanStage1Task({taskId: task.id, assetId})
}

const recoverFullSudanExport = async () => {
    const taskId = process.env.SD_SOURCE_GRID_TASK_ID
    const assetId = process.env.SD_SOURCE_GRID_ASSET_ID
    if (!taskId || !assetId) {
        throw new Error('SD_SOURCE_GRID_TASK_ID and SD_SOURCE_GRID_ASSET_ID are required for recovery')
    }
    await authenticate({linkedUser: true})
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_RECOVERING',
        taskId,
        assetId,
        exportsStarted: 0
    }))
    await finishSudanStage1Task({taskId, assetId})
}

const validatePreservedSudanAsset = async () => {
    const assetId = process.env.SD_SOURCE_GRID_ASSET_ID
    if (!assetId) {
        throw new Error('SD_SOURCE_GRID_ASSET_ID is required for validation')
    }
    await authenticate({linkedUser: true})
    let validation
    try {
        validation = await readySudanStage1Validation({
            scenario: buildSudanScenario({nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS}),
            assetId
        })
    } catch (error) {
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_VALIDATION',
            status: 'INCOMPLETE',
            assetId,
            error: String(error),
            assetDisposition: 'retained-until-analysis-completes'
        }, null, 2))
        process.exitCode = 1
        return
    }
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_VALIDATION',
        status: validation.valid ? 'PASS' : 'FAIL',
        assetId,
        validation,
        assetDisposition: 'retained-until-analysis-completes'
    }, null, 2))
    if (!validation.valid) {
        process.exitCode = 1
    }
}

const finishBatchSudanValidation = async ({taskId, nominationAssetId, validationAssetId}) => {
    const taskResult = await waitForSudanTask({taskId, enforceLimits: false})
    const status = taskResult.status
    const runtimeSeconds = Number(status.start_timestamp_ms) && Number(status.update_timestamp_ms)
        ? (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000
        : null
    if (status.state !== 'COMPLETED') {
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_BATCH_VALIDATION',
            status: 'FAIL',
            taskId,
            nominationAssetId,
            validationAssetId,
            task: taskResult,
            runtimeSeconds,
            eecu: Number(status.batch_eecu_usage_seconds || 0),
            assetDisposition: 'both-assets-retained-until-analysis-completes',
            attempts: Number(status.attempt || 1)
        }, null, 2))
        process.exitCode = 1
        return
    }
    const visibility = await waitForFullVisibility(validationAssetId)
    const result = await evaluate(
        ee.Feature(ee.FeatureCollection(validationAssetId).first()).toDictionary()
    )
    const validation = interpretSudanStage1Validation(result)
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_BATCH_VALIDATION',
        status: validation.valid ? 'PASS' : 'FAIL',
        taskId,
        nominationAssetId,
        validationAssetId,
        task: taskResult,
        runtimeSeconds,
        eecu: Number(status.batch_eecu_usage_seconds || 0),
        visibility,
        validation,
        assetDisposition: 'both-assets-retained-until-analysis-completes',
        attempts: Number(status.attempt || 1)
    }, null, 2))
    if (!validation.valid) {
        process.exitCode = 1
    }
}

const runBatchSudanValidation = async () => {
    const nominationAssetId = process.env.SD_SOURCE_GRID_ASSET_ID
    if (!nominationAssetId) {
        throw new Error('SD_SOURCE_GRID_ASSET_ID is required for batch validation')
    }
    await authenticate({linkedUser: true})
    await callbackPromise(callback =>
        ee.data.getAsset(nominationAssetId, (asset, error) => callback(asset, error))
    )
    const taskState = await listRelevantTaskState()
    if (taskState.activeSourceGrid.length) {
        throw new Error(`A source-grid task is active: ${JSON.stringify(taskState.activeSourceGrid)}`)
    }
    const scenario = buildSudanScenario({nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS})
    const summary = sudanStage1ValidationSummary({scenario, assetId: nominationAssetId})
    const graph = graphCharacteristics(summary)
    const startedAt = Date.now()
    const validationAssetId = `${ASSET_ROOT}/sd_systematic_source_grid_validation_sudan_${startedAt}`
    const description = `sd-systematic-source-grid-validation-sudan-${startedAt}`
    const task = ee.batch.Export.table.toAsset(summary, description, validationAssetId)
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_VALIDATION_STARTED',
        taskId: task.id,
        nominationAssetId,
        validationAssetId,
        startedAt,
        graph,
        exportAttempts: 1,
        eecuLimit: null
    }))
    await finishBatchSudanValidation({taskId: task.id, nominationAssetId, validationAssetId})
}

const recoverBatchSudanValidation = async () => {
    const taskId = process.env.SD_SOURCE_GRID_VALIDATION_TASK_ID
    const nominationAssetId = process.env.SD_SOURCE_GRID_ASSET_ID
    const validationAssetId = process.env.SD_SOURCE_GRID_VALIDATION_ASSET_ID
    if (!taskId || !nominationAssetId || !validationAssetId) {
        throw new Error('Validation task, nomination asset, and validation asset IDs are required for recovery')
    }
    await authenticate({linkedUser: true})
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_VALIDATION_RECOVERING',
        taskId,
        nominationAssetId,
        validationAssetId,
        exportsStarted: 0,
        eecuLimit: null
    }))
    await finishBatchSudanValidation({taskId, nominationAssetId, validationAssetId})
}

const assertStage2Graph = graph => {
    const expected = {
        reduceToVectorsNodes: 0,
        reduceRegionsNodes: 1,
        sampleRegionsNodes: 0,
        resampleNodes: 0,
        focalMaxNodes: 0,
        reduceResolutionNodes: 0,
        distinctNodes: 1,
        stringCatNodes: 0,
        containsDiagnosticSource: false
    }
    const mismatches = Object.entries(expected)
        .filter(([property, value]) => graph[property] !== value)
        .map(([property, value]) => ({property, expected: value, actual: graph[property]}))
    if (mismatches.length) {
        throw new Error(`Stage-2 graph contract failed: ${JSON.stringify(mismatches)}`)
    }
}

const sudanStage2Validation = ({scenario, assetId}) => {
    const ready = ee.FeatureCollection(assetId)
    const layouts = ee.Dictionary.fromLists(
        scenario.layouts.map(({stratum}) => String(stratum)),
        scenario.layouts.map(layout => ee.Dictionary(layout))
    )
    const reconstructed = ready.map(feature => {
        const stratum = feature.getNumber('stratum').toInt()
        const exact = reconstructNomination({
            scenario,
            feature,
            layout: ee.Dictionary(layouts.get(stratum.format('%d')))
        })
        const expectedX = exact.getNumber('arrangementX')
        const expectedY = exact.getNumber('arrangementY')
        const actualCoordinates = feature.geometry().transform(
            scenario.arrangementBaseProjection,
            ee.ErrorMargin(ERROR_MARGIN, 'meters')
        ).coordinates()
        const geometryDisplacement = ee.Number(actualCoordinates.get(0)).subtract(expectedX).pow(2)
            .add(ee.Number(actualCoordinates.get(1)).subtract(expectedY).pow(2)).sqrt()
        const propertyDisplacement = feature.getNumber('arrangementX').subtract(expectedX).pow(2)
            .add(feature.getNumber('arrangementY').subtract(expectedY).pow(2)).sqrt()
        return exact.set({
            _persistedGeometryType: feature.geometry().type(),
            _geometryDisplacement: geometryDisplacement,
            _propertyDisplacement: propertyDisplacement,
            _levelMismatch: feature.getNumber('level').neq(exact.getNumber('level'))
        })
    })
    const lookedUp = scenario.lookupImage.reduceRegions({
        collection: reconstructed,
        reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
        crs: scenario.sourceProjection,
        tileScale: 4,
        maxPixelsPerRegion: 1
    }).map(feature => feature.set({
        _membershipViolation: feature.getNumber('observedClass')
            .neq(feature.getNumber('stratum')),
        _maskViolation: feature.getNumber('observedMask').neq(1),
        _stratumLevel: feature.getNumber('stratum').format('%d')
            .cat(':').cat(feature.getNumber('level').format())
    }))
    const selection = selectSystematicLevels({
        samples: ready,
        allocation: SUDAN_ALLOCATION,
        strategy: 'CLOSEST'
    })
    const total = ready.size()
    const distinct = ready.distinct(['stratum', 'i', 'j']).size()
    return ee.Dictionary({
        inputNominations: 375785,
        inputDistinctTuples: 374857,
        total,
        distinctNumericTuples: distinct,
        duplicates: total.subtract(distinct),
        perStratumCandidateCounts: ready.aggregate_histogram('stratum'),
        perLevelCandidateCounts: ready.aggregate_histogram('level'),
        perStratumLevelCandidateCounts: lookedUp.aggregate_histogram('_stratumLevel'),
        rowsMissingRequiredProperties: total.subtract(
            ready.filter(ee.Filter.notNull(sourceGridExportProperties)).size()
        ),
        firstProperties: ee.Feature(ready.first()).propertyNames(),
        pointGeometryRows: lookedUp.filter(ee.Filter.eq('_persistedGeometryType', 'Point')).size(),
        maximumGeometryDisplacementMetres: lookedUp.aggregate_max('_geometryDisplacement'),
        maximumPropertyDisplacementMetres: lookedUp.aggregate_max('_propertyDisplacement'),
        levelMismatches: lookedUp.aggregate_sum('_levelMismatch'),
        membershipViolations: lookedUp.aggregate_sum('_membershipViolation'),
        sourceMaskViolations: lookedUp.aggregate_sum('_maskViolation'),
        selectionSummary: systematicSelectionSummary(selection)
    })
}

const interpretSudanStage2Validation = result => {
    const firstProperties = result.firstProperties || []
    const allowedProperties = new Set([...sourceGridExportProperties, 'system:index'])
    const unexpectedProperties = firstProperties.filter(property => !allowedProperties.has(property))
    const missingSchemaProperties = sourceGridExportProperties
        .filter(property => !firstProperties.includes(property))
    const forbiddenProperties = ['key', 'source', 'observedClass', 'observedMask']
        .filter(property => firstProperties.includes(property))
    const [strata, rawCounts, selectedCounts, selectedLevels] = result.selectionSummary
    const selection = strata.map((stratum, index) => {
        const requested = SUDAN_ALLOCATION.find(row => row.stratum === Number(stratum)).sampleSize
        const rawCount = Number(rawCounts[index])
        return {
            stratum: Number(stratum),
            requested,
            rawCount,
            selectedLevel: Number(selectedLevels[index]),
            selectedCount: Number(selectedCounts[index]),
            requiresRepair: rawCount < requested
        }
    })
    const expectedFinalTotal = selection.reduce((total, row) => total + row.selectedCount, 0)
    const strataRequiringRepair = selection.filter(({requiresRepair}) => requiresRepair)
        .map(({stratum}) => stratum)
    const valid = Number(result.inputNominations) === 375785
        && Number(result.inputDistinctTuples) === 374857
        && Number(result.total) > 0
        && Number(result.duplicates) === 0
        && Number(result.rowsMissingRequiredProperties) === 0
        && Number(result.pointGeometryRows) === Number(result.total)
        && Number(result.maximumGeometryDisplacementMetres) <= 0.5
        && Number(result.maximumPropertyDisplacementMetres) <= 1e-6
        && Number(result.levelMismatches) === 0
        && Number(result.membershipViolations) === 0
        && Number(result.sourceMaskViolations) === 0
        && unexpectedProperties.length === 0
        && missingSchemaProperties.length === 0
        && forbiddenProperties.length === 0
    return {
        ...result,
        unexpectedProperties,
        missingSchemaProperties,
        forbiddenProperties,
        selection,
        expectedFinalTotal,
        strataRequiringRepair,
        valid
    }
}

const readySudanStage2Validation = async ({scenario, assetId}) =>
    interpretSudanStage2Validation(await evaluate(sudanStage2Validation({scenario, assetId})))

const finishSudanStage2Task = async ({taskId, nominationAssetId, candidateAssetId}) => {
    const taskResult = await waitForSudanTask({
        taskId,
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE2_TASK_POLL',
        cancellationCheckpoint: 'SOURCE_GRID_SUDAN_STAGE2_CANCEL_REQUESTED',
        limits: {
            maxRunningMs: STAGE2_MAX_RUNNING_MS,
            cancelEecu: STAGE2_HARD_EECU,
            hardEecu: STAGE2_HARD_EECU,
            cancelOnProjectedEecu: false
        }
    })
    const status = taskResult.status
    const runtimeSeconds = Number(status.start_timestamp_ms) && Number(status.update_timestamp_ms)
        ? (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000
        : null
    if (status.state !== 'COMPLETED') {
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_SUDAN_STAGE2_EXPORT',
            status: 'FAIL',
            taskId,
            nominationAssetId,
            candidateAssetId,
            task: taskResult,
            runtimeSeconds,
            eecu: Number(status.batch_eecu_usage_seconds || 0),
            assetDisposition: 'all-assets-retained-until-explicit-replacement-or-cleanup',
            attempts: Number(status.attempt || 1)
        }, null, 2))
        process.exitCode = 1
        return
    }
    const visibility = await waitForFullVisibility(candidateAssetId)
    let validation
    try {
        validation = await readySudanStage2Validation({
            scenario: buildSudanScenario({nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS}),
            assetId: candidateAssetId
        })
    } catch (error) {
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_SUDAN_STAGE2_EXPORT',
            status: 'COMPLETED_VALIDATION_PENDING',
            taskId,
            nominationAssetId,
            candidateAssetId,
            task: taskResult,
            runtimeSeconds,
            eecu: Number(status.batch_eecu_usage_seconds || 0),
            visibility,
            error: String(error),
            assetDisposition: 'all-assets-retained-until-explicit-replacement-or-cleanup',
            attempts: Number(status.attempt || 1)
        }, null, 2))
        return
    }
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE2_EXPORT',
        status: validation.valid ? 'PASS' : 'FAIL',
        taskId,
        nominationAssetId,
        candidateAssetId,
        task: taskResult,
        runtimeSeconds,
        eecu: Number(status.batch_eecu_usage_seconds || 0),
        visibility,
        validation,
        assetDisposition: 'all-assets-retained-until-explicit-replacement-or-cleanup',
        attempts: Number(status.attempt || 1)
    }, null, 2))
    if (!validation.valid) {
        process.exitCode = 1
    }
}

const runFullSudanStage2Export = async () => {
    const nominationAssetId = process.env.SD_SOURCE_GRID_ASSET_ID
    if (!nominationAssetId) {
        throw new Error('SD_SOURCE_GRID_ASSET_ID is required for Stage 2')
    }
    await authenticate({linkedUser: true})
    await callbackPromise(callback =>
        ee.data.getAsset(nominationAssetId, (asset, error) => callback(asset, error))
    )
    const taskState = await listRelevantTaskState()
    if (taskState.activeSourceGrid.length) {
        throw new Error(`A source-grid task is active: ${JSON.stringify(taskState.activeSourceGrid)}`)
    }
    const scenario = buildSudanScenario({nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS})
    const nominations = ee.FeatureCollection(nominationAssetId)
    const stage2 = exactCandidatesFromReadyNominations({scenario, nominations})
    const graph = graphCharacteristics(stage2.candidates)
    assertStage2Graph(graph)
    const startedAt = Date.now()
    const candidateAssetId = `${ASSET_ROOT}/sd_systematic_source_grid_exact_candidates_sudan_${startedAt}`
    const description = `sd-systematic-source-grid-exact-candidates-sudan-${startedAt}`
    const task = ee.batch.Export.table.toAsset(stage2.candidates, description, candidateAssetId)
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE2_STARTED',
        taskId: task.id,
        nominationAssetId,
        candidateAssetId,
        startedAt,
        inputNominations: 375785,
        expectedDistinctInputTuples: 374857,
        graph,
        exportAttempts: 1,
        limits: {
            runtimeMinutes: STAGE2_MAX_RUNNING_MS / 60000,
            eecu: STAGE2_HARD_EECU
        }
    }))
    await finishSudanStage2Task({taskId: task.id, nominationAssetId, candidateAssetId})
}

const recoverFullSudanStage2Export = async () => {
    const taskId = process.env.SD_SOURCE_GRID_STAGE2_TASK_ID
    const nominationAssetId = process.env.SD_SOURCE_GRID_ASSET_ID
    const candidateAssetId = process.env.SD_SOURCE_GRID_STAGE2_ASSET_ID
    if (!taskId || !nominationAssetId || !candidateAssetId) {
        throw new Error('Stage-2 task, nomination asset, and candidate asset IDs are required for recovery')
    }
    await authenticate({linkedUser: true})
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE2_RECOVERING',
        taskId,
        nominationAssetId,
        candidateAssetId,
        exportsStarted: 0
    }))
    await finishSudanStage2Task({taskId, nominationAssetId, candidateAssetId})
}

const validatePreservedSudanStage2Asset = async () => {
    const candidateAssetId = process.env.SD_SOURCE_GRID_STAGE2_ASSET_ID
    if (!candidateAssetId) {
        throw new Error('SD_SOURCE_GRID_STAGE2_ASSET_ID is required for Stage-2 validation')
    }
    await authenticate({linkedUser: true})
    const validation = await readySudanStage2Validation({
        scenario: buildSudanScenario({nominationRadius: SUDAN_VERIFIED_NOMINATION_RADIUS}),
        assetId: candidateAssetId
    })
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE2_VALIDATION',
        status: validation.valid ? 'PASS' : 'FAIL',
        candidateAssetId,
        validation,
        assetDisposition: 'all-assets-retained-until-explicit-replacement-or-cleanup'
    }, null, 2))
    if (!validation.valid) {
        process.exitCode = 1
    }
}

const main = async () => {
    const pureRounding = pureBoundaryRoundingControls()
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_PURE_BOUNDARY_ROUNDING',
        status: 'PASS',
        scenarios: pureRounding,
        eeRequests: 0
    }, null, 2))
    await authenticate()
    if (process.env.SD_SOURCE_GRID_RESUME !== '1') {
        const coordinate = await evaluateBounded({
            scenario: 'coordinate-ramp-fixtures',
            checkpoint: 'nearest-coordinate-ramp',
            value: ee.List(scenarios.map(coordinateRampComparison))
        })
        const failures = coordinate.result.filter(summary => summary.rows !== WIDTH * HEIGHT
            || summary.distinctLabels !== WIDTH * HEIGHT
            || summary.maxCoordinateErrorX > 0.500001
            || summary.maxCoordinateErrorY > 0.500001
            || summary.maxCoordinatePlanarError > NEAREST_COORDINATE_ERROR_BOUND + 1e-6)
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_COORDINATE_RAMP',
            status: failures.length ? 'FAIL' : 'PASS',
            coordinateConvention: 'default nearest-neighbour 1 m pixelCoordinates ramp, interpreted at pixel centres',
            scenarios: coordinate.result,
            payloadBytes: coordinate.serializedBytes,
            failures: failures.map(({name}) => name),
            exportsStarted: 0,
            assetsCreated: 0
        }, null, 2))
        if (failures.length) {
            process.exitCode = 1
            return
        }
    } else {
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_COORDINATE_RAMP',
            status: 'SKIPPED_ALREADY_PASSING'
        }))
    }
    const finite = []
    for (const config of finiteConfigs) {
        const radius = await evaluateBounded({
            scenario: config.name,
            checkpoint: 'transformed-source-pixel-radius',
            value: finiteRadius(config)
        })
        const rounding = await evaluateBounded({
            scenario: config.name,
            checkpoint: 'image-two-row-five-row-comparison',
            value: finiteRounding(config)
        })
        const prepared = prepareFiniteConfig(config, {
            maximumTransformedPixelRadius: radius.result,
            rounding: rounding.result
        })
        const equivalence = await evaluateBounded({
            scenario: config.name,
            checkpoint: 'finite-nomination-final-equivalence',
            value: finiteComparison(prepared)
        })
        const summary = summarizeFinite(equivalence.result)
        const failed = summary.spacingMargin <= 0
            || summary.nominationFalseNegatives !== 0
            || summary.missing !== 0
            || summary.extra !== 0
            || summary.propertyMismatches !== 0
        console.log(JSON.stringify({
            checkpoint: 'SOURCE_GRID_FINITE_SCENARIO',
            status: failed ? 'FAIL' : 'PASS',
            scenario: summary,
            payloadBytes: {
                radius: radius.serializedBytes,
                imageRounding: rounding.serializedBytes,
                equivalence: equivalence.serializedBytes
            }
        }, null, 2))
        if (failed) {
            process.exitCode = 1
            return
        }
        finite.push(summary)
    }
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_FINITE_EQUIVALENCE',
        status: 'PASS',
        scenarios: finite,
        totals: {
            referenceCandidates: finite.reduce((total, summary) => total + summary.referenceCandidates, 0),
            proxyCandidates: finite.reduce((total, summary) => total + summary.proxyCandidates, 0),
            vectorizedRegions: finite.reduce((total, summary) => total + summary.vectorizedRegions, 0),
            nominations: finite.reduce((total, summary) => total + summary.nominations, 0),
            duplicateNominations: finite.reduce((total, summary) => total + summary.duplicateNominations, 0),
            nominationFalseNegatives: finite.reduce((total, summary) => total + summary.nominationFalseNegatives, 0),
            sourceBoundaryCandidates: finite.reduce((total, summary) => total + summary.sourceBoundaryCandidates, 0),
            sourceCornerCandidates: finite.reduce((total, summary) => total + summary.sourceCornerCandidates, 0),
            missing: finite.reduce((total, summary) => total + summary.missing, 0),
            extra: finite.reduce((total, summary) => total + summary.extra, 0),
            propertyMismatches: finite.reduce((total, summary) => total + summary.propertyMismatches, 0)
        },
        authenticatedValueRequests: finiteConfigs.length * 3,
        exportsStarted: 0,
        assetsCreated: 0
    }, null, 2))
    const sudanRadius = await evaluateBounded({
        scenario: 'sudan-full-source-grid',
        checkpoint: 'coarse-radius-control-mesh',
        value: sudanRadiusControlMesh(buildSudanScenario())
    })
    const preflight = sudanPreflight(sudanRadius.result)
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_SUDAN_STAGE1_PREFLIGHT',
        status: 'PASS',
        beforeGraph: historicalGraph,
        graph: preflight.graph,
        radiusPayloadBytes: sudanRadius.serializedBytes,
        radiusEvidence: preflight.evidence,
        workload: preflight.workload,
        authenticatedValueRequests: finiteConfigs.length * 3 + 1,
        exportsStarted: 0,
        assetsCreated: 0
    }, null, 2))
}

if (process.env.SD_SOURCE_GRID_PURE_ONLY === '1') {
    console.log(JSON.stringify({
        checkpoint: 'SOURCE_GRID_PURE_BOUNDARY_ROUNDING',
        status: 'PASS',
        scenarios: pureBoundaryRoundingControls(),
        eeRequests: 0
    }, null, 2))
} else if (process.env.SD_SOURCE_GRID_GRAPH_ONLY === '1') {
    await runGraphOnly()
} else if (process.env.SD_SOURCE_GRID_STAGE2_WITNESS === '1') {
    await runWrongGeometryStage2Witness()
} else if (process.env.SD_SOURCE_GRID_MODEST_EXPORT === '1') {
    await runModestExport()
} else if (process.env.SD_SOURCE_GRID_FULL_PREFLIGHT === '1') {
    await runFullSudanPreflight()
} else if (process.env.SD_SOURCE_GRID_SUDAN_EXPORT === '1') {
    await runFullSudanExport()
} else if (process.env.SD_SOURCE_GRID_RECOVER === '1') {
    await recoverFullSudanExport()
} else if (process.env.SD_SOURCE_GRID_VALIDATE_ASSET === '1') {
    await validatePreservedSudanAsset()
} else if (process.env.SD_SOURCE_GRID_VALIDATE_BATCH === '1') {
    await runBatchSudanValidation()
} else if (process.env.SD_SOURCE_GRID_VALIDATE_RECOVER === '1') {
    await recoverBatchSudanValidation()
} else if (process.env.SD_SOURCE_GRID_STAGE2_EXPORT === '1') {
    await runFullSudanStage2Export()
} else if (process.env.SD_SOURCE_GRID_STAGE2_RECOVER === '1') {
    await recoverFullSudanStage2Export()
} else if (process.env.SD_SOURCE_GRID_STAGE2_VALIDATE === '1') {
    await validatePreservedSudanStage2Asset()
} else {
    await main()
}
