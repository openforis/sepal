import ee from '#sepal/ee/ee'

import {
    googleProjectId,
    serviceAccountCredentials
} from '#gee/config'
import {initialThresholds} from '#sepal/ee/samplingDesign/sparseRandomRepair'
import {selectStratifiedRandomSamples, sparseRandomCandidates} from '#sepal/ee/samplingDesign/sparseRandomSampling'
import {ROW_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {resolveSamplingGridCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

const ARRANGEMENT_CRS = resolveSamplingGridCrs('EPSG:6933')
const ARRANGEMENT_SCALE = 10
const SENTINEL = -9999
const ERROR_MARGIN = 0.001
const INDEX_LIMIT = 64
const SEED_A = 314159
const SEED_B = 271828
const ASSET_ROOT = 'projects/daniel-wiell/assets'
const EXPORT_PROPERTIES = ['label', 'rank', 'cellKey']
const MAX_DIAGNOSTIC_PAYLOAD_BYTES = 8 * 1024 * 1024
const BASE_LO = [0, 0.1, 0.2]
const BASE_HI = [0.45, 0.55, 0.65]
const REPAIR_LO = [...BASE_HI]
const REPAIR_HI = [0.8, 0.9, 1]
const FULL_LO = [0, 0, 0]
const FULL_HI = [1, 1, 1]
const FINITE_ALLOCATION = [1, 2, 3].map(stratum => ({
    stratum,
    area: 100000,
    sampleSize: 2
}))
const SUDAN_SOURCE_ASSET = 'projects/fifth-bonbon-272108/assets/sudan-dynamic-world-2024'
const SUDAN_SOURCE_BAND = 'label'
const SUDAN_AOI_ASSET = 'users/wiell/SepalResources/gaul'
const SUDAN_AOI_KEY = 6
const SUDAN_STRATIFICATION_CRS = 'EPSG:32636'
const SUDAN_STRATIFICATION_SCALE = 10
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
const SUDAN_LIMITS = {runningMinutes: 45, batchEecuSeconds: 10000}
const NEAR_LIMIT_FRACTION = 0.8
const POLL_INTERVAL = {near: 2000, far: 15000}

const finiteConfigs = [
    {
        name: 'same-grid-production-equivalence',
        aligned: true,
        classShift: 0,
        sameGridProduction: true
    },
    {
        name: 'same-crs-shifted-hole-negative-indices',
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        classShift: 1
    },
    {
        name: 'same-crs-exact-edge-corner',
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -15, 0, -20, 15]},
        classShift: 2,
        offsetAoiEdges: true,
        requireExactBoundary: true,
        requireExactCorner: true
    },
    {
        name: 'same-crs-near-edge-corner',
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -14.999999, 0, -20, 15.000001]},
        classShift: 0,
        offsetAoiEdges: true,
        requireNearBoundary: true
    },
    {
        name: 'cross-crs-shifted-utm-isolated-class',
        source: {crs: 'EPSG:32631', transform: [20, 0, 165861, 0, -20, 160]},
        classShift: 1,
        isolatedClass: true,
        isolatedCell: {i: 4, j: 4},
        requireIsolated: true
    },
    {
        name: 'native-versus-configured-discriminator',
        native: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -153, 0, -20, 153]},
        classShift: 0,
        discriminateConfiguredGrid: true
    },
    // 1:1 Stratification-to-Arrangement pixel size is the Sudan configuration: a reprojection that resamples
    // between grids of equal scale may take a different Earth Engine path than the 2:1 fixtures above.
    {
        name: 'cross-crs-one-to-one-utm',
        source: {crs: 'EPSG:32631', transform: [10, 0, 165861, 0, -10, 160]},
        classShift: 1
    },
    {
        name: 'cross-crs-one-to-one-utm-shifted-origin',
        source: {crs: 'EPSG:32631', transform: [10, 0, 165864.3, 0, -10, 163.7]},
        classShift: 2
    },
    {
        name: 'same-crs-one-to-one-exact-corner',
        source: {crs: ARRANGEMENT_CRS, transform: [10, 0, -5, 0, -10, 5]},
        classShift: 1,
        offsetAoiEdges: true,
        requireExactBoundary: true,
        requireExactCorner: true
    },
    {
        name: 'same-crs-one-to-one-near-corner',
        source: {crs: ARRANGEMENT_CRS, transform: [10, 0, -4.999999, 0, -10, 5.000001]},
        classShift: 2,
        offsetAoiEdges: true,
        isolatedClass: true,
        isolatedCell: {i: 5, j: 6},
        requireIsolated: true,
        requireNearBoundary: true
    }
]

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message)
    }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})

const evaluate = value => new Promise((resolve, reject) => {
    value.evaluate((result, error) => error ? reject(error) : resolve(result))
})

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
            throw new Error('Linked-user authorization is incomplete')
        }
        if (Number(credentials.access_token_expiry_date) <= Date.now()) {
            throw new Error('Linked-user authorization is expired')
        }
        projectId = credentials.project_id
        ee.data.clearAuthToken()
        ee.data.setAuthTokenRefresher(null)
        ee.data.setAuthToken(null, 'Bearer', credentials.access_token, null, null, null, false)
    } else {
        await callbackPromise(callback =>
            ee.data.authenticateViaPrivateKey(serviceAccountCredentials, callback, error => callback(null, error))
        )
    }
    await callbackPromise(callback =>
        ee.initialize(null, null, callback, error => callback(null, error), null, projectId)
    )
    ee.setMaxRetries(0)
}

const serializedExpression = value => {
    const serialized = value.serialize()
    return typeof serialized === 'string' ? serialized : JSON.stringify(serialized)
}

const graphCharacteristics = value => {
    const serialized = serializedExpression(value)
    const count = pattern => (serialized.match(pattern) || []).length
    const functionNames = [...serialized.matchAll(/"functionName":"([^"]+)"/g)].map(match => match[1])
    return {
        serializedBytes: Buffer.byteLength(serialized),
        reproject: count(/Image\.reproject/g),
        reduceToVectors: count(/Image\.reduceToVectors/g),
        reduceRegions: count(/Image\.reduceRegions/g),
        reduceRegion: count(/"Image\.reduceRegion"/g),
        sampleRegions: count(/Image\.sampleRegions/g),
        focalMax: count(/Image\.focalMax/g),
        reduceResolution: count(/Image\.reduceResolution/g),
        displace: count(/Image\.displace/g),
        resample: count(/Image\.resample/g),
        random: count(/Image\.random/g),
        distinct: count(/Collection\.distinct/g),
        functionNames: [...new Set(functionNames)].sort()
    }
}

const subtreeFunctionNames = (node, values) => {
    const names = new Set()
    const seen = new Set()
    const visit = current => {
        if (!current || typeof current !== 'object') {
            return
        }
        if (current.valueReference !== undefined) {
            const key = String(current.valueReference)
            if (!seen.has(key)) {
                seen.add(key)
                visit(values[key])
            }
        } else if (current.functionInvocationValue) {
            const {functionName, arguments: args} = current.functionInvocationValue
            if (functionName) {
                names.add(functionName)
            }
            Object.values(args || {}).forEach(visit)
        } else if (current.arrayValue) {
            (current.arrayValue.values || []).forEach(visit)
        } else if (current.dictionaryValue) {
            Object.values(current.dictionaryValue.values || {}).forEach(visit)
        }
    }
    visit(node)
    return names
}

// A global reproject count cannot tell the categorical branch from the rank branch. Resolve each reproject
// node's own input subtree instead: it must reach the categorical source and must never reach Image.random.
// Must walk the whole tree, not just the hoisted `values` map - Earth Engine only hoists shared subexpressions,
// so a single-use reproject is inlined as a nested invocation.
const reprojectBranches = value => {
    const parsed = JSON.parse(serializedExpression(value))
    const values = parsed.values || {}
    const found = []
    const seen = new Set()
    const visit = current => {
        if (!current || typeof current !== 'object') {
            return
        }
        if (current.valueReference !== undefined) {
            const key = String(current.valueReference)
            if (!seen.has(key)) {
                seen.add(key)
                visit(values[key])
            }
        } else if (current.functionInvocationValue) {
            const {functionName, arguments: args} = current.functionInvocationValue
            if (functionName === 'Image.reproject') {
                const functions = subtreeFunctionNames(args?.image, values)
                found.push({
                    reachesRandom: functions.has('Image.random'),
                    reachesImageSource: functions.has('Image.load') || functions.has('Image.pixelCoordinates'),
                    functions: [...functions].sort()
                })
            }
            Object.values(args || {}).forEach(visit)
        } else if (current.arrayValue) {
            (current.arrayValue.values || []).forEach(visit)
        } else if (current.dictionaryValue) {
            Object.values(current.dictionaryValue.values || {}).forEach(visit)
        }
    }
    visit({valueReference: parsed.result})
    return found
}

const assertReprojectOnCategoricalBranch = value => {
    const branches = reprojectBranches(value)
    assert(branches.length === 1, `Expected exactly one reproject, found ${branches.length}`)
    const [branch] = branches
    assert(!branch.reachesRandom,
        `Reproject is on the rank branch: ${JSON.stringify(branch)}`)
    assert(branch.reachesImageSource,
        `Reproject does not reach a categorical image source: ${JSON.stringify(branch)}`)
    return branch
}

const assertCandidateGraph = graph => {
    const expected = {
        reproject: 1,
        reduceToVectors: 1,
        reduceRegions: 0,
        reduceRegion: 0,
        sampleRegions: 0,
        focalMax: 0,
        reduceResolution: 0,
        displace: 0,
        resample: 0,
        random: 1,
        distinct: 0
    }
    const mismatches = Object.entries(expected)
        .filter(([property, value]) => graph[property] !== value)
        .map(([property, expectedValue]) => ({property, expected: expectedValue, actual: graph[property]}))
    assert(!mismatches.length, `Random candidate graph mismatch: ${JSON.stringify({mismatches, graph})}`)
}

const projection = definition => definition.aligned
    ? ee.Projection(ARRANGEMENT_CRS).atScale(ARRANGEMENT_SCALE)
    : ee.Projection(definition.crs, definition.transform)

const buildFiniteScenario = config => {
    const arrangementProjection = ee.Projection(ARRANGEMENT_CRS)
    const configuredProjection = projection(config.source || config)
    const nativeProjection = config.native ? projection(config.native) : configuredProjection
    const outerMin = config.offsetAoiEdges ? 0.25 : 0
    const outerMax = config.offsetAoiEdges ? 15.75 : 16
    const holeMin = config.offsetAoiEdges ? 6.25 : 6
    const holeMax = config.offsetAoiEdges ? 9.75 : 10
    const outerCoordinates = [
        [outerMin, outerMin], [outerMax, outerMin], [outerMax, outerMax],
        [outerMin, outerMax], [outerMin, outerMin]
    ]
    const holeCoordinates = [
        [holeMin, holeMin], [holeMax, holeMin], [holeMax, holeMax],
        [holeMin, holeMax], [holeMin, holeMin]
    ]
    const region = ee.Geometry.Polygon([outerCoordinates, holeCoordinates], configuredProjection, false)
    const outerRegion = ee.Geometry.Polygon([outerCoordinates], configuredProjection, false)
    const nativeCoordinates = ee.Image.pixelCoordinates(nativeProjection)
    const nativeI = nativeCoordinates.select('x').floor().toInt()
    const nativeJ = nativeCoordinates.select('y').floor().toInt()
    let nativeClass = nativeI.multiply(3).add(nativeJ.multiply(5)).add(config.classShift)
        .mod(3).add(3).mod(3).add(1).toInt()
    // Sign-safe without the add-before-mod normalization ONLY because the consumer is neq(0): a negative
    // remainder is non-zero exactly when the true modulo is. Do not copy this bare form into a generator whose
    // consumer compares against anything else.
    let nativeMask = nativeI.multiply(7).add(nativeJ.multiply(11)).add(1).mod(13).neq(0).toInt()
    if (config.isolatedClass) {
        nativeClass = nativeI.add(nativeJ).mod(2).add(2).mod(2).add(1).toInt().where(
            nativeI.eq(config.isolatedCell.i).and(nativeJ.eq(config.isolatedCell.j)),
            3
        )
    }
    const nativeLookup = nativeClass.updateMask(nativeMask).unmask(SENTINEL).rename('observedClass')
        .addBands(nativeMask.unmask(0).rename('observedMask'))
        .setDefaultProjection(nativeProjection)
    return {
        ...config,
        arrangementProjection,
        configuredProjection,
        nativeProjection,
        region,
        outerRegion,
        nativeClass,
        nativeMask,
        nativeLookup,
        allocation: FINITE_ALLOCATION,
        grid: {crs: ARRANGEMENT_CRS, scale: ARRANGEMENT_SCALE}
    }
}

const oracleLookup = scenario => scenario.nativeLookup.reproject(scenario.configuredProjection)

const decodeLookup = lookup => lookup.select('observedClass').toInt()
    .updateMask(lookup.select('observedMask').eq(1))
    .rename('stratum')

// The sentinel-class-plus-mask-band form and production's masked single band are different images to reproject.
// Both are compared against the same oracle, so equivalence rests on evidence rather than analogy.
const maskedCategorical = scenario => scenario.nativeClass.updateMask(scenario.nativeMask).rename('stratum').toInt()

// A RECIPE stratification is a computed image carrying Earth Engine's default degree-scale projection, not a
// source grid. pixelLonLat is the same shape: its values depend on the projection it is evaluated at.
const recipeLikeCategorical = () => {
    const lonLat = ee.Image.pixelLonLat()
    return lonLat.select('longitude').multiply(1e5).floor().toInt()
        .add(lonLat.select('latitude').multiply(1e5).floor().toInt())
        .mod(3).add(3).mod(3).add(1).toInt().rename('stratum')
}

const categoricalForMode = (scenario, mode = 'forced-configured') => {
    switch (mode) {
        case 'recipe-native':
            return recipeLikeCategorical()
        case 'recipe-default-projection':
            return recipeLikeCategorical().setDefaultProjection(scenario.configuredProjection)
        case 'recipe-reproject':
            return recipeLikeCategorical().reproject(scenario.configuredProjection)
        // Declaring the Stratification grid first should give the reproject a non-destructive source: the
        // computed image is defined to live on that grid rather than resampled from the degree-scale default.
        case 'recipe-default-then-reproject':
            return recipeLikeCategorical()
                .setDefaultProjection(scenario.configuredProjection)
                .reproject(scenario.configuredProjection)
        case 'forced-configured':
            return decodeLookup(oracleLookup(scenario))
        case 'default-configured':
            return decodeLookup(scenario.nativeLookup.setDefaultProjection(scenario.configuredProjection))
        case 'direct-native':
            return decodeLookup(scenario.nativeLookup)
        case 'production-masked':
            return maskedCategorical(scenario)
                .setDefaultProjection(scenario.nativeProjection)
                .reproject(scenario.configuredProjection)
        // The shipping ASSET arm: an asset carries its own projection, so no setDefaultProjection is needed.
        case 'production-asset':
            return maskedCategorical(scenario).reproject(scenario.configuredProjection)
        case 'production-one-grid':
            return maskedCategorical(scenario).setDefaultProjection(scenario.configuredProjection)
        default:
            throw new Error(`Unknown stratification mode: ${mode}`)
    }
}

// Always the production function: the two-grid delta is provably the stratification argument and nothing else.
const twoGridCandidates = ({scenario, seed, loThresholds, hiThresholds, mode = 'forced-configured'}) =>
    sparseRandomCandidates({
        stratification: categoricalForMode(scenario, mode),
        region: scenario.region,
        grid: scenario.grid,
        seed,
        loThresholds,
        hiThresholds,
        allocation: scenario.allocation
    })

const exactCell = ({scenario, i, j}) => {
    const x = ee.Number(i).add(0.5).multiply(scenario.grid.scale)
    const y = ee.Number(j).add(0.5).multiply(scenario.grid.scale)
    return {x, y, geometry: ee.Geometry.Point([x, y], scenario.arrangementProjection)}
}

const explicitCells = (scenario, {region = scenario.region, iRange, jRange} = {}) => ee.FeatureCollection(
    ee.List.sequence(...(jRange || [-INDEX_LIMIT, INDEX_LIMIT])).map(j =>
        ee.List.sequence(...(iRange || [-INDEX_LIMIT, INDEX_LIMIT])).map(i => {
            const point = exactCell({scenario, i, j})
            const sourceCoordinates = point.geometry.transform(
                scenario.configuredProjection,
                ee.ErrorMargin(ERROR_MARGIN, 'projected')
            ).coordinates()
            return ee.Feature(point.geometry, {
                i,
                j,
                cellKey: ee.Number(i).format('%d').cat(':').cat(ee.Number(j).format('%d')),
                arrangementX: point.x,
                arrangementY: point.y,
                sourceU: sourceCoordinates.get(0),
                sourceV: sourceCoordinates.get(1)
            })
        })
    ).flatten()
).map(feature => feature.set('_insideAoi', region.contains(
    feature.geometry(),
    ee.ErrorMargin(ERROR_MARGIN, 'projected'),
    scenario.arrangementProjection
))).filter(ee.Filter.eq('_insideAoi', true))

const oracleFrame = scenario => {
    const sampled = oracleLookup(scenario).reduceRegions({
        collection: explicitCells(scenario),
        reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
        crs: scenario.configuredProjection,
        maxPixelsPerRegion: 1
    })
    const includedStrata = scenario.allocation.map(({stratum}) => stratum)
    const eligible = sampled
        .filter(ee.Filter.eq('observedMask', 1))
        .filter(ee.Filter.inList('observedClass', includedStrata))
    const withRankA = ee.Image.random(SEED_A, 'uniform').rename('rankA').reduceRegions({
        collection: eligible,
        reducer: ee.Reducer.first().forEach(['rankA']),
        crs: scenario.grid.crs,
        scale: scenario.grid.scale,
        maxPixelsPerRegion: 1
    })
    return ee.Image.random(SEED_B, 'uniform').rename('rankB').reduceRegions({
        collection: withRankA,
        reducer: ee.Reducer.first().forEach(['rankB']),
        crs: scenario.grid.crs,
        scale: scenario.grid.scale,
        maxPixelsPerRegion: 1
    })
}

// Independently re-derives production's label encoding (sparseRandomSampling.js) on purpose - a shared helper
// would let one bug satisfy both sides. Nothing keeps the two in lockstep: if production's encoding changes, this
// oracle keeps asserting the old one and the matrix goes green against a stale reference.
const oracleRecord = allocation => feature => {
    const i = feature.getNumber('i').toInt()
    const j = feature.getNumber('j').toInt()
    const stratum = feature.getNumber('observedClass').toInt()
    const stratumIndex = ee.List(allocation.map(({stratum: value}) => value)).indexOf(stratum)
    const parity = j.mod(2).add(2).mod(2).multiply(2).add(i.mod(2).add(2).mod(2))
    return ee.Dictionary({
        cellKey: feature.get('cellKey'),
        i,
        j,
        stratum,
        label: stratumIndex.multiply(4).add(parity).add(1).toInt(),
        rankA: feature.get('rankA'),
        rankB: feature.get('rankB'),
        sourceU: feature.get('sourceU'),
        sourceV: feature.get('sourceV')
    })
}

const candidateRecord = allocation => feature => {
    const label = feature.getNumber('label').toInt()
    const stratumIndex = label.subtract(1).divide(4).floor().toInt()
    const keyParts = feature.getString('cellKey').split(':')
    return ee.Dictionary({
        cellKey: feature.get('cellKey'),
        i: ee.Number.parse(keyParts.getString(0)).toInt(),
        j: ee.Number.parse(keyParts.getString(1)).toInt(),
        stratum: ee.List(allocation.map(({stratum}) => stratum)).get(stratumIndex),
        label,
        rank: feature.get('rank')
    })
}

const records = (collection, mapper) => collection
    .map(feature => ee.Feature(null, {record: mapper(feature)}))
    .aggregate_array('record')

const oracleRowsRequest = scenario => ee.Dictionary({
    rows: records(oracleFrame(scenario), oracleRecord(scenario.allocation))
})

// Only the counts that the row payload cannot express stay server-side, and they share one `sampled` collection
// instead of recomputing it as boundaryStats did.
const oracleCountsRequest = scenario => {
    const sampled = oracleLookup(scenario).reduceRegions({
        collection: explicitCells(scenario),
        reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
        crs: scenario.configuredProjection,
        maxPixelsPerRegion: 1
    })
    const eligible = sampled
        .filter(ee.Filter.eq('observedMask', 1))
        .filter(ee.Filter.inList('observedClass', scenario.allocation.map(({stratum}) => stratum)))
    return ee.Dictionary({
        rawInsideAoi: sampled.size(),
        rawInsideOuter: explicitCells(scenario, {region: scenario.outerRegion}).size(),
        maskedInsideAoi: sampled.filter(ee.Filter.neq('observedMask', 1)).size(),
        eligible: eligible.size()
    })
}

const derivedStats = (rows, counts) => {
    const distance = row => {
        const du = Math.abs(Number(row.sourceU) - Math.round(Number(row.sourceU)))
        const dv = Math.abs(Number(row.sourceV) - Math.round(Number(row.sourceV)))
        return {boundary: Math.min(du, dv), corner: Math.max(du, dv)}
    }
    const distances = rows.map(distance)
    return {
        rawInsideAoi: Number(counts.rawInsideAoi),
        rawInsideOuter: Number(counts.rawInsideOuter),
        maskedInsideAoi: Number(counts.maskedInsideAoi),
        eligible: rows.length,
        negativeI: rows.filter(row => Number(row.i) < 0).length,
        negativeJ: rows.filter(row => Number(row.j) < 0).length,
        exactBoundary: distances.filter(({boundary}) => boundary <= 1e-9).length,
        exactCorner: distances.filter(({corner}) => corner <= 1e-9).length,
        nearBoundary: distances.filter(({boundary}) => boundary > 1e-9 && boundary < 1e-5).length,
        isolatedClass: rows.filter(row => Number(row.stratum) === 3).length
    }
}

const candidateRequest = ({scenario, seed, loThresholds, hiThresholds, mode}) => {
    const collection = twoGridCandidates({scenario, seed, loThresholds, hiThresholds, mode})
    return ee.Dictionary({
        rows: records(collection, candidateRecord(scenario.allocation)),
        size: collection.size(),
        distinctKeys: collection.aggregate_count_distinct('cellKey')
    })
}

const thresholdsFor = (stratum, values) => values[FINITE_ALLOCATION.findIndex(row => row.stratum === stratum)]

const expectedInterval = (oracleRows, {rankProperty, lo, hi}) => oracleRows
    .filter(row => Number(row[rankProperty]) >= thresholdsFor(Number(row.stratum), lo)
        && Number(row[rankProperty]) < thresholdsFor(Number(row.stratum), hi))
    .map(row => ({...row, rank: Number(row[rankProperty])}))

const diffRows = ({expected, actual}) => {
    const expectedByKey = new Map(expected.map(row => [row.cellKey, row]))
    const actualByKey = new Map(actual.map(row => [row.cellKey, row]))
    const missing = [...expectedByKey.keys()].filter(key => !actualByKey.has(key))
    const extra = [...actualByKey.keys()].filter(key => !expectedByKey.has(key))
    const duplicates = actual.length - actualByKey.size
    const propertyMismatches = []
    for (const [key, expectedRow] of expectedByKey) {
        const actualRow = actualByKey.get(key)
        if (!actualRow) {
            continue
        }
        const rankDifference = Math.abs(Number(expectedRow.rank) - Number(actualRow.rank))
        if (Number(expectedRow.stratum) !== Number(actualRow.stratum)
            || Number(expectedRow.i) !== Number(actualRow.i)
            || Number(expectedRow.j) !== Number(actualRow.j)
            || Number(expectedRow.label) !== Number(actualRow.label)
            || rankDifference > 1e-15) {
            propertyMismatches.push({key, expected: expectedRow, actual: actualRow, rankDifference})
        }
    }
    return {
        expected: expected.length,
        actual: actual.length,
        missing: missing.length,
        extra: extra.length,
        duplicates,
        propertyMismatches: propertyMismatches.length,
        examples: {
            missing: missing.slice(0, 5),
            extra: extra.slice(0, 5),
            propertyMismatches: propertyMismatches.slice(0, 3)
        }
    }
}

const matches = result => !result.missing && !result.extra && !result.duplicates && !result.propertyMismatches

const compareRows = ({expected, actual, description}) => {
    const result = {description, ...diffRows({expected, actual})}
    assert(matches(result), `${description} mismatch: ${JSON.stringify(result)}`)
    return result
}

const exactSameRows = (left, right) => {
    if (left.length !== right.length) {
        return false
    }
    const normalized = rows => [...rows]
        .sort((a, b) => a.cellKey.localeCompare(b.cellKey))
        .map(row => JSON.stringify(row))
    const normalizedRight = normalized(right)
    return normalized(left).every((row, index) => row === normalizedRight[index])
}

const requestLedger = []

const runRequest = async ({name, value}) => {
    const serializedBytes = Buffer.byteLength(serializedExpression(value))
    assert(serializedBytes < MAX_DIAGNOSTIC_PAYLOAD_BYTES,
        `${name} payload is too large: ${serializedBytes}`)
    const startedAt = Date.now()
    const result = await evaluate(value)
    const entry = {
        name,
        serializedBytes,
        elapsedSeconds: (Date.now() - startedAt) / 1000,
        retries: 0,
        status: 'PASS'
    }
    requestLedger.push(entry)
    console.log(JSON.stringify({checkpoint: 'RANDOM_GRID_REQUEST', ...entry}))
    return result
}

const runFinite = async () => {
    await authenticate()
    const summaries = []
    const startIndex = Number(process.env.SD_RANDOM_START_INDEX || 0)
    assert(Number.isSafeInteger(startIndex) && startIndex >= 0 && startIndex < finiteConfigs.length,
        `Invalid finite start index: ${startIndex}`)
    for (const config of finiteConfigs.slice(startIndex)) {
        const scenario = buildFiniteScenario(config)
        const oracleResult = await runRequest({
            name: `${scenario.name}:oracle-rows`,
            value: oracleRowsRequest(scenario)
        })
        const oracleCounts = await runRequest({
            name: `${scenario.name}:oracle-counts`,
            value: oracleCountsRequest(scenario)
        })
        const oracleRows = oracleResult.rows
        assert(oracleRows.length === Number(oracleCounts.eligible),
            `${scenario.name}: oracle row payload (${oracleRows.length}) disagrees with the eligible count `
            + `(${oracleCounts.eligible}) - the split changed semantics`)
        const fullExpected = expectedInterval(oracleRows, {
            rankProperty: 'rankA', lo: FULL_LO, hi: FULL_HI
        })
        const baseExpected = expectedInterval(oracleRows, {
            rankProperty: 'rankA', lo: BASE_LO, hi: BASE_HI
        })
        const repairExpected = expectedInterval(oracleRows, {
            rankProperty: 'rankA', lo: REPAIR_LO, hi: REPAIR_HI
        })
        const secondSeedExpected = expectedInterval(oracleRows, {
            rankProperty: 'rankB', lo: BASE_LO, hi: BASE_HI
        })
        const evaluateCandidates = async ({name, seed, lo, hi, mode, production}) => runRequest({
            name: `${scenario.name}:${name}`,
            value: candidateRequest({
                scenario,
                seed,
                loThresholds: lo,
                hiThresholds: hi,
                mode,
                production
            })
        })
        const full = await evaluateCandidates({name: 'full', seed: SEED_A, lo: FULL_LO, hi: FULL_HI})
        const base = await evaluateCandidates({name: 'base', seed: SEED_A, lo: BASE_LO, hi: BASE_HI})
        const repair = await evaluateCandidates({name: 'repair', seed: SEED_A, lo: REPAIR_LO, hi: REPAIR_HI})
        const baseRepeat = await evaluateCandidates({name: 'base-repeat', seed: SEED_A, lo: BASE_LO, hi: BASE_HI})
        const secondSeed = await evaluateCandidates({name: 'second-seed', seed: SEED_B, lo: BASE_LO, hi: BASE_HI})
        const comparisons = {
            frame: compareRows({expected: fullExpected, actual: full.rows, description: `${scenario.name}:frame`}),
            base: compareRows({expected: baseExpected, actual: base.rows, description: `${scenario.name}:base`}),
            repair: compareRows({expected: repairExpected, actual: repair.rows, description: `${scenario.name}:repair`}),
            secondSeed: compareRows({
                expected: secondSeedExpected,
                actual: secondSeed.rows,
                description: `${scenario.name}:second-seed`
            })
        }
        assert(exactSameRows(base.rows, baseRepeat.rows), `${scenario.name}: same-seed result changed`)
        const baseKeys = new Set(base.rows.map(({cellKey}) => cellKey))
        const repairOverlap = repair.rows.filter(({cellKey}) => baseKeys.has(cellKey))
        assert(!repairOverlap.length, `${scenario.name}: base and repair intervals overlap`)
        const secondSeedKeys = new Set(secondSeed.rows.map(({cellKey}) => cellKey))
        const relocation = [...new Set([...baseKeys, ...secondSeedKeys])]
            .filter(key => baseKeys.has(key) !== secondSeedKeys.has(key)).length
        const commonRankChanges = base.rows.filter(row => secondSeedKeys.has(row.cellKey)
            && Math.abs(Number(row.rank)
                - Number(secondSeed.rows.find(second => second.cellKey === row.cellKey).rank)) > 1e-15).length
        assert(relocation > 0, `${scenario.name}: different seed did not relocate any base candidate`)
        assert(Number(full.distinctKeys) === Number(full.size), `${scenario.name}: full cellKey duplicate`)
        assert(Number(base.distinctKeys) === Number(base.size), `${scenario.name}: base cellKey duplicate`)
        const stats = derivedStats(oracleRows, oracleCounts)
        assert(stats.rawInsideOuter > stats.rawInsideAoi, `${scenario.name}: AOI hole excluded no cells`)
        assert(stats.maskedInsideAoi > 0, `${scenario.name}: fixture has no masked cells`)
        if (scenario.requireExactBoundary) {
            assert(stats.exactBoundary > 0, `${scenario.name}: exact source boundary was not exercised`)
        }
        if (scenario.requireExactCorner) {
            assert(stats.exactCorner > 0, `${scenario.name}: exact source corner was not exercised`)
        }
        if (scenario.requireNearBoundary) {
            assert(stats.nearBoundary > 0, `${scenario.name}: near source boundary was not exercised`)
        }
        if (scenario.requireIsolated) {
            assert(stats.isolatedClass > 0, `${scenario.name}: isolated class was not represented`)
        }
        let configuredGrid = null
        if (scenario.discriminateConfiguredGrid) {
            const withDefault = await evaluateCandidates({
                name: 'set-default', seed: SEED_A, lo: FULL_LO, hi: FULL_HI, mode: 'default-configured'
            })
            const directNative = await evaluateCandidates({
                name: 'direct-native', seed: SEED_A, lo: FULL_LO, hi: FULL_HI, mode: 'direct-native'
            })
            const summarizeWrong = rows => {
                const expected = new Set(fullExpected.map(({cellKey}) => cellKey))
                const actual = new Set(rows.map(({cellKey}) => cellKey))
                return {
                    missing: [...expected].filter(key => !actual.has(key)).length,
                    extra: [...actual].filter(key => !expected.has(key)).length
                }
            }
            // Cells surviving under a different Stratification grid must carry a bit-identical rank and identity:
            // direct evidence that the rank raster is never reprojected, rather than an operator-count argument.
            const rankInvariance = rows => {
                const referenceByKey = new Map(full.rows.map(row => [row.cellKey, row]))
                const shared = rows.filter(({cellKey}) => referenceByKey.has(cellKey))
                const differing = shared.filter(row => {
                    const reference = referenceByKey.get(row.cellKey)
                    return Number(reference.rank) !== Number(row.rank)
                        || Number(reference.i) !== Number(row.i)
                        || Number(reference.j) !== Number(row.j)
                        || reference.cellKey !== row.cellKey
                })
                return {shared: shared.length, differing: differing.length, examples: differing.slice(0, 3)}
            }
            configuredGrid = {
                forcedConfigured: comparisons.frame,
                setDefaultProjection: summarizeWrong(withDefault.rows),
                directNative: summarizeWrong(directNative.rows),
                rankInvariance: {
                    setDefaultProjection: rankInvariance(withDefault.rows),
                    directNative: rankInvariance(directNative.rows)
                }
            }
            assert(configuredGrid.setDefaultProjection.missing + configuredGrid.setDefaultProjection.extra > 0,
                `${scenario.name}: setDefaultProjection fixture did not discriminate`)
            assert(configuredGrid.directNative.missing + configuredGrid.directNative.extra > 0,
                `${scenario.name}: direct-native fixture did not discriminate`)
            Object.entries(configuredGrid.rankInvariance).forEach(([variant, result]) => {
                assert(result.shared > 0, `${scenario.name}: ${variant} shared no cells with the configured grid`)
                assert(!result.differing,
                    `${scenario.name}: ${variant} changed rank or identity on shared cells: ${JSON.stringify(result)}`)
            })
        }
        // Whether production's masked single band can be reprojected unchanged, or whether the sentinel-plus-
        // mask-band form is required. Reported, never asserted: the answer is the finding.
        const productionMasked = await evaluateCandidates({
            name: 'production-masked', seed: SEED_A, lo: FULL_LO, hi: FULL_HI, mode: 'production-masked'
        })
        const productionShape = diffRows({expected: fullExpected, actual: productionMasked.rows})
        let productionEquivalence = null
        if (scenario.sameGridProduction) {
            const production = await evaluateCandidates({
                name: 'production-one-grid', seed: SEED_A, lo: FULL_LO, hi: FULL_HI, mode: 'production-one-grid'
            })
            productionEquivalence = compareRows({
                expected: full.rows,
                actual: production.rows,
                description: `${scenario.name}:production-equivalence`
            })
        }
        const summary = {
            scenario: scenario.name,
            stats,
            comparisons,
            stableSameSeed: true,
            baseRepairOverlap: repairOverlap.length,
            differentSeedRelocation: relocation,
            commonCellRankChanges: commonRankChanges,
            configuredGrid,
            productionEquivalence,
            productionShape: {...productionShape, matchesOracle: matches(productionShape)}
        }
        summaries.push(summary)
        console.log(JSON.stringify({checkpoint: 'RANDOM_GRID_FINITE', status: 'PASS', ...summary}))
    }
    assert(summaries.some(({stats}) => stats.negativeI > 0 || stats.negativeJ > 0),
        'Finite matrix has no negative Arrangement indices')
    const productionShapeMatches = summaries.filter(({productionShape}) => productionShape.matchesOracle).length
    return {
        status: 'PASS',
        scenarios: summaries.length,
        startIndex,
        seeds: [SEED_A, SEED_B],
        intervals: {
            base: {lo: BASE_LO, hi: BASE_HI},
            repair: {lo: REPAIR_LO, hi: REPAIR_HI},
            semantics: 'lo <= rank < hi'
        },
        summaries,
        productionShape: {
            matched: productionShapeMatches,
            scenarios: summaries.length,
            portIsStratificationArgumentOnly: productionShapeMatches === summaries.length
        },
        requests: requestLedger,
        retries: 0,
        tasksStarted: 0,
        assetsCreated: 0
    }
}

const isNotFound = error => /not found|does not exist|404/i.test(String(error))

const waitForTask = async taskId => {
    const history = []
    for (;;) {
        const statuses = await callbackPromise(callback =>
            ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
        )
        const status = statuses[0]
        history.push({
            timestamp: Date.now(),
            state: status.state,
            eecu: Number(status.batch_eecu_usage_seconds || 0)
        })
        if (!['READY', 'RUNNING'].includes(status.state)) {
            return {status, history}
        }
        await sleep(2000)
    }
}

const waitForVisibility = async assetId => {
    const startedAt = Date.now()
    const ledger = []
    for (const delay of [0, 500, 1000, 2000, 4000]) {
        if (delay) {
            await sleep(delay)
        }
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
    throw new Error(`Asset not visible in bounded retry window: ${assetId}`)
}

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
    try {
        await callbackPromise(callback =>
            ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
        )
        throw new Error(`Temporary asset still exists: ${assetId}`)
    } catch (error) {
        if (!isNotFound(error)) {
            throw error
        }
    }
    return {assetId, absent: true}
}

const validateReadyAsset = async ({scenario, assetId}) => {
    const oracle = await evaluate(oracleRowsRequest(scenario))
    const expected = expectedInterval(oracle.rows, {rankProperty: 'rankA', lo: BASE_LO, hi: BASE_HI})
    const collection = ee.FeatureCollection(assetId)
    const withDiagnostics = collection.map(feature => {
        const parts = feature.getString('cellKey').split(':')
        const i = ee.Number.parse(parts.getString(0)).toInt()
        const j = ee.Number.parse(parts.getString(1)).toInt()
        const expectedPoint = exactCell({scenario, i, j})
        const coordinates = feature.geometry().transform(scenario.arrangementProjection, 0.5).coordinates()
        const displacement = ee.Number(coordinates.get(0)).subtract(expectedPoint.x).pow(2)
            .add(ee.Number(coordinates.get(1)).subtract(expectedPoint.y).pow(2)).sqrt()
        return feature.set('_geometryDisplacement', displacement)
    })
    const value = ee.Dictionary({
        rows: records(collection, candidateRecord(scenario.allocation)),
        size: collection.size(),
        distinctKeys: collection.aggregate_count_distinct('cellKey'),
        properties: ee.Feature(collection.first()).propertyNames(),
        geometryTypes: collection.map(feature => ee.Feature(null, {
            type: feature.geometry().type()
        })).aggregate_histogram('type'),
        maximumGeometryDisplacementMetres: withDiagnostics.aggregate_max('_geometryDisplacement'),
        geometryDisplacementViolations: withDiagnostics.filter(ee.Filter.gt('_geometryDisplacement', 0.5)).size()
    })
    const actual = await evaluate(value)
    const comparison = compareRows({expected, actual: actual.rows, description: 'modest-ready-asset'})
    const userProperties = actual.properties.filter(property => !property.startsWith('system:')).sort()
    const expectedProperties = [...EXPORT_PROPERTIES].sort()
    assert(JSON.stringify(userProperties) === JSON.stringify(expectedProperties),
        `Modest schema mismatch: ${JSON.stringify({userProperties, expectedProperties})}`)
    assert(Number(actual.distinctKeys) === Number(actual.size), 'Modest asset contains duplicate cellKeys')
    assert(Number(actual.geometryTypes?.Point || 0) === Number(actual.size), 'Modest asset has non-Point geometry')
    assert(Number(actual.geometryDisplacementViolations) === 0, 'Modest asset geometry moved over 0.5 m')
    return {
        comparison,
        size: Number(actual.size),
        distinctKeys: Number(actual.distinctKeys),
        duplicates: Number(actual.size) - Number(actual.distinctKeys),
        userProperties,
        geometryTypes: actual.geometryTypes,
        maximumGeometryDisplacementMetres: Number(actual.maximumGeometryDisplacementMetres),
        geometryDisplacementViolations: Number(actual.geometryDisplacementViolations)
    }
}

const runModestExport = async () => {
    await authenticate({linkedUser: true})
    const scenario = buildFiniteScenario(
        finiteConfigs.find(({name}) => name === 'cross-crs-shifted-utm-isolated-class')
    )
    const candidates = twoGridCandidates({
        scenario,
        seed: SEED_A,
        loThresholds: BASE_LO,
        hiThresholds: BASE_HI
    }).select(EXPORT_PROPERTIES)
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_random_two_grid_modest_${startedAt}`
    const task = ee.batch.Export.table.toAsset(
        candidates,
        `sd-random-two-grid-modest-${startedAt}`,
        assetId
    )
    task.start()
    let taskResult
    let visibility
    let validation
    let cleanup
    try {
        taskResult = await waitForTask(task.id)
        if (taskResult.status.state !== 'COMPLETED') {
            throw new Error(`Modest Random export failed: ${JSON.stringify(taskResult.status)}`)
        }
        visibility = await waitForVisibility(assetId)
        validation = await validateReadyAsset({scenario, assetId})
    } finally {
        cleanup = await cleanupAsset(assetId)
    }
    return {
        status: 'PASS',
        taskId: task.id,
        assetId,
        stateHistory: taskResult.history,
        runtimeSeconds: (Number(taskResult.status.update_timestamp_ms)
            - Number(taskResult.status.start_timestamp_ms)) / 1000,
        eecu: Number(taskResult.status.batch_eecu_usage_seconds || 0),
        visibility,
        graph,
        validation,
        cleanup,
        attempts: 1,
        retries: 0
    }
}

const sudanThresholds = () => initialThresholds({
    allocation: SUDAN_ALLOCATION,
    scale: SUDAN_STRATIFICATION_SCALE,
    multiplier: 2
})

const buildSudanCandidates = ({mode = 'forced-configured'} = {}) => {
    const configuredProjection = ee.Projection(SUDAN_STRATIFICATION_CRS).atScale(SUDAN_STRATIFICATION_SCALE)
    const source = ee.Image(SUDAN_SOURCE_ASSET).select(SUDAN_SOURCE_BAND)
    const sourceMask = source.mask().unmask(0).gt(0).toInt()
    const nativeLookup = source.unmask(SENTINEL).toInt().rename('observedClass')
        .addBands(sourceMask.rename('observedMask'))
    const region = ee.FeatureCollection(SUDAN_AOI_ASSET)
        .filter(ee.Filter.eq('id', SUDAN_AOI_KEY))
        .geometry(ee.ErrorMargin(1, 'meters'))
    const scenario = {
        name: 'sudan-random-two-grid-graph-only',
        arrangementProjection: ee.Projection(ARRANGEMENT_CRS),
        configuredProjection,
        nativeProjection: source.projection(),
        nativeClass: source.toInt(),
        nativeMask: sourceMask,
        nativeLookup,
        region,
        allocation: SUDAN_ALLOCATION,
        grid: {crs: ARRANGEMENT_CRS, scale: SUDAN_STRATIFICATION_SCALE}
    }
    const thresholds = sudanThresholds()
    const candidates = twoGridCandidates({
        scenario,
        mode,
        seed: SEED_A,
        loThresholds: SUDAN_ALLOCATION.map(() => 0),
        hiThresholds: thresholds
    }).select(EXPORT_PROPERTIES)
    return {scenario, thresholds, candidates}
}

const runSudanPreflight = async () => {
    await authenticate()
    const mode = process.env.SD_RANDOM_SUDAN_MODE || 'forced-configured'
    const {thresholds, candidates} = buildSudanCandidates({mode})
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    const reprojectBranch = assertReprojectOnCategoricalBranch(candidates)
    const totalRequested = SUDAN_ALLOCATION.reduce((sum, row) => sum + row.sampleSize, 0)
    const mappedArrangementCells = SUDAN_ALLOCATION.reduce((sum, row) =>
        sum + row.area / (SUDAN_STRATIFICATION_SCALE * SUDAN_STRATIFICATION_SCALE), 0)
    const expectedBaseCandidates = SUDAN_ALLOCATION.reduce((sum, row) =>
        sum + Math.min(
            row.area / (SUDAN_STRATIFICATION_SCALE * SUDAN_STRATIFICATION_SCALE),
            Math.max(row.sampleSize * 2, 10)
        ), 0)
    return {
        status: 'PASS',
        mode,
        reprojectBranch,
        source: {asset: SUDAN_SOURCE_ASSET, band: SUDAN_SOURCE_BAND},
        aoi: {asset: SUDAN_AOI_ASSET, id: SUDAN_AOI_KEY},
        stratificationGrid: {crs: SUDAN_STRATIFICATION_CRS, scale: SUDAN_STRATIFICATION_SCALE},
        arrangementGrid: {crs: 'EPSG:6933', scale: SUDAN_STRATIFICATION_SCALE},
        seed: SEED_A,
        totalRequested,
        thresholds,
        mappedArrangementCells,
        expectedBaseCandidates,
        graph,
        reducerInputBands: ['label', 'rank'],
        proposedFullScaleLimits: {
            runningMinutes: 45,
            batchEecuSeconds: 10000,
            rationale: 'Conservative research ceiling; the roadmap records same-grid Random success but not exact task metrics.'
        },
        exportsStarted: 0,
        retries: 0
    }
}

const isExpiredCredentials = error =>
    /401|unauthorized|invalid.*credential|invalid.*token|token.*(expired|revoked)|expired.*token/i.test(String(error))

const taskProgress = status => ({
    state: status.state,
    eecu: Number(status.batch_eecu_usage_seconds || 0),
    runningSeconds: status.start_timestamp_ms
        ? (Number(status.update_timestamp_ms || Date.now()) - Number(status.start_timestamp_ms)) / 1000
        : 0
})

const exceededLimit = ({eecu, runningSeconds}, limits) => runningSeconds / 60 > limits.runningMinutes
    ? 'runningMinutes'
    : eecu > limits.batchEecuSeconds ? 'batchEecuSeconds' : null

const nearLimit = ({eecu, runningSeconds}, limits) =>
    eecu > limits.batchEecuSeconds * NEAR_LIMIT_FRACTION
        || runningSeconds / 60 > limits.runningMinutes * NEAR_LIMIT_FRACTION

const monitorTask = async ({taskId, limits = SUDAN_LIMITS}) => {
    const history = []
    let cancellation = null
    for (;;) {
        const statuses = await callbackPromise(callback =>
            ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
        )
        const status = statuses[0]
        const progress = taskProgress(status)
        history.push({timestamp: Date.now(), ...progress})
        console.log(JSON.stringify({checkpoint: 'RANDOM_GRID_SUDAN_POLL', taskId, ...progress}))
        if (!['READY', 'RUNNING'].includes(progress.state)) {
            return {status, history, cancellation}
        }
        const exceeded = exceededLimit(progress, limits)
        if (exceeded && !cancellation) {
            cancellation = {reason: exceeded, ...progress}
            console.log(JSON.stringify({checkpoint: 'RANDOM_GRID_SUDAN_CANCEL', taskId, ...cancellation}))
            await callbackPromise(callback =>
                ee.data.cancelTask(taskId, (result, error) => callback(result, error))
            )
        }
        await sleep(nearLimit(progress, limits) ? POLL_INTERVAL.near : POLL_INTERVAL.far)
    }
}

const validateSudanAsset = async ({assetId, thresholds}) => {
    const collection = ee.FeatureCollection(assetId)
    const withStratumIndex = collection.map(feature =>
        feature.set('stratumIndex', feature.getNumber('label').subtract(1).divide(4).floor().toInt()))
    const outOfInterval = ee.FeatureCollection(SUDAN_ALLOCATION.map((_row, index) => collection
        .filter(ee.Filter.and(
            ee.Filter.gte('label', 4 * index + 1),
            ee.Filter.lt('label', 4 * index + 5)
        ))
        .filter(ee.Filter.or(
            ee.Filter.lt('rank', 0),
            ee.Filter.gte('rank', thresholds[index])
        )))).flatten().size()
    const actual = await evaluate(ee.Dictionary({
        size: collection.size(),
        distinctKeys: collection.aggregate_count_distinct('cellKey'),
        countsByStratumIndex: withStratumIndex.aggregate_histogram('stratumIndex'),
        properties: ee.Feature(collection.first()).propertyNames(),
        geometryTypes: collection.map(feature => ee.Feature(null, {type: feature.geometry().type()}))
            .aggregate_histogram('type'),
        completeRows: collection.filter(ee.Filter.notNull(EXPORT_PROPERTIES)).size(),
        rankMin: collection.aggregate_min('rank'),
        rankMax: collection.aggregate_max('rank'),
        outOfInterval
    }))
    const size = Number(actual.size)
    const distinctKeys = Number(actual.distinctKeys)
    const userProperties = actual.properties.filter(property => !property.startsWith('system:')).sort()
    assert(JSON.stringify(userProperties) === JSON.stringify([...EXPORT_PROPERTIES].sort()),
        `Sudan schema mismatch: ${JSON.stringify(userProperties)}`)
    assert(distinctKeys === size, `Sudan cellKey collision: ${size - distinctKeys} of ${size}`)
    assert(Number(actual.geometryTypes?.Point || 0) === size, 'Sudan asset has non-Point geometry')
    assert(Number(actual.completeRows) === size, 'Sudan asset has null label, rank or cellKey')
    assert(Number(actual.outOfInterval) === 0,
        `Sudan ranks outside their threshold interval: ${actual.outOfInterval}`)
    const countsByStratum = {}
    const ratioToRequested = {}
    const shortStrata = []
    SUDAN_ALLOCATION.forEach((row, index) => {
        const count = Number(actual.countsByStratumIndex[String(index)] || 0)
        countsByStratum[row.stratum] = count
        ratioToRequested[row.stratum] = Number((count / row.sampleSize).toFixed(4))
        if (count < row.sampleSize) {
            shortStrata.push({stratum: row.stratum, requested: row.sampleSize, candidates: count})
        }
    })
    return {
        size,
        distinctKeys,
        duplicates: size - distinctKeys,
        userProperties,
        geometryTypes: actual.geometryTypes,
        countsByStratum,
        ratioToRequested,
        shortStrata,
        repairRequired: !!shortStrata.length,
        rankRange: [Number(actual.rankMin), Number(actual.rankMax)],
        rankIntervalViolations: Number(actual.outOfInterval)
    }
}

const monitorAndValidateSudan = async ({taskId, assetId, thresholds}) => {
    const {status, history, cancellation} = await monitorTask({taskId})
    const runtimeSeconds = (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000
    const eecu = Number(status.batch_eecu_usage_seconds || 0)
    const outcome = {
        taskId,
        assetId,
        taskState: status.state,
        runtimeSeconds,
        eecu,
        cancellation,
        stateHistory: history,
        retries: 0
    }
    if (status.state !== 'COMPLETED') {
        return {status: 'FAILED', ...outcome, error: status.error_message || null, retained: false}
    }
    const visibility = await waitForVisibility(assetId)
    return {
        status: 'PASS',
        ...outcome,
        visibility,
        validation: await validateSudanAsset({assetId, thresholds}),
        retained: true
    }
}

const runSudanExport = async () => {
    await authenticate({linkedUser: true})
    const mode = process.env.SD_RANDOM_SUDAN_MODE || 'forced-configured'
    const {thresholds, candidates} = buildSudanCandidates({mode})
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    const reprojectBranch = assertReprojectOnCategoricalBranch(candidates)
    const startedAt = Date.now()
    const label = mode === 'forced-configured' ? '' : `${mode.replace(/-/g, '_')}_`
    const assetId = `${ASSET_ROOT}/sd_random_two_grid_candidates_sudan_${label}${startedAt}`
    const task = ee.batch.Export.table.toAsset(
        candidates,
        `sd-random-two-grid-candidates-sudan-${startedAt}`,
        assetId
    )
    task.start()
    // Emitted before any polling: the task outlives this process, so monitoring resumes from these ids alone.
    console.log(JSON.stringify({
        checkpoint: 'RANDOM_GRID_SUDAN_TASK_STARTED',
        taskId: task.id,
        assetId,
        mode,
        seed: SEED_A,
        thresholds,
        limits: SUDAN_LIMITS,
        graph
    }))
    return {
        mode,
        seed: SEED_A,
        graph,
        reprojectBranch,
        thresholds,
        ...await monitorAndValidateSudan({taskId: task.id, assetId, thresholds})
    }
}

const runSudanMonitor = async () => {
    const taskId = process.env.SD_RANDOM_TASK_ID
    const assetId = process.env.SD_RANDOM_ASSET_ID
    assert(taskId, 'SD_RANDOM_TASK_ID is required')
    assert(assetId, 'SD_RANDOM_ASSET_ID is required')
    await authenticate({linkedUser: true})
    return monitorAndValidateSudan({taskId, assetId, thresholds: sudanThresholds()})
}

const runTaskStatus = async () => {
    const taskIds = (process.env.SD_RANDOM_TASK_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
    assert(taskIds.length, 'SD_RANDOM_TASK_IDS is required')
    await authenticate({linkedUser: true})
    const statuses = []
    for (const taskId of taskIds) {
        const [status] = await callbackPromise(callback =>
            ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
        )
        statuses.push({
            taskId,
            state: status.state,
            eecu: Number(status.batch_eecu_usage_seconds || 0),
            startTimestampMs: Number(status.start_timestamp_ms || 0),
            updateTimestampMs: Number(status.update_timestamp_ms || 0),
            runtimeSeconds: (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000
        })
    }
    const assetIds = (process.env.SD_RANDOM_ASSET_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
    const assets = []
    for (const assetId of assetIds) {
        try {
            await callbackPromise(callback => ee.data.getAsset(assetId, (asset, error) => callback(asset, error)))
            assets.push({assetId, present: true})
        } catch (error) {
            assets.push({assetId, present: false, notFound: isNotFound(error)})
        }
    }
    return {status: 'PASS', polledAtMs: Date.now(), statuses, assets}
}

// Today's Random passes the stratification straight to reduceToVectors. The two-grid port inserts a reproject.
// For a projection-less RECIPE image those are not equivalent, and this decides which operation the port needs.
// The reference is the two-grid oracle - the class read on the Stratification grid at each exact cell centre -
// never the one-grid baseline, which is the answer the split exists to change.
const recipeOracleFrame = scenario => {
    const sampled = recipeLikeCategorical().rename('observedClass').reduceRegions({
        collection: explicitCells(scenario),
        reducer: ee.Reducer.first().forEach(['observedClass']),
        crs: scenario.configuredProjection,
        maxPixelsPerRegion: 1
    })
    return ee.Image.random(SEED_A, 'uniform').rename('rankA').reduceRegions({
        collection: sampled,
        reducer: ee.Reducer.first().forEach(['rankA']),
        crs: scenario.grid.crs,
        scale: scenario.grid.scale,
        maxPixelsPerRegion: 1
    })
}

const RECIPE_MODES = [
    'recipe-native',
    'recipe-default-projection',
    'recipe-reproject',
    'recipe-default-then-reproject'
]

const assetProjection = () => {
    const source = ee.Image(SUDAN_SOURCE_ASSET).select(SUDAN_SOURCE_BAND)
    const describe = image => ee.Dictionary({
        crs: image.projection().crs(),
        nominalScale: image.projection().nominalScale()
    })
    return ee.Dictionary({
        source: describe(source),
        unmasked: describe(source.unmask(SENTINEL)),
        masked: describe(source.updateMask(source.mask()))
    })
}

const runRecipeProjection = async () => {
    await authenticate()
    const scenario = buildFiniteScenario(
        finiteConfigs.find(({name}) => name === 'cross-crs-one-to-one-utm')
    )
    const oracle = await runRequest({
        name: 'recipe-projection:oracle',
        value: ee.Dictionary({rows: records(recipeOracleFrame(scenario), oracleRecord(scenario.allocation))})
    })
    const expected = expectedInterval(oracle.rows, {rankProperty: 'rankA', lo: FULL_LO, hi: FULL_HI})
    const results = {}
    for (const mode of RECIPE_MODES) {
        const collection = twoGridCandidates({
            scenario,
            seed: SEED_A,
            loThresholds: FULL_LO,
            hiThresholds: FULL_HI,
            mode
        })
        results[mode] = await runRequest({
            name: `recipe-projection:${mode}`,
            value: ee.Dictionary({
                rows: records(collection, candidateRecord(scenario.allocation)),
                size: collection.size(),
                distinctKeys: collection.aggregate_count_distinct('cellKey'),
                strata: collection.map(feature => feature.set(
                    'stratumIndex', feature.getNumber('label').subtract(1).divide(4).floor().toInt()
                )).aggregate_histogram('stratumIndex')
            })
        })
    }
    const baseline = results['recipe-native'].rows
    const versusOracle = diffRows({expected, actual: baseline})
    assert(!matches(versusOracle),
        'Recipe fixture does not discriminate: the one-grid baseline already equals the two-grid oracle')
    const modes = Object.fromEntries(RECIPE_MODES.map(mode => {
        const oracleDiff = diffRows({expected, actual: results[mode].rows})
        const baselineDiff = diffRows({expected: baseline, actual: results[mode].rows})
        return [mode, {
            size: Number(results[mode].size),
            distinctKeys: Number(results[mode].distinctKeys),
            distinctStrata: Object.keys(results[mode].strata || {}).length,
            strata: results[mode].strata,
            matchesTwoGridOracle: matches(oracleDiff),
            versusOracle: oracleDiff,
            implementsSplit: !matches(baselineDiff),
            versusOneGridBaseline: baselineDiff
        }]
    }))
    const correct = RECIPE_MODES.filter(mode => modes[mode].matchesTwoGridOracle)
    return {
        status: 'PASS',
        scenario: scenario.name,
        oracleRows: expected.length,
        oneGridBaselineVersusTwoGridOracle: versusOracle,
        modes,
        modesMatchingTwoGridOracle: correct,
        recipeArmResolved: correct.length > 0,
        assetProjection: await evaluate(assetProjection()),
        exportsStarted: 0,
        retries: 0
    }
}

// False positives only: every retained row is re-read at its exact reconstructed centre. Cannot detect a cell
// that should have been retained and was not - that is the windowed false-negative check.
// Must run as a batch task: 1000 point reads against the reprojected Sudan stratification time out interactively.
const buildSubsampleCheck = ({assetId, mode, subsampleSize}) => {
    const {scenario} = buildSudanCandidates({mode})
    const subsample = ee.FeatureCollection(assetId)
        .randomColumn('_subsample', SEED_B, 'uniform', ['cellKey'])
        .limit(subsampleSize, '_subsample')
    const reconstructed = subsample.map(feature => {
        const parts = feature.getString('cellKey').split(':')
        const i = ee.Number.parse(parts.getString(0)).toInt()
        const j = ee.Number.parse(parts.getString(1)).toInt()
        return ee.Feature(exactCell({scenario, i, j}).geometry, {
            cellKey: feature.get('cellKey'),
            label: feature.get('label'),
            rank: feature.get('rank'),
            i,
            j
        })
    })
    const withClass = categoricalForMode(scenario, mode).rename('observedClass').reduceRegions({
        collection: reconstructed,
        reducer: ee.Reducer.first().forEach(['observedClass']),
        crs: scenario.configuredProjection,
        maxPixelsPerRegion: 1
    })
    return ee.Image.random(SEED_A, 'uniform').rename('observedRank').reduceRegions({
        collection: withClass,
        reducer: ee.Reducer.first().forEach(['observedRank']),
        crs: scenario.grid.crs,
        scale: scenario.grid.scale,
        maxPixelsPerRegion: 1
    })
}

const validateSubsampleAsset = async assetId => {
    const collection = ee.FeatureCollection(assetId)
    const readable = collection.filter(ee.Filter.notNull(['observedClass', 'observedRank']))
    const checked = readable.map(feature => {
        const stratumIndex = feature.getNumber('label').subtract(1).divide(4).floor().toInt()
        const expectedStratum = ee.Number(ee.List(SUDAN_ALLOCATION.map(({stratum}) => stratum)).get(stratumIndex))
        return feature.set({
            classDifference: feature.getNumber('observedClass').subtract(expectedStratum).abs(),
            rankDifference: feature.getNumber('rank').subtract(feature.getNumber('observedRank')).abs()
        })
    })
    const actual = await evaluate(ee.Dictionary({
        size: collection.size(),
        readable: readable.size(),
        classMismatches: checked.filter(ee.Filter.gt('classDifference', 0)).size(),
        rankMismatches: checked.filter(ee.Filter.gt('rankDifference', 0)).size(),
        maximumRankDifference: checked.aggregate_max('rankDifference'),
        maximumClassDifference: checked.aggregate_max('classDifference')
    }))
    const size = Number(actual.size)
    const readableRows = Number(actual.readable)
    const classMismatches = Number(actual.classMismatches)
    const rankMismatches = Number(actual.rankMismatches)
    // A masked or unreadable pixel at an exported cell centre is itself a false positive: the cell was retained
    // but is not eligible at the exact point.
    assert(readableRows === size, `Masked or unreadable rows at exported centres: ${size - readableRows}`)
    assert(!classMismatches, `Class differs from the label-decoded stratum on ${classMismatches} rows`)
    assert(!rankMismatches, `Stored rank differs from Image.random at the cell centre on ${rankMismatches} rows`)
    return {
        size,
        readable: readableRows,
        maskedOrUnreadable: size - readableRows,
        classMismatches,
        rankMismatches,
        maximumClassDifference: Number(actual.maximumClassDifference),
        maximumRankDifference: Number(actual.maximumRankDifference)
    }
}

const runSubsampleMembership = async () => {
    const sourceAssetId = process.env.SD_RANDOM_ASSET_ID
    const mode = process.env.SD_RANDOM_SUDAN_MODE || 'production-asset'
    const subsampleSize = Number(process.env.SD_RANDOM_SUBSAMPLE || 1000)
    assert(sourceAssetId, 'SD_RANDOM_ASSET_ID is required')
    await authenticate({linkedUser: true})
    const checked = buildSubsampleCheck({assetId: sourceAssetId, mode, subsampleSize})
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_random_two_grid_membership_${startedAt}`
    const task = ee.batch.Export.table.toAsset(checked, `sd-random-two-grid-membership-${startedAt}`, assetId)
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'RANDOM_GRID_MEMBERSHIP_TASK_STARTED',
        taskId: task.id,
        assetId,
        sourceAssetId,
        mode,
        subsampleSize,
        limits: SUDAN_LIMITS
    }))
    const {status, history, cancellation} = await monitorTask({taskId: task.id})
    const outcome = {
        taskId: task.id,
        assetId,
        sourceAssetId,
        mode,
        subsampleSize,
        seed: SEED_A,
        subsampleSeed: SEED_B,
        taskState: status.state,
        runtimeSeconds: (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000,
        eecu: Number(status.batch_eecu_usage_seconds || 0),
        cancellation,
        stateHistory: history,
        retries: 0
    }
    if (status.state !== 'COMPLETED') {
        return {status: 'FAILED', ...outcome, error: status.error_message || null, retained: false}
    }
    const visibility = await waitForVisibility(assetId)
    return {
        status: 'PASS',
        ...outcome,
        visibility,
        validation: await validateSubsampleAsset(assetId),
        detects: 'false positives only',
        retained: true
    }
}

// Bounds raster work by AREA, not by scattered row count - the new hypothesis against item 4's recorded
// failure. Every cell in a window is enumerated, so one window yields false positives AND false negatives.
const WINDOW_SIZE = 100
// name=i:j centres a WINDOW_SIZE box; name=iMin:iMax:jMin:jMax gives an explicit box, which is how a rare
// stratum's cluster becomes an ordinary window rather than a scattered lookup.
const parseWindows = value => value.split(',').map(entry => {
    const [name, cell] = entry.split('=')
    const parts = String(cell).split(':').map(Number)
    assert(name && parts.every(Number.isFinite), `Bad window spec: ${entry}`)
    if (parts.length === 4) {
        const [iMin, iMax, jMin, jMax] = parts
        return {name, iRange: [iMin, iMax], jRange: [jMin, jMax]}
    }
    assert(parts.length === 2, `Bad window spec: ${entry}`)
    const [i, j] = parts
    const half = Math.floor(WINDOW_SIZE / 2)
    return {name, iRange: [i - half, i - half + WINDOW_SIZE - 1], jRange: [j - half, j - half + WINDOW_SIZE - 1]}
})

const windowCells = (scenario, {name, iRange, jRange}) =>
    explicitCells(scenario, {iRange, jRange}).map(feature => feature.set('window', name))

const windowOracle = (scenario, windows) => ee.FeatureCollection(windows.map(window => {
    const withClass = oracleLookup(scenario).reduceRegions({
        collection: windowCells(scenario, window),
        reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
        crs: scenario.configuredProjection,
        maxPixelsPerRegion: 1
    })
    return ee.Image.random(SEED_A, 'uniform').rename('observedRank').reduceRegions({
        collection: withClass,
        reducer: ee.Reducer.first().forEach(['observedRank']),
        crs: scenario.grid.crs,
        scale: scenario.grid.scale,
        maxPixelsPerRegion: 1
    })
})).flatten()

const runWindowOracleExport = async () => {
    const mode = process.env.SD_RANDOM_SUDAN_MODE || 'production-asset'
    const spec = process.env.SD_RANDOM_WINDOWS
    assert(spec, 'SD_RANDOM_WINDOWS is required, as name=i:j pairs')
    const windows = parseWindows(spec)
    await authenticate({linkedUser: true})
    const {scenario} = buildSudanCandidates({mode})
    const oracle = windowOracle(scenario, windows)
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_random_two_grid_windows_${startedAt}`
    const task = ee.batch.Export.table.toAsset(oracle, `sd-random-two-grid-windows-${startedAt}`, assetId)
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'RANDOM_GRID_WINDOW_TASK_STARTED',
        taskId: task.id,
        assetId,
        windows: windows.map(({name}) => name),
        windowSize: WINDOW_SIZE,
        enumeratedCells: windows.reduce((sum, {iRange, jRange}) =>
            sum + (iRange[1] - iRange[0] + 1) * (jRange[1] - jRange[0] + 1), 0),
        limits: SUDAN_LIMITS
    }))
    const {status, history, cancellation} = await monitorTask({taskId: task.id})
    const outcome = {
        taskId: task.id,
        assetId,
        mode,
        windows: windows.map(({name}) => name),
        windowSize: WINDOW_SIZE,
        taskState: status.state,
        runtimeSeconds: (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000,
        eecu: Number(status.batch_eecu_usage_seconds || 0),
        cancellation,
        stateHistory: history,
        retries: 0
    }
    if (status.state !== 'COMPLETED') {
        return {status: 'FAILED', ...outcome, error: status.error_message || null, retained: false}
    }
    const visibility = await waitForVisibility(assetId)
    const collection = ee.FeatureCollection(assetId)
    const counts = await evaluate(ee.Dictionary({
        size: collection.size(),
        byWindow: collection.aggregate_histogram('window'),
        readable: collection.filter(ee.Filter.notNull(['observedClass', 'observedRank'])).size()
    }))
    return {
        status: 'PASS',
        ...outcome,
        visibility,
        oracleCells: Number(counts.size),
        cellsByWindow: counts.byWindow,
        readableCells: Number(counts.readable),
        eecuPerCell: Number(counts.size) ? outcome.eecu / Number(counts.size) : null,
        retained: true
    }
}

// Exhaustive within each window: every enumerated cell either should or should not appear in the candidate
// table, so both false positives and false negatives are decidable. Join is on cellKey, so a candidate row the
// window oracle never enumerated is invisible here - only a concern for windows touching the AOI boundary.
const runWindowCompare = async () => {
    const oracleAssetId = process.env.SD_RANDOM_WINDOW_ASSET
    const candidateAssetId = process.env.SD_RANDOM_ASSET_ID
    assert(oracleAssetId, 'SD_RANDOM_WINDOW_ASSET is required')
    assert(candidateAssetId, 'SD_RANDOM_ASSET_ID is required')
    await authenticate({linkedUser: true})
    const thresholds = sudanThresholds()
    const strata = SUDAN_ALLOCATION.map(({stratum}) => stratum)
    const oracle = ee.FeatureCollection(oracleAssetId)
    const candidates = ee.FeatureCollection(candidateAssetId)
    const eligible = oracle
        .filter(ee.Filter.eq('observedMask', 1))
        .filter(ee.Filter.inList('observedClass', strata))
    const expected = eligible.map(feature => {
        const stratumIndex = ee.Number(ee.List(strata).indexOf(feature.getNumber('observedClass')))
        const threshold = ee.Number(ee.List(thresholds).get(stratumIndex))
        return feature.set({
            stratumIndex,
            expected: feature.getNumber('observedRank').lt(threshold)
        })
    }).filter(ee.Filter.eq('expected', 1))
    const matched = ee.Join.inner('oracle', 'candidate').apply(
        oracle, candidates, ee.Filter.equals({leftField: 'cellKey', rightField: 'cellKey'})
    ).map(feature => {
        const oracleRow = ee.Feature(feature.get('oracle'))
        const candidateRow = ee.Feature(feature.get('candidate'))
        const stratumIndex = candidateRow.getNumber('label').subtract(1).divide(4).floor().toInt()
        const decodedStratum = ee.Number(ee.List(strata).get(stratumIndex))
        const threshold = ee.Number(ee.List(thresholds).get(stratumIndex))
        return ee.Feature(null, {
            cellKey: oracleRow.get('cellKey'),
            window: oracleRow.get('window'),
            shouldBeRetained: oracleRow.getNumber('observedMask').eq(1)
                .and(oracleRow.getNumber('observedRank').lt(threshold)),
            classDifference: oracleRow.getNumber('observedClass').subtract(decodedStratum).abs(),
            rankDifference: oracleRow.getNumber('observedRank').subtract(candidateRow.getNumber('rank')).abs()
        })
    })
    const expectedMatched = ee.Join.inner('expected', 'candidate').apply(
        expected, candidates, ee.Filter.equals({leftField: 'cellKey', rightField: 'cellKey'})
    )
    const actual = await evaluate(ee.Dictionary({
        oracleCells: oracle.size(),
        eligibleCells: eligible.size(),
        expectedRetained: expected.size(),
        expectedRetainedFound: expectedMatched.size(),
        matched: matched.size(),
        falsePositives: matched.filter(ee.Filter.eq('shouldBeRetained', 0)).size(),
        classMismatches: matched.filter(ee.Filter.gt('classDifference', 0)).size(),
        rankMismatches: matched.filter(ee.Filter.gt('rankDifference', 0)).size(),
        byWindow: oracle.aggregate_histogram('window')
    }))
    const expectedRetained = Number(actual.expectedRetained)
    const expectedRetainedFound = Number(actual.expectedRetainedFound)
    const falseNegatives = expectedRetained - expectedRetainedFound
    const falsePositives = Number(actual.falsePositives)
    const classMismatches = Number(actual.classMismatches)
    const rankMismatches = Number(actual.rankMismatches)
    assert(!falseNegatives, `Window check found ${falseNegatives} false negatives`)
    assert(!falsePositives, `Window check found ${falsePositives} false positives`)
    assert(!classMismatches, `Window check found ${classMismatches} class mismatches`)
    assert(!rankMismatches, `Window check found ${rankMismatches} rank mismatches`)
    return {
        status: 'PASS',
        windowAssetId: oracleAssetId,
        candidateAssetId,
        oracleCells: Number(actual.oracleCells),
        cellsByWindow: actual.byWindow,
        eligibleCells: Number(actual.eligibleCells),
        expectedRetained,
        expectedRetainedFound,
        matched: Number(actual.matched),
        falseNegatives,
        falsePositives,
        classMismatches,
        rankMismatches,
        detects: 'false positives and false negatives within each window',
        exportsStarted: 0,
        retries: 0
    }
}

// Windows must be placed from real candidate cells: a guessed lon/lat centre produced an empty table after
// 250 EECU. Extreme i is the western/eastern extreme in the Arrangement CRS, which is what the distortion
// argument actually cares about.
const runWindowPlan = async () => {
    const assetId = process.env.SD_RANDOM_ASSET_ID
    const count = Number(process.env.SD_RANDOM_WINDOW_COUNT || 10)
    const sampleSize = Number(process.env.SD_RANDOM_PLAN_SAMPLE || 4000)
    assert(assetId, 'SD_RANDOM_ASSET_ID is required')
    await authenticate({linkedUser: true})
    const sample = ee.FeatureCollection(assetId)
        .randomColumn('_plan', SEED_A, 'uniform', ['cellKey'])
        .limit(sampleSize, '_plan')
    const raw = await evaluate(ee.Dictionary({
        cellKeys: sample.aggregate_array('cellKey'),
        labels: sample.aggregate_array('label')
    }))
    const cells = raw.cellKeys.map((cellKey, index) => {
        const [i, j] = String(cellKey).split(':').map(Number)
        return {cellKey, i, j, stratumIndex: Math.floor((Number(raw.labels[index]) - 1) / 4)}
    }).sort((a, b) => a.i - b.i)
    const picked = []
    for (let step = 0; step < count; step++) {
        const cell = cells[Math.min(cells.length - 1, Math.round((step * (cells.length - 1)) / (count - 1)))]
        if (!picked.some(({cellKey}) => cellKey === cell.cellKey)) {
            picked.push(cell)
        }
    }
    const named = picked.map((cell, index) => ({
        name: index === 0 ? 'west-extreme' : index === picked.length - 1 ? 'east-extreme' : `interior-${index}`,
        ...cell
    }))
    return {
        status: 'PASS',
        assetId,
        sampled: cells.length,
        iRange: [cells[0].i, cells[cells.length - 1].i],
        windows: named,
        spec: named.map(({name, i, j}) => `${name}=${i}:${j}`).join(','),
        strataCovered: [...new Set(named.map(({stratumIndex}) => stratumIndex))].sort((a, b) => a - b),
        exportsStarted: 0,
        retries: 0
    }
}

// Feature-only reconnaissance before any raster work: the spatial extent of a rare stratum's cells decides
// whether an exhaustive lookup is extent-driven or count-driven, which is the question item 4's failure raised.
const runStratumKeys = async () => {
    const assetId = process.env.SD_RANDOM_ASSET_ID
    const stratum = Number(process.env.SD_RANDOM_STRATUM || 8)
    assert(assetId, 'SD_RANDOM_ASSET_ID is required')
    const index = SUDAN_ALLOCATION.findIndex(row => row.stratum === stratum)
    assert(index >= 0, `Stratum ${stratum} is not in the Sudan allocation`)
    await authenticate({linkedUser: true})
    const rows = await evaluate(ee.FeatureCollection(assetId)
        .filter(ee.Filter.and(
            ee.Filter.gte('label', 4 * index + 1),
            ee.Filter.lt('label', 4 * index + 5)
        ))
        .aggregate_array('cellKey'))
    const cells = rows.map(cellKey => {
        const [i, j] = String(cellKey).split(':').map(Number)
        return {cellKey, i, j}
    })
    assert(cells.length, `No rows for stratum ${stratum}`)
    const iValues = cells.map(({i}) => i)
    const jValues = cells.map(({j}) => j)
    const extent = {
        iMin: Math.min(...iValues), iMax: Math.max(...iValues),
        jMin: Math.min(...jValues), jMax: Math.max(...jValues)
    }
    // Single-linkage clustering at a cell-gap threshold: cells within `gap` cells of a cluster join it, so each
    // cluster becomes one bounded raster read.
    const gap = Number(process.env.SD_RANDOM_CLUSTER_GAP || 200)
    const clusters = []
    for (const cell of [...cells].sort((a, b) => a.i - b.i || a.j - b.j)) {
        const near = clusters.find(cluster =>
            cell.i >= cluster.iMin - gap && cell.i <= cluster.iMax + gap
            && cell.j >= cluster.jMin - gap && cell.j <= cluster.jMax + gap)
        if (near) {
            near.iMin = Math.min(near.iMin, cell.i)
            near.iMax = Math.max(near.iMax, cell.i)
            near.jMin = Math.min(near.jMin, cell.j)
            near.jMax = Math.max(near.jMax, cell.j)
            near.cells.push(cell.cellKey)
        } else {
            clusters.push({iMin: cell.i, iMax: cell.i, jMin: cell.j, jMax: cell.j, cells: [cell.cellKey]})
        }
    }
    const scale = SUDAN_STRATIFICATION_SCALE
    return {
        status: 'PASS',
        assetId,
        stratum,
        rows: cells.length,
        extent,
        extentKilometres: {
            i: ((extent.iMax - extent.iMin) * scale) / 1000,
            j: ((extent.jMax - extent.jMin) * scale) / 1000
        },
        clusterGapCells: gap,
        clusters: clusters.map(cluster => ({
            cells: cluster.cells.length,
            iRange: [cluster.iMin, cluster.iMax],
            jRange: [cluster.jMin, cluster.jMax],
            spanCells: [cluster.iMax - cluster.iMin + 1, cluster.jMax - cluster.jMin + 1],
            enumeratedCells: (cluster.iMax - cluster.iMin + 1) * (cluster.jMax - cluster.jMin + 1)
        })),
        clusterCount: clusters.length,
        totalEnumeratedCells: clusters.reduce((sum, cluster) =>
            sum + (cluster.iMax - cluster.iMin + 1) * (cluster.jMax - cluster.jMin + 1), 0),
        cellKeys: cells.map(({cellKey}) => cellKey),
        exportsStarted: 0,
        retries: 0
    }
}

// A thinner gate than Systematic's: selection reads only label, rank and cellKey and touches no grid, so this
// confirms the 200k-row merged-candidate to validated-selection path at scale, NOT membership.
const runFinalSelection = async () => {
    const candidateAssetId = process.env.SD_RANDOM_ASSET_ID
    assert(candidateAssetId, 'SD_RANDOM_ASSET_ID is required')
    await authenticate({linkedUser: true})
    const sampleArrangement = {
        seed: SEED_A,
        crsId: 'EPSG:6933',
        crs: ARRANGEMENT_CRS,
        scale: SUDAN_STRATIFICATION_SCALE
    }
    const selected = selectStratifiedRandomSamples({
        candidates: ee.FeatureCollection(candidateAssetId),
        allocation: SUDAN_ALLOCATION,
        sampleArrangement,
        rowMetadata: false
    })
    const graph = graphCharacteristics(selected)
    assert(!graph.reduceToVectors && !graph.reproject && !graph.random && !graph.reduceRegions,
        `Final selection graph contains candidate-generation operators: ${JSON.stringify(graph)}`)
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_random_two_grid_final_${startedAt}`
    const task = ee.batch.Export.table.toAsset(selected, `sd-random-two-grid-final-${startedAt}`, assetId)
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'RANDOM_GRID_FINAL_TASK_STARTED',
        taskId: task.id,
        assetId,
        candidateAssetId,
        graph,
        limits: SUDAN_LIMITS
    }))
    const {status, history, cancellation} = await monitorTask({taskId: task.id})
    const outcome = {
        taskId: task.id,
        assetId,
        candidateAssetId,
        seed: SEED_A,
        graph,
        taskState: status.state,
        runtimeSeconds: (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000,
        eecu: Number(status.batch_eecu_usage_seconds || 0),
        cancellation,
        stateHistory: history,
        retries: 0
    }
    if (status.state !== 'COMPLETED') {
        return {status: 'FAILED', ...outcome, error: status.error_message || null, retained: false}
    }
    const visibility = await waitForVisibility(assetId)
    const collection = ee.FeatureCollection(assetId)
    const withStratum = collection.map(feature => feature.set(
        '_idMatchesCellKey', feature.getString('id').match('^-?[0-9]+:-?[0-9]+$').length()
    ))
    const actual = await evaluate(ee.Dictionary({
        size: collection.size(),
        distinctIds: collection.aggregate_count_distinct('id'),
        countsByStratum: collection.aggregate_histogram('stratum'),
        properties: ee.Feature(collection.first()).propertyNames(),
        geometryTypes: collection.map(feature => ee.Feature(null, {type: feature.geometry().type()}))
            .aggregate_histogram('type'),
        malformedIds: withStratum.filter(ee.Filter.eq('_idMatchesCellKey', 0)).size()
    }))
    const size = Number(actual.size)
    const requested = SUDAN_ALLOCATION.reduce((sum, row) => sum + row.sampleSize, 0)
    const countsByStratum = {}
    const wrongCounts = []
    SUDAN_ALLOCATION.forEach(row => {
        const count = Number(actual.countsByStratum[String(row.stratum)] || 0)
        countsByStratum[row.stratum] = count
        if (count !== row.sampleSize) {
            wrongCounts.push({stratum: row.stratum, requested: row.sampleSize, selected: count})
        }
    })
    const userProperties = actual.properties.filter(property => !property.startsWith('system:')).sort()
    assert(size === requested, `Selected ${size} rows, requested ${requested}`)
    assert(!wrongCounts.length, `Per-stratum counts differ: ${JSON.stringify(wrongCounts)}`)
    assert(Number(actual.distinctIds) === size, `Duplicate ids: ${size - Number(actual.distinctIds)}`)
    assert(Number(actual.malformedIds) === 0, `Malformed ids: ${actual.malformedIds}`)
    assert(Number(actual.geometryTypes?.Point || 0) === size, 'Selected asset has non-Point geometry')
    assert(JSON.stringify(userProperties) === JSON.stringify([...ROW_PROPERTY_NAMES].sort()),
        `Selected schema mismatch: ${JSON.stringify(userProperties)}`)
    return {
        status: 'PASS',
        ...outcome,
        visibility,
        validation: {
            size,
            requested,
            distinctIds: Number(actual.distinctIds),
            countsByStratum,
            userProperties,
            geometryTypes: actual.geometryTypes,
            malformedIds: Number(actual.malformedIds)
        },
        evidenceClass: 'selection path at scale, not membership',
        retained: true
    }
}

// Corroboration, not proof: two independently shaped graphs agreeing on every row at full scale cannot detect
// an error both make. Its value is stacked on the finite oracle, which is the independent reference.
const runCompareAssets = async () => {
    const leftId = process.env.SD_RANDOM_LEFT_ASSET
    const rightId = process.env.SD_RANDOM_RIGHT_ASSET
    assert(leftId, 'SD_RANDOM_LEFT_ASSET is required')
    assert(rightId, 'SD_RANDOM_RIGHT_ASSET is required')
    await authenticate({linkedUser: true})
    const left = ee.FeatureCollection(leftId)
    const right = ee.FeatureCollection(rightId)
    const joined = ee.Join.inner('left', 'right').apply(
        left, right, ee.Filter.equals({leftField: 'cellKey', rightField: 'cellKey'})
    )
    const differences = joined.map(feature => {
        const leftRow = ee.Feature(feature.get('left'))
        const rightRow = ee.Feature(feature.get('right'))
        return ee.Feature(null, {
            labelDifference: leftRow.getNumber('label').subtract(rightRow.getNumber('label')).abs(),
            rankDifference: leftRow.getNumber('rank').subtract(rightRow.getNumber('rank')).abs()
        })
    })
    const actual = await evaluate(ee.Dictionary({
        leftSize: left.size(),
        rightSize: right.size(),
        leftDistinctKeys: left.aggregate_count_distinct('cellKey'),
        rightDistinctKeys: right.aggregate_count_distinct('cellKey'),
        matched: joined.size(),
        labelMismatches: differences.filter(ee.Filter.gt('labelDifference', 0)).size(),
        rankMismatches: differences.filter(ee.Filter.gt('rankDifference', 0)).size(),
        maximumRankDifference: differences.aggregate_max('rankDifference')
    }))
    const leftSize = Number(actual.leftSize)
    const rightSize = Number(actual.rightSize)
    const matched = Number(actual.matched)
    const labelMismatches = Number(actual.labelMismatches)
    const rankMismatches = Number(actual.rankMismatches)
    return {
        status: 'PASS',
        left: {assetId: leftId, size: leftSize, distinctKeys: Number(actual.leftDistinctKeys)},
        right: {assetId: rightId, size: rightSize, distinctKeys: Number(actual.rightDistinctKeys)},
        matched,
        leftOnly: leftSize - matched,
        rightOnly: rightSize - matched,
        labelMismatches,
        rankMismatches,
        maximumRankDifference: Number(actual.maximumRankDifference),
        identical: leftSize === rightSize && matched === leftSize && !labelMismatches && !rankMismatches,
        evidenceClass: 'corroboration',
        exportsStarted: 0,
        retries: 0
    }
}

const runGraphPreflight = async () => {
    await authenticate()
    const scenario = buildFiniteScenario(
        finiteConfigs.find(({name}) => name === 'cross-crs-shifted-utm-isolated-class')
    )
    const candidates = twoGridCandidates({
        scenario,
        seed: SEED_A,
        loThresholds: BASE_LO,
        hiThresholds: BASE_HI
    }).select(EXPORT_PROPERTIES)
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    return {
        status: 'PASS',
        graph,
        reducerInputBands: ['label', 'rank'],
        exportedProperties: EXPORT_PROPERTIES,
        exportsStarted: 0,
        retries: 0
    }
}

const main = async () => {
    if (process.env.SD_RANDOM_MODEST_EXPORT === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_MODEST_EXPORT',
            ...await runModestExport()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_SUBSAMPLE_MEMBERSHIP === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_SUBSAMPLE_MEMBERSHIP',
            ...await runSubsampleMembership()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_FINAL_SELECTION === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_FINAL_SELECTION',
            ...await runFinalSelection()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_WINDOW_PLAN === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_WINDOW_PLAN',
            ...await runWindowPlan()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_STRATUM_KEYS === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_STRATUM_KEYS',
            ...await runStratumKeys()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_WINDOW_COMPARE === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_WINDOW_COMPARE',
            ...await runWindowCompare()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_WINDOW_ORACLE === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_WINDOW_ORACLE',
            ...await runWindowOracleExport()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_COMPARE_ASSETS === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_COMPARE_ASSETS',
            ...await runCompareAssets()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_RECIPE === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_RECIPE_PROJECTION',
            ...await runRecipeProjection()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_TASK_STATUS === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_TASK_STATUS',
            ...await runTaskStatus()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_SUDAN_EXPORT === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_SUDAN_EXPORT',
            ...await runSudanExport()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_SUDAN_MONITOR === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_SUDAN_MONITOR',
            ...await runSudanMonitor()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_SUDAN_PREFLIGHT === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_SUDAN_PREFLIGHT',
            ...await runSudanPreflight()
        }, null, 2))
        return
    }
    if (process.env.SD_RANDOM_GRAPH === '1') {
        console.log(JSON.stringify({
            checkpoint: 'RANDOM_GRID_GRAPH',
            ...await runGraphPreflight()
        }, null, 2))
        return
    }
    console.log(JSON.stringify({
        checkpoint: 'RANDOM_GRID_FINITE',
        ...await runFinite()
    }, null, 2))
}

main().catch(error => {
    // Exit 2 means only the credential expired: any running batch task is untouched and monitoring can resume.
    if (isExpiredCredentials(error)) {
        console.log(JSON.stringify({checkpoint: 'RANDOM_GRID_CREDENTIALS_EXPIRED', error: String(error)}))
        process.exitCode = 2
        return
    }
    console.error(error)
    process.exitCode = 1
})
