import ee from '#sepal/ee/ee'

import {
    googleProjectId,
    serviceAccountCredentials
} from '#gee/config'
import {resolveSamplingGridCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {levelBand} from '#sepal/ee/samplingDesign/systematicSampling'
import {nestedLevel} from '#sepal/ee/samplingDesign/systematicLatticeMath'

import {
    bufferOccupancyTile,
    occupancyEnvelopeAtScale
} from './occupancy-envelope.mjs'

const ARRANGEMENT_CRS = resolveSamplingGridCrs('EPSG:6933')
const SQRT3 = Math.sqrt(3)
const MAX_LATTICE_EXPONENT = 24
const SENTINEL = -9999
const GEOMETRY_TOLERANCE = 0.001
const OCCUPANCY_FILTER_TOLERANCE_METRES = 1
const BOUNDARY_EPSILON = 0.0005
const BOUNDARY_NEAR_DISTANCE = 0.08
const TILE_BOUNDARY_EXACT_TOLERANCE_METRES = 1e-6
const TILE_BOUNDARY_NEAR_DISTANCE_METRES = 20
const POLL_INTERVAL_MS = 2000
const OCCUPANCY_TILE_SIZE_METRES = 120
const NESTED_LEVELS = Array.from({length: 32}, (_unused, j) =>
    Array.from({length: 16}, (_unusedAgain, i) => nestedLevel(i, j))
).flat()

const requests = {
    authentication: 0,
    initialization: 0,
    finiteEquivalence: 0,
    exportStarts: 0,
    exportStatusPolls: 0,
    metadataVisibilityPolls: 0,
    rowReadabilityPolls: 0,
    readyAssetValidation: 0,
    assetDeletes: 0,
    cleanupVerifications: 0
}

const createdAssets = new Set()
let runningTask = null

const scenarioConfigs = [
    {
        name: 'same-crs-shifted-fixed',
        frameScale: 3,
        gridOrigin: 'FIXED',
        seed: 1,
        outer: [
            [-147, -116], [159, -109], [168, 62], [116, 142],
            [-131, 137], [-173, 17], [-147, -116]
        ],
        hole: [
            [-31, -29], [-31, 34], [37, 34], [37, -29], [-31, -29]
        ],
        layouts: [
            {targetStratum: 1, diameter: 32, requested: 20, densityOffset: 0},
            {targetStratum: 2, diameter: 32, requested: 12, densityOffset: 0}
        ],
        source: {
            crs: ARRANGEMENT_CRS,
            transform: [17, 0, -153, 0, -17, 187],
            classCount: 2,
            classShift: 1,
            maskPeriod: 9
        }
    },
    {
        name: 'prior-cross-crs-seeded',
        frameScale: 3,
        gridOrigin: 'SEEDED',
        seed: 7341,
        outer: [
            [-158, -121], [169, -113], [181, 47], [119, 151],
            [-129, 144], [-176, 23], [-158, -121]
        ],
        hole: [
            [-28, -31], [-28, 33], [38, 33], [38, -31], [-28, -31]
        ],
        layouts: [
            {targetStratum: 1, diameter: 64, requested: 26, densityOffset: 0},
            {targetStratum: 2, diameter: 64, requested: 18, densityOffset: 0},
            {targetStratum: 3, diameter: 128, requested: 9, densityOffset: 0}
        ],
        source: {
            crs: 'EPSG:32631',
            transform: [30, 0, 166007, 0, -30, 199],
            classCount: 3,
            classShift: 2,
            maskPeriod: 11
        }
    },
    {
        name: 'seeded-base-density',
        frameScale: 3,
        gridOrigin: 'SEEDED',
        seed: 991,
        outer: [
            [-139, -103], [151, -97], [163, 119], [39, 149],
            [-151, 102], [-139, -103]
        ],
        hole: [
            [-83, 11], [-83, 69], [-21, 69], [-21, 11], [-83, 11]
        ],
        layouts: [
            {targetStratum: 1, diameter: 64, requested: 14, densityOffset: 0},
            {targetStratum: 2, diameter: 64, requested: 8, densityOffset: 0}
        ],
        source: {
            crs: 'EPSG:32631',
            transform: [23, 0, 165979, 0, -23, 223],
            classCount: 2,
            classShift: 0,
            maskPeriod: 7
        }
    },
    {
        name: 'seeded-repair-density',
        frameScale: 3,
        gridOrigin: 'SEEDED',
        seed: 991,
        outer: [
            [-139, -103], [151, -97], [163, 119], [39, 149],
            [-151, 102], [-139, -103]
        ],
        hole: [
            [-83, 11], [-83, 69], [-21, 69], [-21, 11], [-83, 11]
        ],
        layouts: [
            {targetStratum: 1, diameter: 32, requested: 14, densityOffset: 1},
            {targetStratum: 2, diameter: 32, requested: 8, densityOffset: 1}
        ],
        source: {
            crs: 'EPSG:32631',
            transform: [23, 0, 165979, 0, -23, 223],
            classCount: 2,
            classShift: 0,
            maskPeriod: 7
        }
    },
    {
        name: 'isolated-pixels-cross-crs',
        frameScale: 3,
        gridOrigin: 'SEEDED',
        seed: 173,
        outer: [
            [-161, -117], [173, -107], [184, 73], [92, 153],
            [-142, 139], [-178, 9], [-161, -117]
        ],
        hole: [
            [-41, -27], [-41, 39], [31, 39], [31, -27], [-41, -27]
        ],
        layouts: [
            {targetStratum: 1, diameter: 64, requested: 18, densityOffset: 0},
            {targetStratum: 2, diameter: 64, requested: 10, densityOffset: 0}
        ],
        source: {
            crs: 'EPSG:32631',
            transform: [19, 0, 165991, 0, -19, 211],
            classCount: 2,
            classShift: 0,
            maskPeriod: 13,
            pattern: 'isolated'
        }
    },
    {
        name: 'submetre-tile-envelope-cross-crs',
        frameScale: 1,
        gridOrigin: 'FIXED',
        seed: 29,
        outer: [
            [-157, -151], [157, -151], [157, 157], [-151, 157],
            [-157, -151]
        ],
        hole: [
            [67, 37], [67, 71], [101, 71], [101, 37], [67, 37]
        ],
        layouts: [
            {targetStratum: 1, diameter: 16, requested: 32, densityOffset: 0},
            {targetStratum: 2, diameter: 16, requested: 24, densityOffset: 0}
        ],
        source: {
            crs: 'EPSG:32631',
            transform: [0.5, 0, 166000, 0, -0.5, 250],
            classCount: 2,
            classShift: 0,
            maskPeriod: 17
        }
    },
    {
        name: 'sudan-power-pattern',
        frameScale: 3,
        gridOrigin: 'FIXED',
        seed: 2,
        outer: [
            [-157, -119], [171, -111], [182, 59], [103, 149],
            [-137, 141], [-177, 13], [-157, -119]
        ],
        hole: [
            [61, 67], [61, 91], [89, 91], [89, 67], [61, 67]
        ],
        layouts: [
            {targetStratum: 1, diameter: 32, requested: 18, densityOffset: 0},
            {targetStratum: 2, diameter: 256, requested: 12, densityOffset: 0},
            {targetStratum: 3, diameter: 512, requested: 9, densityOffset: 0},
            {targetStratum: 4, diameter: 1024, requested: 6, densityOffset: 0},
            {targetStratum: 5, diameter: 2048, requested: 3, densityOffset: 0}
        ],
        source: {
            crs: 'EPSG:32631',
            transform: [20, 0, 165983, 0, -20, 217],
            classCount: 5,
            classShift: 3,
            maskPeriod: 17
        }
    }
]

const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor

const fixtureMembership = ({sourceU, sourceV, source}) => {
    const pixelX = Math.floor(Number(sourceU))
    const pixelY = Math.floor(Number(sourceV))
    const sourceMask = positiveModulo(pixelX * 7 + pixelY * 11, source.maskPeriod) === 0 ? 0 : 1
    const sourceClass = source.pattern === 'isolated'
        ? positiveModulo(pixelX, 4) === 0 && positiveModulo(pixelY, 4) === 0 ? 1 : 2
        : (pixelX * 3 + pixelY * 5 + source.classShift) % source.classCount + 1
    return {
        pixelX,
        pixelY,
        observedMask: sourceMask,
        observedClass: sourceMask ? sourceClass : SENTINEL,
        unmaskedClass: sourceClass
    }
}

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message)
    }
}

const near = (left, right, tolerance = GEOMETRY_TOLERANCE) =>
    Math.abs(Number(left) - Number(right)) <= tolerance

const handChecks = [
    {
        name: 'reported-point',
        source: scenarioConfigs[0].source,
        sourceU: (8 * SQRT3 + 153) / 17,
        sourceV: (120 - 187) / -17,
        expected: {pixelX: 9, pixelY: 3, observedClass: 2, observedMask: 1}
    },
    {
        name: 'positive-fractional',
        source: scenarioConfigs[1].source,
        sourceU: 5.75,
        sourceV: 6.25,
        expected: {pixelX: 5, pixelY: 6, observedClass: 3, observedMask: 1}
    },
    {
        name: 'negative-fractional',
        source: scenarioConfigs[1].source,
        sourceU: -0.2,
        sourceV: 4.7,
        expected: {pixelX: -1, pixelY: 4, observedClass: 2, observedMask: 1}
    },
    {
        name: 'negative-exact-integers',
        source: scenarioConfigs[0].source,
        sourceU: -1,
        sourceV: -2,
        expected: {pixelX: -1, pixelY: -2, observedClass: 1, observedMask: 1}
    }
]

const validatePreAuthenticationArithmetic = () => {
    const results = handChecks.map(check => {
        const actual = fixtureMembership(check)
        const passed = Object.entries(check.expected).every(([property, expected]) => actual[property] === expected)
        assert(passed, `${check.name}: ${JSON.stringify({actual, expected: check.expected})}`)
        return {...check, actual, passed}
    })
    const boundaries = [
        {value: 10 - BOUNDARY_EPSILON, expected: 9},
        {value: 10, expected: 10},
        {value: 10 + BOUNDARY_EPSILON, expected: 10},
        {value: -1 - BOUNDARY_EPSILON, expected: -2},
        {value: -1, expected: -1},
        {value: -1 + BOUNDARY_EPSILON, expected: -1}
    ].map(check => ({...check, actual: Math.floor(check.value)}))
    boundaries.forEach(({value, expected, actual}) =>
        assert(actual === expected, `boundary ${value}: expected ${expected}, got ${actual}`)
    )
    scenarioConfigs.forEach(({name, source: {transform}}) => {
        assert(transform[0] > 0 && transform[4] < 0, `${name}: source grid must be north-up`)
        assert(transform[1] === 0 && transform[3] === 0, `${name}: source grid must be axis-aligned`)
    })
    return {handChecks: results, boundaries}
}

const floorDiv = (value, divisor) => {
    const quotient = value / divisor
    return value % divisor < 0n ? quotient - 1n : quotient
}

const exactModuloNumerator = ({rootNumerator, denominator, period}) => {
    const scaledPeriod = denominator * BigInt(period)
    return rootNumerator - floorDiv(rootNumerator, scaledPeriod) * scaledPeriod
}

const parity = value => Number(((BigInt(value) % 2n) + 2n) % 2n)

const phaseShiftForRatio = ({phase, ratio}) => {
    const xDense = exactModuloNumerator({...phase.x, period: 16})
    const yDense = exactModuloNumerator({...phase.y, period: 32})
    const xCoarse = exactModuloNumerator({...phase.x, period: 16 * ratio})
    const yCoarse = exactModuloNumerator({...phase.y, period: 32 * ratio})
    const xDifference = xCoarse - xDense
    const yDifference = yCoarse - yDense
    assert(xDifference % phase.x.denominator === 0n,
        `x origin shift is not integral for ratio ${ratio}`)
    assert(yDifference % phase.y.denominator === 0n,
        `y origin shift is not integral for ratio ${ratio}`)
    const a = xDifference / phase.x.denominator
    const b = yDifference / phase.y.denominator
    assert(a % 16n === 0n, `x phase shift is not a multiple of 16 for ratio ${ratio}: ${a}`)
    assert(b % 32n === 0n, `y phase shift is not a multiple of 32 for ratio ${ratio}: ${b}`)
    return {a, b, xDense, yDense, xCoarse, yCoarse}
}

const coarseToDenseIndex = ({coarseI, coarseJ, ratio, a, b}) => {
    const r = BigInt(ratio)
    const denseJ = b + r * BigInt(coarseJ)
    const parityCorrection = (r * BigInt(parity(coarseJ)) - BigInt(parity(denseJ))) / 2n
    return {
        denseI: a + r * BigInt(coarseI) + parityCorrection,
        denseJ
    }
}

const denseToCoarseIndex = ({denseI, denseJ, ratio, a, b}) => {
    const r = BigInt(ratio)
    const jNumerator = BigInt(denseJ) - b
    if (jNumerator % r !== 0n) {
        return null
    }
    const coarseJ = jNumerator / r
    const correctionNumerator = r * BigInt(parity(coarseJ)) - BigInt(parity(denseJ))
    if (correctionNumerator % 2n !== 0n) {
        return null
    }
    const iNumerator = BigInt(denseI) - a - correctionNumerator / 2n
    if (iNumerator % r !== 0n) {
        return null
    }
    return {coarseI: iNumerator / r, coarseJ}
}

const exactCoordinateNumerators = ({phase, ratio, i, j}) => {
    const xOrigin = exactModuloNumerator({...phase.x, period: 16 * ratio})
    const yOrigin = exactModuloNumerator({...phase.y, period: 32 * ratio})
    return {
        xTwice: 2n * xOrigin
            + BigInt(2 * ratio) * BigInt(i) * phase.x.denominator
            + BigInt(parity(j) * ratio) * phase.x.denominator,
        y: yOrigin + BigInt(ratio) * BigInt(j) * phase.y.denominator
    }
}

const verifyNestedFamily = ({family, phase, ratios, minimumIndex = -4, maximumIndex = 4}) => {
    const results = ratios.map(ratio => {
        const shifts = phaseShiftForRatio({phase, ratio})
        const expected = new Map()
        let coordinateMismatches = 0
        let indexMismatches = 0
        let levelMismatches = 0
        for (let coarseJ = minimumIndex; coarseJ <= maximumIndex; coarseJ++) {
            for (let coarseI = minimumIndex; coarseI <= maximumIndex; coarseI++) {
                const dense = coarseToDenseIndex({...shifts, coarseI, coarseJ, ratio})
                const inverse = denseToCoarseIndex({...shifts, ...dense, ratio})
                if (!inverse
                    || inverse.coarseI !== BigInt(coarseI)
                    || inverse.coarseJ !== BigInt(coarseJ)) {
                    indexMismatches += 1
                }
                const coarseCoordinates = exactCoordinateNumerators({
                    phase,
                    ratio,
                    i: coarseI,
                    j: coarseJ
                })
                const denseCoordinates = exactCoordinateNumerators({
                    phase,
                    ratio: 1,
                    i: dense.denseI,
                    j: dense.denseJ
                })
                if (coarseCoordinates.xTwice !== denseCoordinates.xTwice
                    || coarseCoordinates.y !== denseCoordinates.y) {
                    coordinateMismatches += 1
                }
                const coarseLevel = nestedLevel(coarseI, coarseJ)
                const reconstructedLevel = nestedLevel(Number(inverse.coarseI), Number(inverse.coarseJ))
                if (coarseLevel !== reconstructedLevel) {
                    levelMismatches += 1
                }
                expected.set(`${dense.denseI}:${dense.denseJ}`, `${coarseI}:${coarseJ}`)
            }
        }
        const fineIndices = [...expected.keys()].map(key => key.split(':').map(BigInt))
        const denseIMin = fineIndices.reduce((minimum, [i]) => i < minimum ? i : minimum, fineIndices[0][0])
        const denseIMax = fineIndices.reduce((maximum, [i]) => i > maximum ? i : maximum, fineIndices[0][0])
        const denseJMin = fineIndices.reduce((minimum, [, j]) => j < minimum ? j : minimum, fineIndices[0][1])
        const denseJMax = fineIndices.reduce((maximum, [, j]) => j > maximum ? j : maximum, fineIndices[0][1])
        const selected = new Map()
        for (let denseJ = denseJMin - BigInt(ratio); denseJ <= denseJMax + BigInt(ratio); denseJ++) {
            if ((denseJ - shifts.b) % BigInt(ratio) !== 0n) {
                continue
            }
            for (let denseI = denseIMin - BigInt(ratio); denseI <= denseIMax + BigInt(ratio); denseI++) {
                const coarse = denseToCoarseIndex({...shifts, denseI, denseJ, ratio})
                if (coarse
                    && coarse.coarseI >= BigInt(minimumIndex) && coarse.coarseI <= BigInt(maximumIndex)
                    && coarse.coarseJ >= BigInt(minimumIndex) && coarse.coarseJ <= BigInt(maximumIndex)) {
                    selected.set(`${denseI}:${denseJ}`, `${coarse.coarseI}:${coarse.coarseJ}`)
                }
            }
        }
        const missing = [...expected.keys()].filter(key => !selected.has(key))
        const extra = [...selected.keys()].filter(key => !expected.has(key))
        const classIndexDifferences = [...expected].filter(([key, value]) => selected.get(key) !== value)
        assert(!missing.length && !extra.length && !classIndexDifferences.length
            && !coordinateMismatches && !indexMismatches && !levelMismatches,
        `Nested-family mismatch: ${JSON.stringify({
            family,
            phase: phase.name,
            ratio,
            missing: missing.slice(0, 3),
            extra: extra.slice(0, 3),
            classIndexDifferences: classIndexDifferences.slice(0, 3),
            coordinateMismatches,
            indexMismatches,
            levelMismatches
        })}`)
        return {
            ratio,
            comparedPoints: expected.size,
            phaseShiftI: shifts.a.toString(),
            phaseShiftJ: shifts.b.toString(),
            missing: missing.length,
            extra: extra.length,
            classIndexDifferences: classIndexDifferences.length,
            coordinateMismatches,
            levelMismatches
        }
    })
    return {family, phase: phase.name, ratios: results}
}

const validateExactNesting = () => {
    const rational = (numerator, denominator) => ({
        rootNumerator: BigInt(numerator),
        denominator: BigInt(denominator)
    })
    const phases = [
        {name: 'fixed', x: rational(0, 1), y: rational(0, 1)},
        {name: 'seeded-a', x: rational(123456789, 10000), y: rational(987654321, 100000)},
        {name: 'seeded-b', x: rational(765432109, 100000), y: rational(246813579, 10000)},
        {name: 'seeded-c', x: rational(16777213, 97), y: rational(33554429, 193)}
    ]
    const families = [
        {name: 'sudan-base', ratios: [1, 8, 16, 32, 64]},
        {name: 'base-and-one-step-repair', ratios: [1, 2, 16, 32, 64, 128]}
    ]
    const results = families.flatMap(family => phases.map(phase =>
        verifyNestedFamily({family: family.name, phase, ratios: family.ratios})
    ))
    const ratioResults = results.flatMap(result => result.ratios)
    return {
        status: 'PASS',
        exactArithmetic: 'BigInt rational lattice-basis coordinates',
        mapping: {
            denseJ: 'b + r * coarseJ',
            denseI: 'a + r * coarseI + (r * parity(coarseJ) - parity(denseJ)) / 2',
            phaseShiftI: 'a = (coarseOriginX - denseOriginX) / denseDx; a mod 16 = 0',
            phaseShiftJ: 'b = (coarseOriginY - denseOriginY) / denseDy; b mod 32 = 0'
        },
        phases: phases.length,
        families: families.length,
        ratioCases: ratioResults.length,
        comparedPoints: ratioResults.reduce((total, result) => total + result.comparedPoints, 0),
        missing: ratioResults.reduce((total, result) => total + result.missing, 0),
        extra: ratioResults.reduce((total, result) => total + result.extra, 0),
        classIndexDifferences: ratioResults.reduce((total, result) => total + result.classIndexDifferences, 0),
        coordinateMismatches: ratioResults.reduce((total, result) => total + result.coordinateMismatches, 0),
        levelMismatches: ratioResults.reduce((total, result) => total + result.levelMismatches, 0),
        results
    }
}

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})

const evaluate = (value, requestName) => {
    requests[requestName] += 1
    return new Promise((resolve, reject) => {
        value.evaluate((result, error) => error ? reject(error) : resolve(result))
    })
}

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
    requests.authentication += 1
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
    requests.initialization += 1
    await new Promise((resolve, reject) => ee.initialize(null, null, resolve, reject, null, projectId))
    ee.setMaxRetries(0)
}

const makeRegion = (config, projection) => {
    const scaleRing = ring => ring.map(([x, y]) => [x * (config.frameScale || 1), y * (config.frameScale || 1)])
    return ee.Geometry.Polygon([scaleRing(config.outer), scaleRing(config.hole)], projection, false)
}

const seededRootOrigin = ({gridOrigin, seed, nominalScale}) => {
    if (gridOrigin !== 'SEEDED') {
        return {x: ee.Number(0), y: ee.Number(0)}
    }
    const eeSeed = ee.Number(seed)
    const values = ee.FeatureCollection([ee.Feature(null, null)])
        .randomColumn('x', eeSeed.add(2))
        .randomColumn('y', eeSeed.add(3))
        .first()
    const periodX = ee.Number(SQRT3 * Math.pow(2, MAX_LATTICE_EXPONENT)).divide(nominalScale)
    const periodY = ee.Number(3 * Math.pow(2, MAX_LATTICE_EXPONENT)).divide(nominalScale)
    return {
        x: ee.Number(values.get('x')).multiply(periodX),
        y: ee.Number(values.get('y')).multiply(periodY)
    }
}

const buildScenarios = () => scenarioConfigs.map(config => {
    const projection = ee.Projection(ARRANGEMENT_CRS)
    const nominalScale = projection.nominalScale()
    const rootOrigin = seededRootOrigin({...config, nominalScale})
    const region = makeRegion(config, projection)
    const sourceProjection = ee.Projection(config.source.crs, config.source.transform)
    const layouts = config.layouts.map(layoutConfig => {
        const distance = ee.Number(layoutConfig.diameter).divide(nominalScale)
        const dx = distance.multiply(SQRT3)
        const dy = distance.multiply(1.5)
        return {
            ...layoutConfig,
            projection,
            dx,
            dy,
            originX: rootOrigin.x.mod(dx.multiply(16)),
            originY: rootOrigin.y.mod(dy.multiply(32))
        }
    })
    return {...config, projection, nominalScale, rootOrigin, region, sourceProjection, layouts}
})

const exactPoint = ({i, j, dx, dy, originX, originY, projection}) => {
    const eeI = ee.Number(i)
    const eeJ = ee.Number(j)
    const parity = eeJ.mod(2).add(2).mod(2)
    const x = ee.Number(originX).add(eeI.multiply(dx)).add(parity.multiply(ee.Number(dx).divide(2)))
    const y = ee.Number(originY).add(eeJ.multiply(dy))
    return {x, y, geometry: ee.Geometry.Point([x, y], projection)}
}

const buildAdversarialBufferScenario = () => {
    const projection = ee.Projection(ARRANGEMENT_CRS)
    const nominalScale = projection.nominalScale()
    const source = {
        crs: 'EPSG:32631',
        transform: [30, 0, 166000, 0, -30, 125]
    }
    const sourceProjection = ee.Projection(source.crs, source.transform)
    const rootOrigin = {x: ee.Number(0.5), y: ee.Number(0.5)}
    const layouts = [
        {targetStratum: 91, diameter: 32, requested: 1, densityOffset: 0},
        {targetStratum: 92, diameter: 32, requested: 1, densityOffset: 0}
    ].map(layout => {
        const distance = ee.Number(layout.diameter).divide(nominalScale)
        return {
            ...layout,
            projection,
            dx: distance.multiply(SQRT3),
            dy: distance.multiply(1.5),
            originX: rootOrigin.x,
            originY: rootOrigin.y
        }
    })
    const scenario = {
        name: 'adversarial-buffer-required-cross-crs',
        gridOrigin: 'FIXTURE_PHASE',
        seed: 0,
        projection,
        nominalScale,
        rootOrigin,
        region: ee.Geometry.Rectangle([-5, -5, 125, 125], projection, false, true),
        source,
        sourceProjection,
        layouts
    }
    const targets = [
        {name: 'corner', targetStratum: 91, i: 0, j: 0},
        {name: 'edge', targetStratum: 92, i: 0, j: 2}
    ].map(target => {
        const layout = layouts.find(({targetStratum}) => targetStratum === target.targetStratum)
        const point = exactPoint({...layout, i: target.i, j: target.j})
        const sourceCoordinates = point.geometry.transform(
            sourceProjection,
            ee.ErrorMargin(0.01, 'projected')
        ).coordinates()
        return {
            ...target,
            point,
            sourceCellX: ee.Number(sourceCoordinates.get(0)).floor().toInt(),
            sourceCellY: ee.Number(sourceCoordinates.get(1)).floor().toInt()
        }
    })
    const coordinates = ee.Image.pixelCoordinates(sourceProjection)
    const pixelX = coordinates.select('x').floor().toInt()
    const pixelY = coordinates.select('y').floor().toInt()
    const targetMasks = targets.map(target => pixelX.eq(target.sourceCellX).and(pixelY.eq(target.sourceCellY)))
    const sourceMask = ee.ImageCollection.fromImages(targetMasks).max().toInt()
    const sourceClass = ee.Image(SENTINEL)
        .where(targetMasks[0], targets[0].targetStratum)
        .where(targetMasks[1], targets[1].targetStratum)
        .toInt()
    scenario.lookupImage = sourceClass.updateMask(sourceMask).unmask(SENTINEL).rename('observedClass')
        .addBands(sourceMask.unmask(0).rename('observedMask'))
        .setDefaultProjection(sourceProjection)
    scenario.bufferWitnessTargets = targets
    return scenario
}

const paddedEnumerationRect = ({region, projection, dx, dy}) => {
    const ring = ee.List(region.bounds(1, projection).coordinates().get(0))
    const xs = ring.map(point => ee.List(point).getNumber(0))
    const ys = ring.map(point => ee.List(point).getNumber(1))
    const pad = ee.Number(dx).max(dy).multiply(2)
    return ee.Geometry.Rectangle([
        ee.Number(xs.reduce(ee.Reducer.min())).subtract(pad),
        ee.Number(ys.reduce(ee.Reducer.min())).subtract(pad),
        ee.Number(xs.reduce(ee.Reducer.max())).add(pad),
        ee.Number(ys.reduce(ee.Reducer.max())).add(pad)
    ], projection, false, true)
}

const withRawProperties = ({feature, scenario, layout}) => {
    const i = ee.Number(feature.get('i')).toInt()
    const j = ee.Number(feature.get('j')).toInt()
    const {x, y, geometry} = exactPoint({...layout, i, j})
    const key = ee.Number(layout.targetStratum).format('%d')
        .cat(':').cat(i.format('%d')).cat(':').cat(j.format('%d'))
    return feature
        .setGeometry(geometry)
        .set({
            scenario: scenario.name,
            key,
            targetStratum: layout.targetStratum,
            requested: layout.requested,
            densityOffset: layout.densityOffset,
            i,
            j,
            level: feature.get('level'),
            dx: layout.dx,
            dy: layout.dy,
            originX: layout.originX,
            originY: layout.originY,
            arrangementX: x,
            arrangementY: y
        })
}

const analyticalRawLayout = ({scenario, layout}) => {
    const coordinates = ee.Image.pixelCoordinates(scenario.projection)
    const i = coordinates.select('x').subtract(layout.originX).divide(layout.dx).floor().int32().rename('i')
    const j = coordinates.select('y').subtract(layout.originY).divide(layout.dy).floor().int32().rename('j')
    const label = i.long().leftShift(32).add(j.long()).rename('label')
    return label.addBands(i).addBands(j).addBands(levelBand(i, j))
        .reduceToVectors({
            reducer: ee.Reducer.first(),
            geometry: paddedEnumerationRect({
                region: scenario.region,
                projection: scenario.projection,
                dx: layout.dx,
                dy: layout.dy
            }),
            crs: ARRANGEMENT_CRS,
            scale: ee.Number(layout.dx).min(layout.dy).divide(2),
            geometryType: 'centroid',
            labelProperty: 'label',
            maxPixels: 1e13,
            tileScale: 4,
            bestEffort: false
        })
        .map(feature => withRawProperties({feature, scenario, layout}))
        .filterBounds(scenario.region)
}

const flattenCollections = collections => ee.FeatureCollection(collections).flatten()

const rawForScenario = scenario => flattenCollections(
    scenario.layouts.map(layout => analyticalRawLayout({scenario, layout}))
)

const prepareReference = ({scenario, raw, source = 'reference'}) => raw.map(feature => {
    const gridCoordinates = feature.geometry()
        .transform(scenario.sourceProjection, GEOMETRY_TOLERANCE).coordinates()
    return feature.set({
        source,
        sourceU: gridCoordinates.get(0),
        sourceV: gridCoordinates.get(1)
    })
})

const correctedSyntheticImage = scenario => {
    const coordinates = ee.Image.pixelCoordinates(scenario.sourceProjection)
    const pixelX = coordinates.select('x').floor().toInt()
    const pixelY = coordinates.select('y').floor().toInt()
    const sourceClass = scenario.source.pattern === 'isolated'
        ? pixelX.mod(4).eq(0).and(pixelY.mod(4).eq(0)).where(
            pixelX.mod(4).neq(0).or(pixelY.mod(4).neq(0)), 2
        ).toInt()
        : pixelX.multiply(3).add(pixelY.multiply(5)).add(scenario.source.classShift)
            .mod(scenario.source.classCount).add(1).toInt()
    const sourceMask = pixelX.multiply(7).add(pixelY.multiply(11))
        .mod(scenario.source.maskPeriod).neq(0).toInt()
    return sourceClass.updateMask(sourceMask).unmask(SENTINEL).rename('observedClass')
        .addBands(sourceMask.unmask(0).rename('observedMask'))
}

const lookupImageForScenario = scenario => scenario.lookupImage || correctedSyntheticImage(scenario)

const eligibleMask = ({scenario, targetStrata}) => {
    const lookup = lookupImageForScenario(scenario)
    const eligibleClass = ee.ImageCollection.fromImages(
        targetStrata.map(targetStratum => lookup.select('observedClass').eq(targetStratum))
    ).max()
    return eligibleClass
        .and(lookup.select('observedMask').eq(1))
        .unmask(0)
        .toByte()
        .setDefaultProjection(scenario.sourceProjection)
}

const overlapProxy = ({scenario, targetStrata}) => eligibleMask({scenario, targetStrata})
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

const proxyLayout = ({scenario, layout}) => {
    const markerScale = Math.abs(scenario.source.transform[0])
    const h = ee.Number(markerScale).divide(scenario.nominalScale).divide(2)
    const coordinates = ee.Image.pixelCoordinates(scenario.projection)
    const px = coordinates.select('x')
    const py = coordinates.select('y')
    const j = py.subtract(h).subtract(layout.originY).divide(layout.dy).ceil().int32()
    const parity = j.mod(2).add(2).mod(2)
    const i = px.subtract(h).subtract(layout.originX).subtract(parity.multiply(layout.dx.divide(2)))
        .divide(layout.dx).ceil().int32()
    const exactX = i.multiply(layout.dx).add(parity.multiply(layout.dx.divide(2))).add(layout.originX)
    const exactY = j.multiply(layout.dy).add(layout.originY)
    const marker = exactY.gte(py.subtract(h)).and(exactY.lt(py.add(h)))
        .and(exactX.gte(px.subtract(h))).and(exactX.lt(px.add(h)))
    const accepted = marker.and(overlapProxy({
        scenario,
        targetStrata: [layout.targetStratum]
    }).gt(0))
    const label = i.long().leftShift(32).add(j.long()).rename('label')
    const image = label
        .addBands(i.rename('i'))
        .addBands(j.rename('j'))
        .addBands(levelBand(i, j))
        .updateMask(accepted)
    const vectorizationRegion = scenario.region.buffer(
        markerScale * 2,
        ee.ErrorMargin(markerScale, 'projected'),
        scenario.projection
    )
    return image.reduceToVectors({
        reducer: ee.Reducer.first(),
        geometry: vectorizationRegion,
        crs: ARRANGEMENT_CRS,
        scale: markerScale,
        geometryType: 'centroid',
        labelProperty: 'label',
        maxPixels: 1e13,
        tileScale: 4,
        bestEffort: false
    })
        .map(feature => withRawProperties({feature, scenario, layout}).set('source', 'proxy'))
        .filterBounds(scenario.region)
}

const proxyForScenario = scenario => flattenCollections(
    scenario.layouts.map(layout => proxyLayout({scenario, layout}))
)

const layoutGroups = scenario => {
    const groups = new Map()
    scenario.layouts.forEach(layout => {
        const effectivePhase = `${scenario.gridOrigin}:${scenario.seed}`
        const groupingKey = [
            layout.diameter,
            layout.densityOffset,
            effectivePhase,
            ARRANGEMENT_CRS
        ].join('|')
        const group = groups.get(groupingKey) || {
            ...layout,
            layoutGroupId: `${scenario.name}:layout-${groups.size + 1}`,
            targetStrata: [],
            requestedByStratum: {}
        }
        group.targetStrata.push(layout.targetStratum)
        group.requestedByStratum[String(layout.targetStratum)] = layout.requested
        groups.set(groupingKey, group)
    })
    return [...groups.values()]
}

const withGroupedProperties = ({feature, scenario, group}) => {
    const i = ee.Number(feature.get('i')).toInt()
    const j = ee.Number(feature.get('j')).toInt()
    const {x, y, geometry} = exactPoint({...group, i, j})
    const groupKey = ee.String(group.layoutGroupId)
        .cat(':').cat(i.format('%d')).cat(':').cat(j.format('%d'))
    return feature.setGeometry(geometry).set({
        scenario: scenario.name,
        key: groupKey,
        layoutGroupId: group.layoutGroupId,
        layoutStrata: group.targetStrata,
        requestedByStratum: group.requestedByStratum,
        densityOffset: group.densityOffset,
        i,
        j,
        level: feature.get('level'),
        dx: group.dx,
        dy: group.dy,
        originX: group.originX,
        originY: group.originY,
        arrangementX: x,
        arrangementY: y,
        source: 'groupedProxy'
    })
}

const groupedProxyLayout = ({scenario, group}) => {
    const markerScale = Math.abs(scenario.source.transform[0])
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
    const accepted = marker.and(overlapProxy({scenario, targetStrata: group.targetStrata}).gt(0))
    const label = i.long().leftShift(32).add(j.long()).rename('label')
    const image = label.addBands(i.rename('i')).addBands(j.rename('j'))
        .addBands(levelBand(i, j)).updateMask(accepted)
    const vectorizationRegion = scenario.region.buffer(
        markerScale * 2,
        ee.ErrorMargin(markerScale, 'projected'),
        scenario.projection
    )
    return image.reduceToVectors({
        reducer: ee.Reducer.first(),
        geometry: vectorizationRegion,
        crs: ARRANGEMENT_CRS,
        scale: markerScale,
        geometryType: 'centroid',
        labelProperty: 'label',
        maxPixels: 1e13,
        tileScale: 4,
        bestEffort: false
    })
        .map(feature => withGroupedProperties({feature, scenario, group}))
        .filterBounds(scenario.region)
}

const groupedProxyForScenario = scenario => flattenCollections(
    layoutGroups(scenario).map(group => groupedProxyLayout({scenario, group}))
)

const singleLatticePlan = scenario => {
    const densest = scenario.layouts.reduce(
        (current, layout) => layout.diameter < current.diameter ? layout : current,
        scenario.layouts[0]
    )
    const denseQuotientX = scenario.rootOrigin.x.divide(densest.dx.multiply(16)).floor()
    const denseQuotientY = scenario.rootOrigin.y.divide(densest.dy.multiply(32)).floor()
    const layouts = scenario.layouts.map(layout => {
        const ratio = layout.diameter / densest.diameter
        assert(Number.isSafeInteger(ratio) && ratio >= 1 && (ratio & (ratio - 1)) === 0,
            `${scenario.name}: diameter ${layout.diameter} is not a power-of-two multiple of ${densest.diameter}`)
        const quotientX = scenario.rootOrigin.x.divide(layout.dx.multiply(16)).floor()
        const quotientY = scenario.rootOrigin.y.divide(layout.dy.multiply(32)).floor()
        return {
            ...layout,
            ratio,
            phaseShiftI: denseQuotientX.subtract(quotientX.multiply(ratio)).multiply(16).toInt(),
            phaseShiftJ: denseQuotientY.subtract(quotientY.multiply(ratio)).multiply(32).toInt(),
            proxyBand: `eligible_${layout.targetStratum}`
        }
    })
    return {densest, layouts}
}

const singleLayoutIndices = ({denseI, denseJ, layout}) => {
    const ratio = ee.Number(layout.ratio).toInt()
    const jNumerator = denseJ.subtract(layout.phaseShiftJ).toInt()
    const coarseJ = jNumerator.divide(ratio).floor().toInt()
    const correctionNumerator = coarseJ.mod(2).add(2).mod(2).multiply(ratio)
        .subtract(denseJ.mod(2).add(2).mod(2))
    const correction = correctionNumerator.divide(2).toInt()
    const iNumerator = denseI.subtract(layout.phaseShiftI).subtract(correction).toInt()
    const coarseI = iNumerator.divide(ratio).floor().toInt()
    return {
        i: coarseI,
        j: coarseJ,
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
    const lookup = lookupImageForScenario(scenario)
    const mask = lookup.select('observedMask').eq(1)
    const bands = plan.layouts.map(layout => lookup.select('observedClass')
        .eq(layout.targetStratum)
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

const occupancyBands = scenario => scenario.layouts.map(({targetStratum}) => `has_${targetStratum}`)

const tileGeometry = ({scenario, tileI, tileJ, tileSizeMetres = OCCUPANCY_TILE_SIZE_METRES}) => {
    const tileSize = ee.Number(tileSizeMetres).divide(scenario.nominalScale)
    const minX = ee.Number(tileI).multiply(tileSize)
    const minY = ee.Number(tileJ).multiply(tileSize)
    return ee.Geometry.Rectangle([
        minX,
        minY,
        minX.add(tileSize),
        minY.add(tileSize)
    ], scenario.projection, false, true)
}

const occupancyTiles = ({scenario, tileSizeMetres = OCCUPANCY_TILE_SIZE_METRES}) => {
    const tileSize = ee.Number(tileSizeMetres).divide(scenario.nominalScale)
    const coordinates = ee.Image.pixelCoordinates(scenario.projection)
    const tileI = coordinates.select('x').divide(tileSize).floor().int32().rename('tileI')
    const tileJ = coordinates.select('y').divide(tileSize).floor().int32().rename('tileJ')
    const label = tileI.long().leftShift(32).add(tileJ.long()).rename('label')
    const enumerationRegion = scenario.region.bounds(1, scenario.projection).buffer(
        tileSizeMetres * 2,
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
    return label.addBands(tileI).addBands(tileJ).reduceToVectors({
        reducer: ee.Reducer.first(),
        geometry: enumerationRegion,
        crs: ARRANGEMENT_CRS,
        scale: tileSizeMetres / 2,
        geometryType: 'centroid',
        labelProperty: 'label',
        maxPixels: 1e13,
        tileScale: 4,
        bestEffort: false
    }).map(feature => {
        const i = feature.getNumber('tileI').toInt()
        const j = feature.getNumber('tileJ').toInt()
        return feature.setGeometry(tileGeometry({scenario, tileI: i, tileJ: j, tileSizeMetres})).set({
            scenario: scenario.name,
            tileKey: i.format('%d').cat(':').cat(j.format('%d')),
            tileI: i,
            tileJ: j,
            tileSizeMetres
        })
    }).filter(ee.Filter.bounds(
        filterRegion,
        ee.ErrorMargin(OCCUPANCY_FILTER_TOLERANCE_METRES, 'meters')
    ))
}

const occupancyPresenceImage = scenario => {
    const lookup = lookupImageForScenario(scenario)
    return lookup.select('observedClass')
        .updateMask(lookup.select('observedMask').eq(1))
        .rename('occupancyClass')
        .setDefaultProjection(scenario.sourceProjection)
}

const occupancyHistogramTable = ({scenario, tiles, source = 'occupancyRow'}) =>
    occupancyPresenceImage(scenario).reduceRegions({
        collection: tiles,
        reducer: ee.Reducer.frequencyHistogram().unweighted(),
        crs: scenario.sourceProjection,
        tileScale: 4,
        maxPixelsPerRegion: 1e6
    }).map(feature => {
        const tileI = feature.getNumber('tileI').toInt()
        const tileJ = feature.getNumber('tileJ').toInt()
        const histogram = ee.Dictionary(ee.Algorithms.If(
            feature.get('histogram'),
            feature.get('histogram'),
            ee.Dictionary({})
        ))
        const presence = Object.fromEntries(scenario.layouts.map(({targetStratum}) => [
            `has_${targetStratum}`,
            ee.Number(histogram.get(String(targetStratum), 0)).gt(0).toInt()
        ]))
        return feature.setGeometry(tileGeometry({scenario, tileI, tileJ})).set({
            source,
            tileI,
            tileJ,
            ...presence
        })
    })

const occupancyTable = ({scenario, tiles = occupancyTiles({scenario})}) => {
    const bufferedTiles = tiles.map(feature => feature.setGeometry(bufferOccupancyTile({
        ee,
        geometry: feature.geometry(),
        sourceProjection: scenario.sourceProjection
    })))
    return occupancyHistogramTable({scenario, tiles: bufferedTiles})
}

const occupancyMaskImage = ({scenario, occupancy}) => ee.Image.cat(
    occupancyBands(scenario).map(band => occupancy.reduceToImage({
        properties: [band],
        reducer: ee.Reducer.max()
    }).rename(band.replace('has_', 'eligible_')))
).unmask(0).toByte()

const singleProxyForScenario = (scenario, proxyOverride) => {
    const plan = singleLatticePlan(scenario)
    const dense = plan.densest
    const markerScale = Math.abs(scenario.source.transform[0])
    const h = ee.Number(markerScale).divide(scenario.nominalScale).divide(2)
    const coordinates = ee.Image.pixelCoordinates(scenario.projection)
    const px = coordinates.select('x')
    const py = coordinates.select('y')
    const denseJ = py.subtract(h).subtract(dense.originY).divide(dense.dy).ceil().int32()
    const denseParity = denseJ.mod(2).add(2).mod(2)
    const denseI = px.subtract(h).subtract(dense.originX).subtract(denseParity.multiply(dense.dx.divide(2)))
        .divide(dense.dx).ceil().int32()
    const exactX = denseI.multiply(dense.dx).add(denseParity.multiply(dense.dx.divide(2))).add(dense.originX)
    const exactY = denseJ.multiply(dense.dy).add(dense.originY)
    const marker = exactY.gte(py.subtract(h)).and(exactY.lt(py.add(h)))
        .and(exactX.gte(px.subtract(h))).and(exactX.lt(px.add(h)))
    const proxy = proxyOverride || multibandOverlapProxy({scenario, plan})
    const acceptedByLayout = plan.layouts.map(layout => singleLayoutIndices({denseI, denseJ, layout}).belongs
        .and(proxy.select(layout.proxyBand).gt(0)))
    const accepted = marker.and(ee.ImageCollection.fromImages(acceptedByLayout).max())
    const residue = denseJ.mod(32).add(32).mod(32).multiply(16)
        .add(denseI.mod(16).add(16).mod(16))
    const image = residue.add(1).toInt().rename('label')
        .addBands(denseI.rename('denseI'))
        .addBands(denseJ.rename('denseJ'))
        .updateMask(accepted)
    const vectorizationRegion = scenario.region.buffer(
        markerScale * 2,
        ee.ErrorMargin(markerScale, 'projected'),
        scenario.projection
    )
    return image.reduceToVectors({
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
            layout.targetStratum,
            null
        ))).removeAll([null])
        const singleDenseKey = denseIValue.format('%d').cat(':').cat(denseJValue.format('%d'))
        return feature.setGeometry(point.geometry).set({
            scenario: scenario.name,
            source: 'singleProxy',
            key: singleDenseKey,
            singleDenseKey,
            layoutStrata,
            denseDiameter: dense.diameter,
            denseI: denseIValue,
            denseJ: denseJValue,
            denseX: point.x,
            denseY: point.y
        })
    }).filterBounds(scenario.region)
}

const layoutLookupForPlan = plan => ee.Dictionary(Object.fromEntries(plan.layouts.map(layout => [
    String(layout.targetStratum),
    ee.Dictionary({
        targetStratum: layout.targetStratum,
        requested: layout.requested,
        densityOffset: layout.densityOffset,
        ratio: layout.ratio,
        phaseShiftI: layout.phaseShiftI,
        phaseShiftJ: layout.phaseShiftJ,
        dx: layout.dx,
        dy: layout.dy,
        originX: layout.originX,
        originY: layout.originY
    })
])))

const referenceWithDenseKeys = ({scenario, collection}) => {
    const plan = singleLatticePlan(scenario)
    const lookup = layoutLookupForPlan(plan)
    return collection.map(feature => {
        const layout = ee.Dictionary(lookup.get(feature.getNumber('targetStratum').format('%d')))
        const ratio = layout.getNumber('ratio').toInt()
        const coarseI = feature.getNumber('i').toInt()
        const coarseJ = feature.getNumber('j').toInt()
        const denseJ = layout.getNumber('phaseShiftJ').add(coarseJ.multiply(ratio)).toInt()
        const denseI = layout.getNumber('phaseShiftI').add(coarseI.multiply(ratio))
            .add(ratio.multiply(coarseJ.mod(2).add(2).mod(2))
                .subtract(denseJ.mod(2).add(2).mod(2)).divide(2))
            .toInt()
        return feature.set('singleDenseKey', denseI.format('%d').cat(':').cat(denseJ.format('%d')))
    })
}

const singleLookupResult = ({
    scenario,
    collection,
    lookupSource = 'singleLookup',
    candidateSource = 'singleCandidate'
}) => {
    const plan = singleLatticePlan(scenario)
    const lookup = layoutLookupForPlan(plan)
    const targetStrata = ee.List(plan.layouts.map(layout => layout.targetStratum))
    const defaultLayout = ee.Dictionary({
        targetStratum: SENTINEL,
        requested: 0,
        densityOffset: 0,
        ratio: 1,
        phaseShiftI: 0,
        phaseShiftJ: 0,
        dx: plan.densest.dx,
        dy: plan.densest.dy,
        originX: plan.densest.originX,
        originY: plan.densest.originY
    })
    const reduced = lookupImageForScenario(scenario).reduceRegions({
        collection,
        reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
        crs: scenario.sourceProjection,
        tileScale: 4,
        maxPixelsPerRegion: 1
    }).map(feature => {
        const observedClass = feature.getNumber('observedClass').toInt()
        const hasLayout = targetStrata.contains(observedClass)
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
        const geometryCoordinates = point.geometry
            .transform(scenario.projection, GEOMETRY_TOLERANCE).coordinates()
        const key = observedClass.format('%d')
            .cat(':').cat(indices.i.format('%d'))
            .cat(':').cat(indices.j.format('%d'))
        return feature.setGeometry(point.geometry).set({
            source: lookupSource,
            layoutGroupId: 'single-lattice',
            hasLayout,
            belongsToObservedLayout: indices.belongs,
            key,
            targetStratum: observedClass,
            requested: layout.getNumber('requested'),
            densityOffset: layout.getNumber('densityOffset'),
            i: indices.i,
            j: indices.j,
            level: levelFromIndices(indices.i, indices.j),
            dx: layout.getNumber('dx'),
            dy: layout.getNumber('dy'),
            originX: layout.getNumber('originX'),
            originY: layout.getNumber('originY'),
            arrangementX: point.x,
            arrangementY: point.y,
            geometryX: geometryCoordinates.get(0),
            geometryY: geometryCoordinates.get(1)
        })
    })
    const candidates = reduced
        .filter(ee.Filter.eq('observedMask', 1))
        .filter(ee.Filter.eq('hasLayout', true))
        .filter(ee.Filter.eq('belongsToObservedLayout', 1))
        .map(feature => feature.set('source', candidateSource))
    return {reduced, candidates}
}

const adversarialBufferWitness = () => {
    const scenario = buildAdversarialBufferScenario()
    const owningTile = ee.Feature(tileGeometry({scenario, tileI: 0, tileJ: 0})).set({
        scenario: scenario.name,
        tileKey: '0:0',
        tileI: 0,
        tileJ: 0,
        tileSizeMetres: OCCUPANCY_TILE_SIZE_METRES
    })
    const tiles = ee.FeatureCollection([owningTile])
    const unbuffered = occupancyHistogramTable({
        scenario,
        tiles,
        source: 'zeroBufferOccupancy'
    })
    const buffered = occupancyTable({scenario, tiles})
    const unbufferedProxy = prepareReference({
        scenario,
        raw: singleProxyForScenario(scenario, occupancyMaskImage({scenario, occupancy: unbuffered})),
        source: 'zeroBufferProxy'
    })
    const bufferedProxy = prepareReference({
        scenario,
        raw: singleProxyForScenario(scenario, occupancyMaskImage({scenario, occupancy: buffered})),
        source: 'bufferedProxy'
    })
    const unbufferedCandidates = singleLookupResult({
        scenario,
        collection: unbufferedProxy,
        lookupSource: 'zeroBufferLookup',
        candidateSource: 'zeroBufferCandidate'
    }).candidates
    const bufferedCandidates = singleLookupResult({
        scenario,
        collection: bufferedProxy,
        lookupSource: 'bufferedLookup',
        candidateSource: 'bufferedCandidate'
    }).candidates
    const proxyCount = (collection, target) => collection
        .filter(ee.Filter.eq('singleDenseKey', `${target.i}:${target.j}`))
        .filter(ee.Filter.listContains('layoutStrata', target.targetStratum))
        .size()
    const tileSizeGridUnits = ee.Number(OCCUPANCY_TILE_SIZE_METRES).divide(scenario.nominalScale)
    const evidence = ee.List(scenario.bufferWitnessTargets.map(target => {
        const sourceCentroid = ee.Geometry.Point([
            ee.Number(target.sourceCellX).add(0.5),
            ee.Number(target.sourceCellY).add(0.5)
        ], scenario.sourceProjection)
        const centroidCoordinates = sourceCentroid.transform(
            scenario.projection,
            ee.ErrorMargin(0.01, 'projected')
        ).coordinates()
        const centroidX = ee.Number(centroidCoordinates.get(0))
        const centroidY = ee.Number(centroidCoordinates.get(1))
        const outsideX = ee.Number(0).max(centroidX.multiply(-1)).max(centroidX.subtract(tileSizeGridUnits))
        const outsideY = ee.Number(0).max(centroidY.multiply(-1)).max(centroidY.subtract(tileSizeGridUnits))
        return ee.Dictionary({
            name: target.name,
            targetStratum: target.targetStratum,
            structuralKey: `${target.targetStratum}:${target.i}:${target.j}`,
            owningTile: '0:0',
            latticeI: target.i,
            latticeJ: target.j,
            latticePointArrangementGrid: [target.point.x, target.point.y],
            sourceCell: [target.sourceCellX, target.sourceCellY],
            sourceCentroidArrangementGrid: [centroidX, centroidY],
            sourceCentroidOutsideDistanceMetres: outsideX.pow(2).add(outsideY.pow(2)).sqrt()
                .multiply(scenario.nominalScale),
            unbufferedProxyRows: proxyCount(unbufferedProxy, target),
            bufferedProxyRows: proxyCount(bufferedProxy, target)
        })
    }))
    const unbufferedRow = ee.Feature(unbuffered.first())
    const bufferedRow = ee.Feature(buffered.first())
    return ee.Dictionary({
        scenario: scenario.name,
        owningTile: '0:0',
        expectedKeys: scenario.bufferWitnessTargets.map(({targetStratum, i, j}) => `${targetStratum}:${i}:${j}`),
        uniqueSourcePixels: ee.FeatureCollection(scenario.bufferWitnessTargets.map(target => ee.Feature(null, {
            cellKey: target.sourceCellX.format('%d').cat(':').cat(target.sourceCellY.format('%d'))
        }))).aggregate_count_distinct('cellKey'),
        unbufferedPresence: scenario.bufferWitnessTargets.map(({targetStratum}) =>
            unbufferedRow.get(`has_${targetStratum}`)),
        bufferedPresence: scenario.bufferWitnessTargets.map(({targetStratum}) =>
            bufferedRow.get(`has_${targetStratum}`)),
        unbufferedProxySize: unbufferedProxy.size(),
        bufferedProxySize: bufferedProxy.size(),
        unbufferedCandidateKeys: unbufferedCandidates.aggregate_array('key').sort(),
        bufferedCandidateKeys: bufferedCandidates.aggregate_array('key').sort(),
        evidence,
        envelope: occupancyEnvelopeAtScale(Math.abs(scenario.source.transform[0]))
    })
}

const assertAdversarialBufferWitness = summary => {
    const expectedKeys = [...summary.expectedKeys].sort()
    const bufferedKeys = [...summary.bufferedCandidateKeys].sort()
    assert(summary.uniqueSourcePixels === 2,
        `Adversarial classes do not occupy distinct source pixels: ${JSON.stringify(summary)}`)
    assert(summary.unbufferedPresence.every(value => Number(value) === 0)
        && summary.bufferedPresence.every(value => Number(value) === 1),
    `Occupancy buffer was not behaviorally discriminated: ${JSON.stringify(summary)}`)
    assert(summary.unbufferedProxySize === 0
        && summary.unbufferedCandidateKeys.length === 0,
    `Zero-buffer control unexpectedly retained the witness: ${JSON.stringify(summary)}`)
    assert(expectedKeys.length === bufferedKeys.length
        && expectedKeys.every((key, index) => key === bufferedKeys[index]),
    `Buffered occupancy did not recover the exact candidate keys: ${JSON.stringify(summary)}`)
    assert(summary.evidence.every(({sourceCentroidOutsideDistanceMetres, unbufferedProxyRows,
        bufferedProxyRows, latticePointArrangementGrid}) =>
        Number(sourceCentroidOutsideDistanceMetres) > 0
        && Number(unbufferedProxyRows) === 0
        && Number(bufferedProxyRows) === 1
        && Number(latticePointArrangementGrid[0]) > 0
        && Number(latticePointArrangementGrid[0]) < OCCUPANCY_TILE_SIZE_METRES
        && Number(latticePointArrangementGrid[1]) > 0
        && Number(latticePointArrangementGrid[1]) < OCCUPANCY_TILE_SIZE_METRES),
    `Adversarial point/centroid placement is invalid: ${JSON.stringify(summary)}`)
    return {
        ...summary,
        zeroBufferControl: 'EXPECTED_FAILURE: both unique classes and exact keys are omitted',
        productionBuffer: 'PASS: both unique classes and exact keys are recovered'
    }
}

const reconstructReduced = ({scenario, collection, source}) => collection.map(feature => {
    const {x, y, geometry} = exactPoint({
        projection: scenario.projection,
        i: ee.Number(feature.get('i')),
        j: ee.Number(feature.get('j')),
        dx: ee.Number(feature.get('dx')),
        dy: ee.Number(feature.get('dy')),
        originX: ee.Number(feature.get('originX')),
        originY: ee.Number(feature.get('originY'))
    })
    const geometryCoordinates = geometry.transform(scenario.projection, GEOMETRY_TOLERANCE).coordinates()
    return feature.setGeometry(geometry).set({
        source,
        arrangementX: x,
        arrangementY: y,
        geometryX: geometryCoordinates.get(0),
        geometryY: geometryCoordinates.get(1)
    })
})

const lookupResult = ({scenario, collection, lookupSource, candidateSource}) => {
    const reduced = reconstructReduced({
        scenario,
        collection: lookupImageForScenario(scenario).reduceRegions({
            collection,
            reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
            crs: scenario.sourceProjection,
            tileScale: 4,
            maxPixelsPerRegion: 1
        }),
        source: lookupSource
    })
    const candidates = reduced
        .filter(ee.Filter.eq('observedMask', 1))
        .filter(ee.Filter.equals({leftField: 'targetStratum', rightField: 'observedClass'}))
        .map(feature => feature.set('source', candidateSource))
    return {reduced, candidates}
}

const groupedLookupResult = ({scenario, collection}) => {
    const reduced = reconstructReduced({
        scenario,
        collection: lookupImageForScenario(scenario).reduceRegions({
            collection,
            reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
            crs: scenario.sourceProjection,
            tileScale: 4,
            maxPixelsPerRegion: 1
        }),
        source: 'groupedLookup'
    }).map(feature => {
        const observedClass = ee.Number(feature.get('observedClass')).toInt()
        const belongsToGroup = ee.List(feature.get('layoutStrata')).contains(observedClass)
        const key = observedClass.format('%d')
            .cat(':').cat(feature.getNumber('i').format('%d'))
            .cat(':').cat(feature.getNumber('j').format('%d'))
        const requested = ee.Dictionary(feature.get('requestedByStratum')).get(observedClass.format('%d'), 0)
        return feature.set({
            belongsToGroup,
            key,
            targetStratum: observedClass,
            requested
        })
    })
    const candidates = reduced
        .filter(ee.Filter.eq('observedMask', 1))
        .filter(ee.Filter.eq('belongsToGroup', true))
        .map(feature => feature.set('source', 'groupedCandidate'))
    return {reduced, candidates}
}

const featureRows = featureCollectionInfo => featureCollectionInfo.features.map(({properties}) => properties)

const scopedKey = row => `${row.scenario}|${row.key}`

const indexRows = (rows, source) => {
    const indexed = new Map()
    const duplicates = []
    rows.filter(row => row.source === source).forEach(row => {
        const key = scopedKey(row)
        if (indexed.has(key)) {
            duplicates.push(key)
        } else {
            indexed.set(key, row)
        }
    })
    return {indexed, duplicates}
}

const expectedMembership = row => fixtureMembership({
    sourceU: row.sourceU,
    sourceV: row.sourceV,
    source: scenarioConfigs.find(({name}) => name === row.scenario).source
})

const distanceToCellBoundary = value => Math.abs(Number(value) - Math.round(Number(value)))

const summarizeFiniteEquivalence = info => {
    const rows = featureRows(info)
    const reference = indexRows(rows, 'reference')
    const directLookup = indexRows(rows, 'directLookup')
    const referenceCandidates = indexRows(rows, 'referenceCandidate')
    const proxy = indexRows(rows, 'proxy')
    const hybridLookup = indexRows(rows, 'hybridLookup')
    const hybridCandidates = indexRows(rows, 'hybridCandidate')
    const directMissing = []
    const directExtra = []
    const directClassMismatches = []
    const directMaskMismatches = []
    const directPropertyMismatches = []
    const directGeometryMismatches = []
    const proxyMissingReferenceCandidates = []
    const proxyOutsideRawFrame = []
    const proxyPropertyMismatches = []
    const hybridMissing = []
    const hybridExtra = []
    const hybridClassMismatches = []
    const hybridMaskMismatches = []
    const hybridPropertyMismatches = []
    const hybridGeometryMismatches = []
    const boundaryRows = []
    let maskedRows = 0

    reference.indexed.forEach((expectedRow, key) => {
        const actual = directLookup.indexed.get(key)
        if (!actual) {
            directMissing.push(key)
            return
        }
        const membership = expectedMembership(expectedRow)
        if (Number(actual.observedClass) !== membership.observedClass) {
            directClassMismatches.push({key, actual: actual.observedClass, membership, expectedRow})
        }
        if (Number(actual.observedMask) !== membership.observedMask) {
            directMaskMismatches.push({key, actual: actual.observedMask, membership, expectedRow})
        }
        if (!membership.observedMask) {
            maskedRows += 1
        }
        if (Number(actual.targetStratum) !== Number(expectedRow.targetStratum)
            || Number(actual.i) !== Number(expectedRow.i)
            || Number(actual.j) !== Number(expectedRow.j)
            || Number(actual.level) !== Number(expectedRow.level)) {
            directPropertyMismatches.push({key, actual, expectedRow})
        }
        if (!near(actual.arrangementX, expectedRow.arrangementX)
            || !near(actual.arrangementY, expectedRow.arrangementY)
            || !near(actual.geometryX, expectedRow.arrangementX)
            || !near(actual.geometryY, expectedRow.arrangementY)) {
            directGeometryMismatches.push({key, actual, expectedRow})
        }
        const uDistance = distanceToCellBoundary(expectedRow.sourceU)
        const vDistance = distanceToCellBoundary(expectedRow.sourceV)
        if (Math.min(uDistance, vDistance) <= BOUNDARY_NEAR_DISTANCE) {
            boundaryRows.push({
                key,
                sourceU: expectedRow.sourceU,
                sourceV: expectedRow.sourceV,
                uDistance,
                vDistance,
                exactBoundary: Math.min(uDistance, vDistance) <= 1e-9,
                ...membership,
                actualClass: actual.observedClass,
                actualMask: actual.observedMask
            })
        }
    })
    directLookup.indexed.forEach((_actual, key) => {
        if (!reference.indexed.has(key)) {
            directExtra.push(key)
        }
    })

    referenceCandidates.indexed.forEach((_row, key) => {
        if (!proxy.indexed.has(key)) {
            proxyMissingReferenceCandidates.push(key)
        }
    })
    proxy.indexed.forEach((proxyRow, key) => {
        const rawRow = reference.indexed.get(key)
        if (!rawRow) {
            proxyOutsideRawFrame.push(key)
            return
        }
        if (Number(proxyRow.targetStratum) !== Number(rawRow.targetStratum)
            || Number(proxyRow.i) !== Number(rawRow.i)
            || Number(proxyRow.j) !== Number(rawRow.j)
            || Number(proxyRow.level) !== Number(rawRow.level)
            || !near(proxyRow.arrangementX, rawRow.arrangementX)
            || !near(proxyRow.arrangementY, rawRow.arrangementY)) {
            proxyPropertyMismatches.push({key, proxyRow, rawRow})
        }
    })

    referenceCandidates.indexed.forEach((expectedRow, key) => {
        const actual = hybridCandidates.indexed.get(key)
        if (!actual) {
            hybridMissing.push(key)
            return
        }
        if (Number(actual.observedClass) !== Number(expectedRow.observedClass)) {
            hybridClassMismatches.push({key, actual, expectedRow})
        }
        if (Number(actual.observedMask) !== Number(expectedRow.observedMask)) {
            hybridMaskMismatches.push({key, actual, expectedRow})
        }
        if (Number(actual.targetStratum) !== Number(expectedRow.targetStratum)
            || Number(actual.i) !== Number(expectedRow.i)
            || Number(actual.j) !== Number(expectedRow.j)
            || Number(actual.level) !== Number(expectedRow.level)) {
            hybridPropertyMismatches.push({key, actual, expectedRow})
        }
        if (!near(actual.arrangementX, expectedRow.arrangementX)
            || !near(actual.arrangementY, expectedRow.arrangementY)
            || !near(actual.geometryX, expectedRow.arrangementX)
            || !near(actual.geometryY, expectedRow.arrangementY)) {
            hybridGeometryMismatches.push({key, actual, expectedRow})
        }
    })
    hybridCandidates.indexed.forEach((_row, key) => {
        if (!referenceCandidates.indexed.has(key)) {
            hybridExtra.push(key)
        }
    })

    hybridLookup.indexed.forEach((row, key) => {
        const membership = expectedMembership(row)
        if (Number(row.observedClass) !== membership.observedClass) {
            hybridClassMismatches.push({key, row, membership})
        }
        if (Number(row.observedMask) !== membership.observedMask) {
            hybridMaskMismatches.push({key, row, membership})
        }
    })

    const scenarioCounts = Object.fromEntries(scenarioConfigs.map(({name}) => [name, {
        raw: [...reference.indexed.values()].filter(row => row.scenario === name).length,
        exact: [...referenceCandidates.indexed.values()].filter(row => row.scenario === name).length,
        proxy: [...proxy.indexed.values()].filter(row => row.scenario === name).length,
        hybrid: [...hybridCandidates.indexed.values()].filter(row => row.scenario === name).length
    }]))
    const byStratum = {}
    scenarioConfigs.forEach(({name, layouts}) => layouts.forEach(({targetStratum, requested}) => {
        const raw = [...reference.indexed.values()].filter(row => row.scenario === name
            && Number(row.targetStratum) === targetStratum).length
        const exact = [...referenceCandidates.indexed.values()].filter(row => row.scenario === name
            && Number(row.targetStratum) === targetStratum).length
        const proxyCount = [...proxy.indexed.values()].filter(row => row.scenario === name
            && Number(row.targetStratum) === targetStratum).length
        const retained = [...hybridCandidates.indexed.values()].filter(row => row.scenario === name
            && Number(row.targetStratum) === targetStratum).length
        byStratum[`${name}:${targetStratum}`] = {
            requested,
            raw,
            proxy: proxyCount,
            exact,
            retained,
            proxyInflation: exact ? proxyCount / exact : null,
            falsePositiveProxyRows: proxyCount - exact
        }
    }))

    const summary = {
        referenceRecords: reference.indexed.size,
        directLookupRecords: directLookup.indexed.size,
        referenceCandidates: referenceCandidates.indexed.size,
        proxyRecords: proxy.indexed.size,
        hybridLookupRecords: hybridLookup.indexed.size,
        hybridCandidates: hybridCandidates.indexed.size,
        maskedRows,
        directMissing: directMissing.length,
        directExtra: directExtra.length,
        duplicateReferenceKeys: reference.duplicates.length,
        duplicateDirectKeys: directLookup.duplicates.length,
        duplicateReferenceCandidateKeys: referenceCandidates.duplicates.length,
        duplicateProxyKeys: proxy.duplicates.length,
        duplicateHybridLookupKeys: hybridLookup.duplicates.length,
        duplicateHybridCandidateKeys: hybridCandidates.duplicates.length,
        directClassMismatches: directClassMismatches.length,
        directMaskMismatches: directMaskMismatches.length,
        directPropertyMismatches: directPropertyMismatches.length,
        directGeometryMismatches: directGeometryMismatches.length,
        proxyMissingReferenceCandidates: proxyMissingReferenceCandidates.length,
        proxyOutsideRawFrame: proxyOutsideRawFrame.length,
        proxyPropertyMismatches: proxyPropertyMismatches.length,
        hybridMissing: hybridMissing.length,
        hybridExtra: hybridExtra.length,
        hybridClassMismatches: hybridClassMismatches.length,
        hybridMaskMismatches: hybridMaskMismatches.length,
        hybridPropertyMismatches: hybridPropertyMismatches.length,
        hybridGeometryMismatches: hybridGeometryMismatches.length,
        scenarioCounts,
        boundaryNearRows: boundaryRows.length,
        exactBoundaryRows: boundaryRows.filter(({exactBoundary}) => exactBoundary).length,
        boundaryExamples: boundaryRows
            .sort((left, right) => Math.min(left.uDistance, left.vDistance)
                - Math.min(right.uDistance, right.vDistance))
            .slice(0, 12),
        byStratum,
        mismatchExamples: {
            directMissing: directMissing.slice(0, 5),
            directExtra: directExtra.slice(0, 5),
            directClassMismatches: directClassMismatches.slice(0, 3),
            directMaskMismatches: directMaskMismatches.slice(0, 3),
            proxyMissingReferenceCandidates: proxyMissingReferenceCandidates.slice(0, 5),
            proxyOutsideRawFrame: proxyOutsideRawFrame.slice(0, 5),
            proxyPropertyMismatches: proxyPropertyMismatches.slice(0, 2),
            hybridMissing: hybridMissing.slice(0, 5),
            hybridExtra: hybridExtra.slice(0, 5),
            hybridClassMismatches: hybridClassMismatches.slice(0, 3),
            hybridMaskMismatches: hybridMaskMismatches.slice(0, 3),
            hybridPropertyMismatches: hybridPropertyMismatches.slice(0, 2),
            hybridGeometryMismatches: hybridGeometryMismatches.slice(0, 2)
        }
    }
    const failed = summary.directMissing || summary.directExtra || summary.duplicateReferenceKeys
        || summary.duplicateDirectKeys || summary.duplicateReferenceCandidateKeys || summary.duplicateProxyKeys
        || summary.duplicateHybridLookupKeys || summary.duplicateHybridCandidateKeys
        || summary.directClassMismatches || summary.directMaskMismatches
        || summary.directPropertyMismatches || summary.directGeometryMismatches
        || summary.proxyMissingReferenceCandidates || summary.proxyOutsideRawFrame
        || summary.proxyPropertyMismatches || summary.hybridMissing || summary.hybridExtra
        || summary.hybridClassMismatches || summary.hybridMaskMismatches
        || summary.hybridPropertyMismatches || summary.hybridGeometryMismatches
    if (failed) {
        throw new Error(`Finite equivalence mismatch: ${JSON.stringify(summary)}`)
    }
    return {summary, rows, candidateRows: [...hybridCandidates.indexed.values()]}
}

const summarizeGroupedEquivalence = info => {
    const rows = featureRows(info)
    const referenceCandidates = indexRows(rows, 'referenceCandidate')
    const ungroupedCandidates = indexRows(rows, 'hybridCandidate')
    const ungroupedProxy = indexRows(rows, 'proxy')
    const groupedProxy = indexRows(rows, 'groupedProxy')
    const groupedCandidates = indexRows(rows, 'groupedCandidate')
    const missingProxyCoverage = []
    const missingGroupedFinal = []
    const extraGroupedFinal = []
    const ungroupedFinalDifferences = []
    const membershipMismatches = []
    const propertyMismatches = []
    const geometryMismatches = []

    const groupedProxyRows = [...groupedProxy.indexed.values()]
    referenceCandidates.indexed.forEach((expected, key) => {
        const covered = groupedProxyRows.some(proxy => proxy.scenario === expected.scenario
            && Number(proxy.i) === Number(expected.i)
            && Number(proxy.j) === Number(expected.j)
            && proxy.layoutStrata.map(Number).includes(Number(expected.targetStratum)))
        if (!covered) {
            missingProxyCoverage.push(key)
        }
        const actual = groupedCandidates.indexed.get(key)
        if (!actual) {
            missingGroupedFinal.push(key)
            return
        }
        const membership = expectedMembership(actual)
        if (Number(actual.observedClass) !== Number(expected.targetStratum)
            || Number(actual.observedMask) !== 1
            || membership.unmaskedClass !== Number(expected.targetStratum)
            || membership.observedMask !== 1) {
            membershipMismatches.push({key, actual, membership})
        }
        if (Number(actual.targetStratum) !== Number(expected.targetStratum)
            || Number(actual.i) !== Number(expected.i)
            || Number(actual.j) !== Number(expected.j)
            || Number(actual.level) !== Number(expected.level)
            || Number(actual.densityOffset) !== Number(expected.densityOffset)) {
            propertyMismatches.push({key, actual, expected})
        }
        if (!near(actual.arrangementX, expected.arrangementX)
            || !near(actual.arrangementY, expected.arrangementY)
            || !near(actual.geometryX, expected.arrangementX)
            || !near(actual.geometryY, expected.arrangementY)) {
            geometryMismatches.push({key, actual, expected})
        }
        if (!ungroupedCandidates.indexed.has(key)) {
            ungroupedFinalDifferences.push(key)
        }
    })
    groupedCandidates.indexed.forEach((_actual, key) => {
        if (!referenceCandidates.indexed.has(key)) {
            extraGroupedFinal.push(key)
        }
        if (!ungroupedCandidates.indexed.has(key)) {
            ungroupedFinalDifferences.push(key)
        }
    })
    ungroupedCandidates.indexed.forEach((_actual, key) => {
        if (!groupedCandidates.indexed.has(key)) {
            ungroupedFinalDifferences.push(key)
        }
    })

    const scenarioCounts = Object.fromEntries(scenarioConfigs.map(config => {
        const groups = new Set(groupedProxyRows
            .filter(({scenario}) => scenario === config.name)
            .map(({layoutGroupId}) => layoutGroupId))
        const before = [...ungroupedProxy.indexed.values()].filter(({scenario}) => scenario === config.name).length
        const after = groupedProxyRows.filter(({scenario}) => scenario === config.name).length
        const exact = [...groupedCandidates.indexed.values()].filter(({scenario}) => scenario === config.name).length
        return [config.name, {
            layoutsBefore: config.layouts.length,
            layoutGroupsAfter: groups.size,
            proxyBefore: before,
            proxyAfter: after,
            exact,
            groupedProxyInflation: exact ? after / exact : null
        }]
    }))
    const isolatedScenarioIncluded = rows.some(({scenario}) => scenario === 'isolated-pixels-cross-crs')
    const isolatedRows = [...groupedCandidates.indexed.values()]
        .filter(({scenario}) => scenario === 'isolated-pixels-cross-crs')
    const isolatedCounts = Object.fromEntries([1, 2].map(stratum => [
        stratum,
        isolatedRows.filter(({targetStratum}) => Number(targetStratum) === stratum).length
    ]))
    const summary = {
        referenceCandidates: referenceCandidates.indexed.size,
        ungroupedProxy: ungroupedProxy.indexed.size,
        groupedProxy: groupedProxy.indexed.size,
        ungroupedCandidates: ungroupedCandidates.indexed.size,
        groupedCandidates: groupedCandidates.indexed.size,
        duplicateUngroupedProxyKeys: ungroupedProxy.duplicates.length,
        duplicateGroupedProxyKeys: groupedProxy.duplicates.length,
        duplicateUngroupedCandidateKeys: ungroupedCandidates.duplicates.length,
        duplicateGroupedCandidateKeys: groupedCandidates.duplicates.length,
        missingProxyCoverage: missingProxyCoverage.length,
        missingGroupedFinal: missingGroupedFinal.length,
        extraGroupedFinal: extraGroupedFinal.length,
        ungroupedFinalDifferences: new Set(ungroupedFinalDifferences).size,
        membershipMismatches: membershipMismatches.length,
        propertyMismatches: propertyMismatches.length,
        geometryMismatches: geometryMismatches.length,
        isolatedCounts,
        scenarioCounts,
        examples: {
            missingProxyCoverage: missingProxyCoverage.slice(0, 5),
            missingGroupedFinal: missingGroupedFinal.slice(0, 5),
            extraGroupedFinal: extraGroupedFinal.slice(0, 5),
            ungroupedFinalDifferences: [...new Set(ungroupedFinalDifferences)].slice(0, 5),
            membershipMismatches: membershipMismatches.slice(0, 2),
            propertyMismatches: propertyMismatches.slice(0, 2),
            geometryMismatches: geometryMismatches.slice(0, 2)
        }
    }
    const failed = summary.duplicateUngroupedProxyKeys || summary.duplicateGroupedProxyKeys
        || summary.duplicateUngroupedCandidateKeys || summary.duplicateGroupedCandidateKeys
        || summary.missingProxyCoverage || summary.missingGroupedFinal || summary.extraGroupedFinal
        || summary.ungroupedFinalDifferences || summary.membershipMismatches
        || summary.propertyMismatches || summary.geometryMismatches
        || isolatedScenarioIncluded && (!summary.isolatedCounts[1] || !summary.isolatedCounts[2])
    if (failed) {
        throw new Error(`Grouped equivalence mismatch: ${JSON.stringify(summary)}`)
    }
    return summary
}

const summarizeSingleEquivalence = info => {
    const rows = featureRows(info)
    const referenceCandidates = indexRows(rows, 'referenceCandidate')
    const groupedCandidates = indexRows(rows, 'groupedCandidate')
    const singleCandidates = indexRows(rows, 'singleCandidate')
    const singleProxyRows = rows.filter(({source}) => source === 'singleProxy')
    const singleProxy = new Map()
    const duplicateSingleProxyKeys = []
    singleProxyRows.forEach(row => {
        const key = `${row.scenario}|${row.singleDenseKey}`
        if (singleProxy.has(key)) {
            duplicateSingleProxyKeys.push(key)
        } else {
            singleProxy.set(key, row)
        }
    })
    const missingProxyCoverage = []
    const missingFinal = []
    const extraFinal = []
    const groupedFinalDifferences = []
    const membershipMismatches = []
    const propertyMismatches = []
    const geometryMismatches = []
    referenceCandidates.indexed.forEach((expected, key) => {
        const proxy = singleProxy.get(`${expected.scenario}|${expected.singleDenseKey}`)
        if (!proxy || !proxy.layoutStrata.map(Number).includes(Number(expected.targetStratum))) {
            missingProxyCoverage.push(key)
        }
        const actual = singleCandidates.indexed.get(key)
        if (!actual) {
            missingFinal.push(key)
            return
        }
        const membership = expectedMembership(actual)
        if (Number(actual.observedClass) !== Number(expected.targetStratum)
            || Number(actual.observedMask) !== 1
            || membership.unmaskedClass !== Number(expected.targetStratum)
            || membership.observedMask !== 1) {
            membershipMismatches.push({key, actual, membership})
        }
        if (Number(actual.targetStratum) !== Number(expected.targetStratum)
            || Number(actual.i) !== Number(expected.i)
            || Number(actual.j) !== Number(expected.j)
            || Number(actual.level) !== Number(expected.level)
            || Number(actual.densityOffset) !== Number(expected.densityOffset)) {
            propertyMismatches.push({key, actual, expected})
        }
        if (!near(actual.arrangementX, expected.arrangementX)
            || !near(actual.arrangementY, expected.arrangementY)
            || !near(actual.geometryX, expected.arrangementX)
            || !near(actual.geometryY, expected.arrangementY)) {
            geometryMismatches.push({key, actual, expected})
        }
        if (!groupedCandidates.indexed.has(key)) {
            groupedFinalDifferences.push(key)
        }
    })
    singleCandidates.indexed.forEach((_actual, key) => {
        if (!referenceCandidates.indexed.has(key)) {
            extraFinal.push(key)
        }
        if (!groupedCandidates.indexed.has(key)) {
            groupedFinalDifferences.push(key)
        }
    })
    groupedCandidates.indexed.forEach((_actual, key) => {
        if (!singleCandidates.indexed.has(key)) {
            groupedFinalDifferences.push(key)
        }
    })
    const levelHistogram = indexed => {
        const histogram = new Map()
        indexed.forEach(row => {
            const key = `${row.scenario}|${row.targetStratum}|${row.level}`
            histogram.set(key, (histogram.get(key) || 0) + 1)
        })
        return histogram
    }
    const groupedLevels = levelHistogram(groupedCandidates.indexed)
    const singleLevels = levelHistogram(singleCandidates.indexed)
    const levelCountDifferences = [...new Set([...groupedLevels.keys(), ...singleLevels.keys()])]
        .filter(key => groupedLevels.get(key) !== singleLevels.get(key))
    const byClass = {}
    const includedScenarios = new Set(rows.map(({scenario}) => scenario))
    scenarioConfigs.filter(({name}) => includedScenarios.has(name)).forEach(({name, layouts}) =>
        layouts.forEach(({targetStratum}) => {
        const proxyCount = singleProxyRows.filter(row => row.scenario === name
            && row.layoutStrata.map(Number).includes(targetStratum)).length
        const exact = [...singleCandidates.indexed.values()].filter(row => row.scenario === name
            && Number(row.targetStratum) === targetStratum).length
        byClass[`${name}:${targetStratum}`] = {
            proxy: proxyCount,
            exact,
            falsePositiveProxyRows: proxyCount - exact,
            proxyInflation: exact ? proxyCount / exact : null
        }
        })
    )
    const isolatedScenarioIncluded = includedScenarios.has('isolated-pixels-cross-crs')
    const isolatedRows = [...singleCandidates.indexed.values()]
        .filter(({scenario}) => scenario === 'isolated-pixels-cross-crs')
    const isolatedCounts = Object.fromEntries([1, 2].map(stratum => [
        stratum,
        isolatedRows.filter(({targetStratum}) => Number(targetStratum) === stratum).length
    ]))
    const summary = {
        referenceCandidates: referenceCandidates.indexed.size,
        groupedCandidates: groupedCandidates.indexed.size,
        singleProxy: singleProxy.size,
        singleCandidates: singleCandidates.indexed.size,
        duplicateSingleProxyKeys: duplicateSingleProxyKeys.length,
        duplicateSingleCandidateKeys: singleCandidates.duplicates.length,
        missingProxyCoverage: missingProxyCoverage.length,
        missingFinal: missingFinal.length,
        extraFinal: extraFinal.length,
        groupedFinalDifferences: new Set(groupedFinalDifferences).size,
        levelCountDifferences: levelCountDifferences.length,
        membershipMismatches: membershipMismatches.length,
        propertyMismatches: propertyMismatches.length,
        geometryMismatches: geometryMismatches.length,
        isolatedCounts,
        byClass,
        examples: {
            duplicateSingleProxyKeys: duplicateSingleProxyKeys.slice(0, 5),
            missingProxyCoverage: missingProxyCoverage.slice(0, 5),
            missingFinal: missingFinal.slice(0, 5),
            extraFinal: extraFinal.slice(0, 5),
            groupedFinalDifferences: [...new Set(groupedFinalDifferences)].slice(0, 5),
            levelCountDifferences: levelCountDifferences.slice(0, 5),
            membershipMismatches: membershipMismatches.slice(0, 2),
            propertyMismatches: propertyMismatches.slice(0, 2),
            geometryMismatches: geometryMismatches.slice(0, 2)
        }
    }
    const failed = summary.duplicateSingleProxyKeys || summary.duplicateSingleCandidateKeys
        || summary.missingProxyCoverage || summary.missingFinal || summary.extraFinal
        || summary.groupedFinalDifferences || summary.levelCountDifferences
        || summary.membershipMismatches || summary.propertyMismatches || summary.geometryMismatches
        || isolatedScenarioIncluded && (!summary.isolatedCounts[1] || !summary.isolatedCounts[2])
    if (failed) {
        throw new Error(`Single-lattice equivalence mismatch: ${JSON.stringify(summary)}`)
    }
    return summary
}

const summarizeOccupancyEquivalence = info => {
    const rows = featureRows(info)
    const referenceCandidates = indexRows(rows, 'referenceCandidate')
    const singleCandidates = indexRows(rows, 'singleCandidate')
    const occupancyCandidates = indexRows(rows, 'occupancyCandidate')
    const proxyRows = rows.filter(({source}) => source === 'occupancyProxy')
    const proxy = new Map()
    const duplicateProxyKeys = []
    proxyRows.forEach(row => {
        const key = `${row.scenario}|${row.singleDenseKey}`
        if (proxy.has(key)) {
            duplicateProxyKeys.push(key)
        } else {
            proxy.set(key, row)
        }
    })
    const missingProxyCoverage = []
    const missingFinal = []
    const extraFinal = []
    const singleFinalDifferences = []
    const membershipMismatches = []
    const propertyMismatches = []
    const geometryMismatches = []
    referenceCandidates.indexed.forEach((expected, key) => {
        const proxyRow = proxy.get(`${expected.scenario}|${expected.singleDenseKey}`)
        if (!proxyRow || !proxyRow.layoutStrata.map(Number).includes(Number(expected.targetStratum))) {
            missingProxyCoverage.push(key)
        }
        const actual = occupancyCandidates.indexed.get(key)
        if (!actual) {
            missingFinal.push(key)
            return
        }
        const membership = expectedMembership(actual)
        if (Number(actual.observedClass) !== Number(expected.targetStratum)
            || Number(actual.observedMask) !== 1
            || membership.unmaskedClass !== Number(expected.targetStratum)
            || membership.observedMask !== 1) {
            membershipMismatches.push({key, actual, membership})
        }
        if (Number(actual.targetStratum) !== Number(expected.targetStratum)
            || Number(actual.i) !== Number(expected.i)
            || Number(actual.j) !== Number(expected.j)
            || Number(actual.level) !== Number(expected.level)
            || Number(actual.densityOffset) !== Number(expected.densityOffset)) {
            propertyMismatches.push({key, actual, expected})
        }
        if (!near(actual.arrangementX, expected.arrangementX)
            || !near(actual.arrangementY, expected.arrangementY)
            || !near(actual.geometryX, expected.arrangementX)
            || !near(actual.geometryY, expected.arrangementY)) {
            geometryMismatches.push({key, actual, expected})
        }
        if (!singleCandidates.indexed.has(key)) {
            singleFinalDifferences.push(key)
        }
    })
    occupancyCandidates.indexed.forEach((_actual, key) => {
        if (!referenceCandidates.indexed.has(key)) {
            extraFinal.push(key)
        }
        if (!singleCandidates.indexed.has(key)) {
            singleFinalDifferences.push(key)
        }
    })
    singleCandidates.indexed.forEach((_actual, key) => {
        if (!occupancyCandidates.indexed.has(key)) {
            singleFinalDifferences.push(key)
        }
    })
    const occupancyRows = rows.filter(({source}) => source === 'occupancyRow')
    const referenceRows = rows.filter(({source}) => source === 'reference')
    const occupiedByClass = Object.fromEntries(scenarioConfigs.flatMap(({name, layouts}) =>
        layouts.map(({targetStratum}) => {
            const band = `has_${targetStratum}`
            return [`${name}:${targetStratum}`, occupancyRows.filter(row => row.scenario === name
                && Number(row[band]) === 1).length]
        })
    ))
    const byClass = {}
    const includedScenarios = new Set(rows.map(({scenario}) => scenario))
    scenarioConfigs.filter(({name}) => includedScenarios.has(name)).forEach(({name, layouts}) =>
        layouts.forEach(({targetStratum}) => {
            const proxyCount = proxyRows.filter(row => row.scenario === name
                && row.layoutStrata.map(Number).includes(targetStratum)).length
            const exact = [...occupancyCandidates.indexed.values()].filter(row => row.scenario === name
                && Number(row.targetStratum) === targetStratum).length
            byClass[`${name}:${targetStratum}`] = {
                occupiedTiles: occupiedByClass[`${name}:${targetStratum}`],
                proxy: proxyCount,
                exact,
                falsePositiveProxyRows: proxyCount - exact,
                proxyInflation: exact ? proxyCount / exact : null
            }
        })
    )
    const boundaryWitnesses = [...referenceCandidates.indexed.values()].map(row => {
        const x = Number(row.arrangementX)
        const y = Number(row.arrangementY)
        const deltaX = x - Math.round(x / OCCUPANCY_TILE_SIZE_METRES) * OCCUPANCY_TILE_SIZE_METRES
        const deltaY = y - Math.round(y / OCCUPANCY_TILE_SIZE_METRES) * OCCUPANCY_TILE_SIZE_METRES
        const absX = Math.abs(deltaX)
        const absY = Math.abs(deltaY)
        const sourceCrs = scenarioConfigs.find(({name}) => name === row.scenario).source.crs
        return {
            row,
            deltaX,
            deltaY,
            exactEdge: absX <= TILE_BOUNDARY_EXACT_TOLERANCE_METRES
                || absY <= TILE_BOUNDARY_EXACT_TOLERANCE_METRES,
            exactCorner: absX <= TILE_BOUNDARY_EXACT_TOLERANCE_METRES
                && absY <= TILE_BOUNDARY_EXACT_TOLERANCE_METRES,
            nearEdge: Math.min(absX, absY) <= TILE_BOUNDARY_NEAR_DISTANCE_METRES,
            nearCorner: absX <= TILE_BOUNDARY_NEAR_DISTANCE_METRES
                && absY <= TILE_BOUNDARY_NEAR_DISTANCE_METRES,
            negativeSide: deltaX < -TILE_BOUNDARY_EXACT_TOLERANCE_METRES
                    && absX <= TILE_BOUNDARY_NEAR_DISTANCE_METRES
                || deltaY < -TILE_BOUNDARY_EXACT_TOLERANCE_METRES
                    && absY <= TILE_BOUNDARY_NEAR_DISTANCE_METRES,
            positiveSide: deltaX > TILE_BOUNDARY_EXACT_TOLERANCE_METRES
                    && absX <= TILE_BOUNDARY_NEAR_DISTANCE_METRES
                || deltaY > TILE_BOUNDARY_EXACT_TOLERANCE_METRES
                    && absY <= TILE_BOUNDARY_NEAR_DISTANCE_METRES,
            crossCrs: sourceCrs !== ARRANGEMENT_CRS,
            negativeTileIndex: Math.floor(x / OCCUPANCY_TILE_SIZE_METRES) < 0
                || Math.floor(y / OCCUPANCY_TILE_SIZE_METRES) < 0
        }
    })
    const scenarioConfig = scenarioConfigs.find(({name}) => includedScenarios.has(name))
    const tileBoundaryCandidates = boundaryWitnesses.filter(({nearEdge}) => nearEdge).length
    const summary = {
        referenceCandidates: referenceCandidates.indexed.size,
        singleCandidates: singleCandidates.indexed.size,
        occupancyRows: occupancyRows.length,
        occupancyProxy: proxy.size,
        occupancyCandidates: occupancyCandidates.indexed.size,
        duplicateProxyKeys: duplicateProxyKeys.length,
        duplicateCandidateKeys: occupancyCandidates.duplicates.length,
        missingProxyCoverage: missingProxyCoverage.length,
        missingFinal: missingFinal.length,
        extraFinal: extraFinal.length,
        singleFinalDifferences: new Set(singleFinalDifferences).size,
        membershipMismatches: membershipMismatches.length,
        propertyMismatches: propertyMismatches.length,
        geometryMismatches: geometryMismatches.length,
        tileBoundaryCandidates,
        exactTileEdgeCandidates: boundaryWitnesses.filter(({exactEdge}) => exactEdge).length,
        exactTileCornerCandidates: boundaryWitnesses.filter(({exactCorner}) => exactCorner).length,
        nearTileCornerCandidates: boundaryWitnesses.filter(({nearCorner}) => nearCorner).length,
        negativeEdgeSideCandidates: boundaryWitnesses.filter(({negativeSide}) => negativeSide).length,
        positiveEdgeSideCandidates: boundaryWitnesses.filter(({positiveSide}) => positiveSide).length,
        crossCrsTileBoundaryCandidates: boundaryWitnesses.filter(({nearEdge, crossCrs}) =>
            nearEdge && crossCrs).length,
        negativeTileIndexCandidates: boundaryWitnesses.filter(({negativeTileIndex}) => negativeTileIndex).length,
        maskedReferenceRows: referenceRows.filter(row => expectedMembership(row).observedMask !== 1).length,
        isolatedClassCandidates: [...occupancyCandidates.indexed.values()].filter(row =>
            row.scenario === 'isolated-pixels-cross-crs' && Number(row.targetStratum) === 1).length,
        sourceScaleMetres: Math.abs(scenarioConfig.source.transform[0]),
        occupancyEnvelope: occupancyEnvelopeAtScale(Math.abs(scenarioConfig.source.transform[0])),
        byClass,
        examples: {
            missingProxyCoverage: missingProxyCoverage.slice(0, 5),
            missingFinal: missingFinal.slice(0, 5),
            extraFinal: extraFinal.slice(0, 5),
            singleFinalDifferences: [...new Set(singleFinalDifferences)].slice(0, 5),
            membershipMismatches: membershipMismatches.slice(0, 2),
            propertyMismatches: propertyMismatches.slice(0, 2),
            geometryMismatches: geometryMismatches.slice(0, 2)
        }
    }
    if (summary.duplicateProxyKeys || summary.duplicateCandidateKeys || summary.missingProxyCoverage
        || summary.missingFinal || summary.extraFinal || summary.singleFinalDifferences
        || summary.membershipMismatches || summary.propertyMismatches || summary.geometryMismatches) {
        throw new Error(`Occupancy equivalence mismatch: ${JSON.stringify(summary)}`)
    }
    return summary
}

const dataCall = (name, operation) => {
    requests[name] += 1
    return callbackPromise(operation)
}

const taskStatus = taskId => dataCall('exportStatusPolls', callback =>
    ee.data.getTaskStatus(taskId, (status, error) => callback(status, error))
).then(statuses => statuses[0])

const waitForTask = async task => {
    for (;;) {
        const status = await taskStatus(task.id)
        if (!['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(status.state)) {
            return status
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
}

const isNotFound = error => /not found|does not exist|404/i.test(String(error))

const waitForMetadataVisibility = async ({assetId, completedAt}) => {
    const ledger = []
    for (;;) {
        const elapsedSeconds = (Date.now() - completedAt) / 1000
        if (elapsedSeconds > 120) {
            throw new Error(`Asset metadata was not visible within 120 seconds: ${assetId}`)
        }
        requests.metadataVisibilityPolls += 1
        try {
            const asset = await callbackPromise(callback =>
                ee.data.getAsset(assetId, (result, error) => callback(result, error))
            )
            ledger.push({elapsedSeconds, state: 'VISIBLE'})
            return {asset, elapsedSeconds, ledger}
        } catch (error) {
            if (!isNotFound(error)) {
                throw error
            }
            ledger.push({elapsedSeconds, state: 'NOT_FOUND'})
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        }
    }
}

const cleanupAsset = async assetId => {
    if (!assetId) {
        return {assetId: null, deleted: false, absent: true}
    }
    try {
        await dataCall('assetDeletes', callback =>
            ee.data.deleteAsset(assetId, (result, error) => callback(result, error))
        )
        createdAssets.delete(assetId)
    } catch (error) {
        if (!isNotFound(error)) {
            throw error
        }
        createdAssets.delete(assetId)
    }
    requests.cleanupVerifications += 1
    const startedAt = Date.now()
    for (;;) {
        try {
            await callbackPromise(callback =>
                ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
            )
            if (Date.now() - startedAt > 120_000) {
                throw new Error(`Temporary asset still exists after 120 seconds: ${assetId}`)
            }
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        } catch (error) {
            if (isNotFound(error)) {
                break
            }
            throw error
        }
    }
    return {assetId, deleted: true, absent: true}
}

const readyRows = ({assetId, scenario}) => ee.FeatureCollection(assetId).map(feature => {
    const {x, y, geometry} = exactPoint({
        projection: scenario.projection,
        i: ee.Number(feature.get('i')),
        j: ee.Number(feature.get('j')),
        dx: ee.Number(feature.get('dx')),
        dy: ee.Number(feature.get('dy')),
        originX: ee.Number(feature.get('originX')),
        originY: ee.Number(feature.get('originY'))
    })
    const geometryCoordinates = feature.geometry().transform(scenario.projection, GEOMETRY_TOLERANCE).coordinates()
    const sourceCoordinates = feature.geometry().transform(scenario.sourceProjection, GEOMETRY_TOLERANCE).coordinates()
    return feature.set({
        source: 'ready',
        reconstructedX: x,
        reconstructedY: y,
        readyGeometryX: geometryCoordinates.get(0),
        readyGeometryY: geometryCoordinates.get(1),
        readySourceU: sourceCoordinates.get(0),
        readySourceV: sourceCoordinates.get(1)
    }).setGeometry(geometry)
})

const validateReadyAsset = ({info, expectedRows}) => {
    const rows = featureRows(info)
    const expected = new Map(expectedRows.map(row => [scopedKey(row), row]))
    const actual = new Map()
    const duplicates = []
    const missing = []
    const extra = []
    const membershipViolations = []
    const propertyViolations = []
    const geometryViolations = []
    const sourceCellChanges = []
    let maximumGeometryDisplacementMetres = 0
    rows.forEach(row => {
        const key = scopedKey(row)
        if (actual.has(key)) {
            duplicates.push(key)
        }
        actual.set(key, row)
        const expectedRow = expected.get(key)
        if (!expectedRow) {
            extra.push(key)
        }
        const membership = expectedMembership(row)
        if (Number(row.observedMask) !== 1
            || Number(row.observedClass) !== Number(row.targetStratum)
            || membership.observedMask !== 1
            || membership.unmaskedClass !== Number(row.targetStratum)) {
            membershipViolations.push({key, row, membership})
        }
        if (expectedRow && (Number(row.i) !== Number(expectedRow.i)
            || Number(row.j) !== Number(expectedRow.j)
            || Number(row.level) !== Number(expectedRow.level)
            || Number(row.targetStratum) !== Number(expectedRow.targetStratum)
            || Number(row.observedClass) !== Number(expectedRow.observedClass)
            || Number(row.observedMask) !== Number(expectedRow.observedMask))) {
            propertyViolations.push({key, row, expectedRow})
        }
        if (expectedRow) {
            const displacement = Math.hypot(
                Number(row.readyGeometryX) - Number(expectedRow.arrangementX),
                Number(row.readyGeometryY) - Number(expectedRow.arrangementY)
            )
            maximumGeometryDisplacementMetres = Math.max(maximumGeometryDisplacementMetres, displacement)
            if (!near(row.reconstructedX, expectedRow.arrangementX)
                || !near(row.reconstructedY, expectedRow.arrangementY)
                || displacement > 0.5) {
                geometryViolations.push({key, displacement, row, expectedRow})
            }
            if (Math.floor(Number(row.readySourceU)) !== Math.floor(Number(expectedRow.sourceU))
                || Math.floor(Number(row.readySourceV)) !== Math.floor(Number(expectedRow.sourceV))) {
                sourceCellChanges.push({key, row, expectedRow})
            }
        }
    })
    expected.forEach((_row, key) => {
        if (!actual.has(key)) {
            missing.push(key)
        }
    })
    const summary = {
        size: rows.length,
        expectedSize: expected.size,
        distinctStructuralKeys: actual.size,
        duplicates: duplicates.length,
        missing: missing.length,
        extra: extra.length,
        membershipViolations: membershipViolations.length,
        propertyViolations: propertyViolations.length,
        geometryViolations: geometryViolations.length,
        sourceCellChanges: sourceCellChanges.length,
        maximumGeometryDisplacementMetres,
        aoiMembershipEstablishedByOracleKeySetEquality: !missing.length && !extra.length,
        perStratum: Object.fromEntries([...new Set(rows.map(row => Number(row.targetStratum)))].map(stratum => [
            stratum,
            rows.filter(row => Number(row.targetStratum) === stratum).length
        ])),
        examples: {
            duplicates: duplicates.slice(0, 5),
            missing: missing.slice(0, 5),
            extra: extra.slice(0, 5),
            membershipViolations: membershipViolations.slice(0, 2),
            propertyViolations: propertyViolations.slice(0, 2),
            geometryViolations: geometryViolations.slice(0, 2),
            sourceCellChanges: sourceCellChanges.slice(0, 2)
        }
    }
    if (summary.duplicates || summary.missing || summary.extra || summary.membershipViolations
        || summary.propertyViolations || summary.geometryViolations || summary.sourceCellChanges) {
        throw new Error(`Ready asset mismatch: ${JSON.stringify(summary)}`)
    }
    return summary
}

const graphCharacteristics = collection => {
    const serialized = collection.serialize()
    const occurrences = value => (serialized.match(new RegExp(value, 'g')) || []).length
    return {
        serializedBytes: Buffer.byteLength(serialized),
        serializedCharacters: serialized.length,
        reduceToVectorsNodes: occurrences('Image.reduceToVectors'),
        reduceResolutionNodes: occurrences('Image.reduceResolution'),
        focalMaxNodes: occurrences('Image.focalMax'),
        reduceRegionsNodes: occurrences('Image.reduceRegions'),
        sampleRegionsNodes: occurrences('Image.sampleRegions')
    }
}

const waitForReadyValidation = async ({assetId, scenario, expectedCandidates, completedAt}) => {
    const ledger = []
    for (;;) {
        const elapsedSeconds = (Date.now() - completedAt) / 1000
        if (elapsedSeconds > 120) {
            throw new Error(`Asset rows were not readable within 120 seconds: ${assetId}`)
        }
        requests.rowReadabilityPolls += 1
        try {
            const info = await evaluate(flattenCollections([
                readyRows({assetId, scenario}),
                expectedCandidates
            ]), 'readyAssetValidation')
            const rows = featureRows(info)
            const expectedRows = rows.filter(({source}) => source === 'referenceCandidate')
            const readyInfo = {
                ...info,
                features: info.features.filter(({properties: {source}}) => source === 'ready')
            }
            ledger.push({elapsedSeconds, state: 'READABLE'})
            return {
                elapsedSeconds,
                ledger,
                validation: validateReadyAsset({info: readyInfo, expectedRows})
            }
        } catch (error) {
            if (!isNotFound(error)) {
                throw error
            }
            ledger.push({elapsedSeconds, state: 'NOT_FOUND'})
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        }
    }
}

const validateOccupancyRows = ({info, bands}) => {
    const rows = featureRows(info)
    const expectedRows = rows.filter(({source}) => source === 'expectedOccupancy')
    const readyRows = rows.filter(({source}) => source === 'readyOccupancy')
    const index = sourceRows => {
        const values = new Map()
        const duplicates = []
        sourceRows.forEach(row => {
            const key = `${row.scenario}|${row.tileKey}`
            if (values.has(key)) {
                duplicates.push(key)
            } else {
                values.set(key, row)
            }
        })
        return {values, duplicates}
    }
    const expected = index(expectedRows)
    const ready = index(readyRows)
    const missing = []
    const extra = []
    const propertyMismatches = []
    expected.values.forEach((expectedRow, key) => {
        const actual = ready.values.get(key)
        if (!actual) {
            missing.push(key)
            return
        }
        if (Number(actual.tileI) !== Number(expectedRow.tileI)
            || Number(actual.tileJ) !== Number(expectedRow.tileJ)
            || bands.some(band => Number(actual[band] || 0) !== Number(expectedRow[band] || 0))) {
            propertyMismatches.push({key, actual, expectedRow})
        }
    })
    ready.values.forEach((_row, key) => {
        if (!expected.values.has(key)) {
            extra.push(key)
        }
    })
    const occupiedByClass = Object.fromEntries(bands.map(band => [
        band.replace('has_', ''),
        readyRows.filter(row => Number(row[band]) === 1).length
    ]))
    const summary = {
        expectedSize: expected.values.size,
        readySize: ready.values.size,
        duplicateExpectedKeys: expected.duplicates.length,
        duplicateReadyKeys: ready.duplicates.length,
        missing: missing.length,
        extra: extra.length,
        propertyMismatches: propertyMismatches.length,
        occupiedByClass,
        examples: {
            missing: missing.slice(0, 5),
            extra: extra.slice(0, 5),
            propertyMismatches: propertyMismatches.slice(0, 2)
        }
    }
    if (summary.duplicateExpectedKeys || summary.duplicateReadyKeys || summary.missing
        || summary.extra || summary.propertyMismatches) {
        throw new Error(`Ready occupancy asset mismatch: ${JSON.stringify(summary)}`)
    }
    return summary
}

const runModestOccupancyExport = async ({scenario, occupancy}) => {
    const timestamp = Date.now()
    const assetId = `projects/daniel-wiell/assets/sd_systematic_occupancy_spike_${timestamp}`
    const description = `systematic-occupancy-index-${timestamp}`
    const bands = occupancyBands(scenario)
    const properties = ['scenario', 'tileKey', 'tileI', 'tileJ', 'tileSizeMetres', ...bands]
    const exportCollection = occupancy.select(properties)
    const graph = graphCharacteristics(exportCollection)
    const task = ee.batch.Export.table.toAsset(exportCollection, description, assetId)
    createdAssets.add(assetId)
    runningTask = task
    requests.exportStarts += 1
    const startedAt = Date.now()
    task.start()
    const status = await waitForTask(task)
    runningTask = null
    const elapsedSeconds = (Date.now() - startedAt) / 1000
    if (status.state !== 'COMPLETED') {
        throw new Error(`Modest occupancy export failed once: ${JSON.stringify(status)}`)
    }
    const completedAt = Date.now()
    const metadataVisibility = await waitForMetadataVisibility({assetId, completedAt})
    const reconstructedReady = ee.FeatureCollection(assetId).map(feature => feature
        .setGeometry(tileGeometry({
            scenario,
            tileI: feature.getNumber('tileI'),
            tileJ: feature.getNumber('tileJ')
        }))
        .set('source', 'readyOccupancy'))
    const expected = occupancy.map(feature => feature.set('source', 'expectedOccupancy'))
    const info = await evaluate(flattenCollections([expected, reconstructedReady]), 'readyAssetValidation')
    const validation = validateOccupancyRows({info, bands})
    return {
        assetId,
        taskId: task.id,
        elapsedSeconds,
        attempts: 1,
        status,
        metadataVisibility,
        graph,
        validation,
        reconstructedReady
    }
}

const runModestExport = async ({scenario, candidates, expectedCandidates}) => {
    const timestamp = Date.now()
    const assetId = `projects/daniel-wiell/assets/sd_systematic_hybrid_spike_${timestamp}`
    const description = `systematic-hybrid-prefilter-${timestamp}`
    createdAssets.add(assetId)
    const exportCollection = candidates.select([
        'key', 'scenario', 'layoutGroupId', 'targetStratum', 'requested', 'densityOffset', 'i', 'j', 'level',
        'dx', 'dy', 'originX', 'originY', 'arrangementX', 'arrangementY',
        'sourceU', 'sourceV', 'observedClass', 'observedMask'
    ])
    const graph = graphCharacteristics(exportCollection)
    const task = ee.batch.Export.table.toAsset(exportCollection, description, assetId)
    runningTask = task
    requests.exportStarts += 1
    const startedAt = Date.now()
    task.start()
    const status = await waitForTask(task)
    runningTask = null
    const elapsedSeconds = (Date.now() - startedAt) / 1000
    if (status.state !== 'COMPLETED') {
        throw new Error(`Modest export failed once: ${JSON.stringify(status)}`)
    }
    const completedAt = Date.now()
    const metadataVisibility = await waitForMetadataVisibility({assetId, completedAt})
    const rowReadability = await waitForReadyValidation({
        assetId,
        scenario,
        expectedCandidates,
        completedAt
    })
    return {
        assetId,
        taskId: task.id,
        elapsedSeconds,
        attempts: 1,
        status,
        metadataVisibility,
        rowReadability,
        validation: rowReadability.validation,
        graph: {
            ...graph,
            rawLayoutsBeforeGrouping: scenario.layouts.length,
            layoutGroupsAfterGrouping: layoutGroups(scenario).length
        }
    }
}

const cancelRunningTask = async () => {
    if (!runningTask) {
        return
    }
    const status = await taskStatus(runningTask.id)
    if (['READY', 'RUNNING'].includes(status.state)) {
        await callbackPromise(callback =>
            ee.data.cancelTask(runningTask.id, (result, error) => callback(result, error))
        )
    }
    runningTask = null
}

const main = async () => {
    const compact = process.env.SD_COMPACT === '1'
    const nesting = validateExactNesting()
    console.log(JSON.stringify({
        checkpoint: 'nesting',
        ...compact ? {...nesting, results: undefined} : nesting
    }, null, 2))
    if (process.env.SD_NESTING_ONLY === '1') {
        return
    }
    const preAuthentication = validatePreAuthenticationArithmetic()
    console.log(JSON.stringify({
        checkpoint: 'A',
        status: 'PASS',
        ...compact ? {} : preAuthentication
    }, null, 2))
    const checkpointAOnly = process.env.SD_CHECKPOINT_A_ONLY === '1'
    const occupancyPipeline = process.env.SD_OCCUPANCY_PIPELINE === '1'
    const exportOnly = process.env.SD_EXPORT_ONLY === '1' || occupancyPipeline
    const verifyAbsentAsset = process.env.SD_VERIFY_ABSENT_ASSET
    await authenticate({linkedUser: !checkpointAOnly})

    if (verifyAbsentAsset) {
        requests.cleanupVerifications += 1
        try {
            await callbackPromise(callback =>
                ee.data.getAsset(verifyAbsentAsset, (asset, error) => callback(asset, error))
            )
            throw new Error(`Temporary asset still exists: ${verifyAbsentAsset}`)
        } catch (error) {
            if (!isNotFound(error)) {
                throw error
            }
        }
        console.log(JSON.stringify({
            checkpoint: 'cleanup-verification',
            assetId: verifyAbsentAsset,
            absent: true,
            requests
        }, null, 2))
        return
    }

    if (!exportOnly) {
        const bufferWitness = assertAdversarialBufferWitness(
            await evaluate(adversarialBufferWitness(), 'finiteEquivalence')
        )
        console.log(JSON.stringify({
            checkpoint: 'OCCUPANCY_BUFFER_REQUIRED',
            status: 'PASS',
            bufferWitness
        }, null, 2))
    }

    const scenarios = buildScenarios()
    const references = new Map()
    const results = new Map()
    scenarios.forEach(scenario => {
        const reference = referenceWithDenseKeys({
            scenario,
            collection: prepareReference({scenario, raw: rawForScenario(scenario)})
        })
        const proxy = prepareReference({
            scenario,
            raw: proxyForScenario(scenario),
            source: 'proxy'
        })
        const direct = lookupResult({
            scenario,
            collection: reference,
            lookupSource: 'directLookup',
            candidateSource: 'referenceCandidate'
        })
        const hybrid = lookupResult({
            scenario,
            collection: proxy,
            lookupSource: 'hybridLookup',
            candidateSource: 'hybridCandidate'
        })
        const groupedProxy = prepareReference({
            scenario,
            raw: groupedProxyForScenario(scenario),
            source: 'groupedProxy'
        })
        const grouped = groupedLookupResult({scenario, collection: groupedProxy})
        const singleProxy = prepareReference({
            scenario,
            raw: singleProxyForScenario(scenario),
            source: 'singleProxy'
        })
        const single = singleLookupResult({scenario, collection: singleProxy})
        const occupancy = occupancyTable({scenario})
        const occupancyProxy = prepareReference({
            scenario,
            raw: singleProxyForScenario(scenario, occupancyMaskImage({scenario, occupancy})),
            source: 'occupancyProxy'
        })
        const occupancyResult = singleLookupResult({
            scenario,
            collection: occupancyProxy,
            lookupSource: 'occupancyLookup',
            candidateSource: 'occupancyCandidate'
        })
        references.set(scenario.name, reference)
        results.set(scenario.name, {
            proxy,
            direct,
            hybrid,
            groupedProxy,
            grouped,
            singleProxy,
            single,
            occupancy,
            occupancyProxy,
            occupancyResult
        })
    })
    let finite = null
    if (!exportOnly) {
        const scenarioResults = []
        for (const scenario of scenarios) {
            const result = results.get(scenario.name)
            const finiteOutput = flattenCollections([
                references.get(scenario.name),
                result.direct.reduced,
                result.direct.candidates,
                result.proxy,
                result.hybrid.reduced,
                result.hybrid.candidates,
                result.groupedProxy,
                result.grouped.reduced,
                result.grouped.candidates,
                result.singleProxy,
                result.single.reduced,
                result.single.candidates,
                result.occupancy,
                result.occupancyProxy,
                result.occupancyResult.reduced,
                result.occupancyResult.candidates
            ])
            const finiteInfo = await evaluate(finiteOutput, 'finiteEquivalence')
            const ungrouped = summarizeFiniteEquivalence(finiteInfo)
            const grouped = summarizeGroupedEquivalence(finiteInfo)
            const single = summarizeSingleEquivalence(finiteInfo)
            const occupancy = summarizeOccupancyEquivalence(finiteInfo)
            scenarioResults.push({scenario: scenario.name, ungrouped: ungrouped.summary, grouped, single, occupancy})
            console.log(JSON.stringify(compact
                ? {
                    checkpoint: 'B-scenario',
                    status: 'PASS',
                    scenario: scenario.name,
                    referenceCandidates: single.referenceCandidates,
                    groupedProxy: grouped.groupedProxy,
                    singleProxy: single.singleProxy,
                    singleCandidates: single.singleCandidates,
                    missingProxyCoverage: single.missingProxyCoverage,
                    finalDifferences: single.groupedFinalDifferences,
                    levelCountDifferences: single.levelCountDifferences,
                    mismatches: single.membershipMismatches + single.propertyMismatches
                        + single.geometryMismatches,
                    byClass: single.byClass,
                    occupancy
                }
                : {
                    checkpoint: 'B-scenario',
                    status: 'PASS',
                    scenario: scenario.name,
                    ungrouped: ungrouped.summary,
                    grouped,
                    single,
                    occupancy
                }, null, 2))
        }
        const sum = (section, property) => scenarioResults.reduce(
            (total, result) => total + Number(result[section][property] || 0),
            0
        )
        finite = {
            scenarios: scenarioResults.length,
            referenceRecords: sum('ungrouped', 'referenceRecords'),
            referenceCandidates: sum('ungrouped', 'referenceCandidates'),
            ungroupedProxy: sum('grouped', 'ungroupedProxy'),
            groupedProxy: sum('grouped', 'groupedProxy'),
            groupedCandidates: sum('grouped', 'groupedCandidates'),
            singleProxy: sum('single', 'singleProxy'),
            singleCandidates: sum('single', 'singleCandidates'),
            boundaryNearRows: sum('ungrouped', 'boundaryNearRows'),
            exactBoundaryRows: sum('ungrouped', 'exactBoundaryRows'),
            missingProxyCoverage: sum('grouped', 'missingProxyCoverage'),
            finalDifferences: sum('grouped', 'ungroupedFinalDifferences'),
            membershipMismatches: sum('grouped', 'membershipMismatches'),
            propertyMismatches: sum('grouped', 'propertyMismatches'),
            geometryMismatches: sum('grouped', 'geometryMismatches'),
            singleMissingProxyCoverage: sum('single', 'missingProxyCoverage'),
            singleFinalDifferences: sum('single', 'groupedFinalDifferences'),
            singleLevelCountDifferences: sum('single', 'levelCountDifferences'),
            singleMembershipMismatches: sum('single', 'membershipMismatches'),
            singlePropertyMismatches: sum('single', 'propertyMismatches'),
            singleGeometryMismatches: sum('single', 'geometryMismatches'),
            occupancyRows: sum('occupancy', 'occupancyRows'),
            occupancyProxy: sum('occupancy', 'occupancyProxy'),
            occupancyCandidates: sum('occupancy', 'occupancyCandidates'),
            occupancyMissingProxyCoverage: sum('occupancy', 'missingProxyCoverage'),
            occupancyFinalDifferences: sum('occupancy', 'singleFinalDifferences'),
            occupancyMembershipMismatches: sum('occupancy', 'membershipMismatches'),
            occupancyPropertyMismatches: sum('occupancy', 'propertyMismatches'),
            occupancyGeometryMismatches: sum('occupancy', 'geometryMismatches'),
            occupancyTileBoundaryCandidates: sum('occupancy', 'tileBoundaryCandidates'),
            occupancyExactTileEdgeCandidates: sum('occupancy', 'exactTileEdgeCandidates'),
            occupancyExactTileCornerCandidates: sum('occupancy', 'exactTileCornerCandidates'),
            occupancyNearTileCornerCandidates: sum('occupancy', 'nearTileCornerCandidates'),
            occupancyNegativeEdgeSideCandidates: sum('occupancy', 'negativeEdgeSideCandidates'),
            occupancyPositiveEdgeSideCandidates: sum('occupancy', 'positiveEdgeSideCandidates'),
            occupancyCrossCrsTileBoundaryCandidates: sum('occupancy', 'crossCrsTileBoundaryCandidates'),
            occupancyNegativeTileIndexCandidates: sum('occupancy', 'negativeTileIndexCandidates'),
            occupancyMaskedReferenceRows: sum('occupancy', 'maskedReferenceRows'),
            occupancyIsolatedClassCandidates: sum('occupancy', 'isolatedClassCandidates'),
            scenarioResults
        }
        assert(finite.boundaryNearRows > 0 && finite.exactBoundaryRows > 0,
            'Finite scenarios did not retain near/exact boundary coverage')
        assert(finite.occupancyTileBoundaryCandidates > 0
            && finite.occupancyExactTileEdgeCandidates > 0
            && finite.occupancyExactTileCornerCandidates > 0
            && finite.occupancyNearTileCornerCandidates > 0
            && finite.occupancyNegativeEdgeSideCandidates > 0
            && finite.occupancyPositiveEdgeSideCandidates > 0
            && finite.occupancyCrossCrsTileBoundaryCandidates > 0
            && finite.occupancyNegativeTileIndexCandidates > 0
            && finite.occupancyMaskedReferenceRows > 0
            && finite.occupancyIsolatedClassCandidates > 0,
        `Finite occupancy boundary witnesses are incomplete: ${JSON.stringify(finite)}`)
        const subMetre = scenarioResults.find(({scenario}) =>
            scenario === 'submetre-tile-envelope-cross-crs')
        assert(subMetre
            && subMetre.occupancy.referenceCandidates > 0
            && subMetre.occupancy.exactTileCornerCandidates > 0
            && subMetre.occupancy.negativeEdgeSideCandidates > 0
            && subMetre.occupancy.positiveEdgeSideCandidates > 0
            && subMetre.occupancy.missingProxyCoverage === 0
            && subMetre.occupancy.singleFinalDifferences === 0,
        `Sub-metre occupancy witness is incomplete: ${JSON.stringify(subMetre)}`)
        console.log(JSON.stringify({
            checkpoint: 'B',
            status: 'PASS',
            finite: compact ? {...finite, scenarioResults: undefined} : finite
        }, null, 2))
    } else {
        console.log(JSON.stringify({
            checkpoint: 'B',
            status: 'REUSED',
            finiteResult: 'reused from the immediately preceding grouped finite run'
        }, null, 2))
    }

    const modestScenario = scenarios.find(({name}) => name === 'prior-cross-crs-seeded')
    const modestCandidates = results.get(modestScenario.name).single.candidates
    const modestGraph = graphCharacteristics(modestCandidates)
    assert(modestGraph.focalMaxNodes === 1
        && modestGraph.reduceResolutionNodes === 1
        && modestGraph.reduceToVectorsNodes === 1
        && modestGraph.reduceRegionsNodes === 1
        && modestGraph.sampleRegionsNodes === 0,
    `Single-lattice graph shape mismatch: ${JSON.stringify(modestGraph)}`)
    console.log(JSON.stringify({checkpoint: 'graph-shape', status: 'PASS', graph: modestGraph}, null, 2))

    if (checkpointAOnly || process.env.SD_GRAPH_ONLY === '1') {
        console.log(JSON.stringify({
            verdict: 'hybrid overlap proxy is complete on finite fixtures; export not requested',
            requests
        }, null, 2))
        return
    }

    const modestExpectedCandidates = results.get(modestScenario.name).direct.candidates
    if (occupancyPipeline) {
        let occupancyExport = null
        let candidateExport = null
        const cleanup = []
        try {
            occupancyExport = await runModestOccupancyExport({
                scenario: modestScenario,
                occupancy: results.get(modestScenario.name).occupancy
            })
            const {reconstructedReady, ...occupancyReport} = occupancyExport
            console.log(JSON.stringify({checkpoint: 'OCCUPANCY_EXPORT', status: 'PASS', ...occupancyReport}, null, 2))
            const readyMask = occupancyMaskImage({
                scenario: modestScenario,
                occupancy: reconstructedReady
            })
            const readyProxy = prepareReference({
                scenario: modestScenario,
                raw: singleProxyForScenario(modestScenario, readyMask),
                source: 'occupancyProxy'
            })
            const readyCandidates = singleLookupResult({
                scenario: modestScenario,
                collection: readyProxy,
                lookupSource: 'occupancyLookup',
                candidateSource: 'occupancyCandidate'
            }).candidates
            const candidateGraph = graphCharacteristics(readyCandidates)
            assert(candidateGraph.focalMaxNodes === 0
                && candidateGraph.reduceResolutionNodes === 0
                && candidateGraph.reduceToVectorsNodes === 1
                && candidateGraph.reduceRegionsNodes === 1
                && candidateGraph.sampleRegionsNodes === 0,
            `Occupancy candidate graph shape mismatch: ${JSON.stringify(candidateGraph)}`)
            candidateExport = await runModestExport({
                scenario: modestScenario,
                candidates: readyCandidates,
                expectedCandidates: modestExpectedCandidates
            })
            console.log(JSON.stringify({checkpoint: 'OCCUPANCY_CANDIDATE_EXPORT', status: 'PASS', ...candidateExport}, null, 2))
        } finally {
            if (candidateExport?.assetId) {
                cleanup.push(await cleanupAsset(candidateExport.assetId))
            }
            if (occupancyExport?.assetId) {
                cleanup.push(await cleanupAsset(occupancyExport.assetId))
            }
        }
        console.log(JSON.stringify({
            verdict: 'coarse occupancy and exact candidate modest exports completed',
            requests,
            cleanup
        }, null, 2))
        return
    }
    let exportResult = null
    let cleanup = null
    try {
        exportResult = await runModestExport({
            scenario: modestScenario,
            candidates: modestCandidates,
            expectedCandidates: modestExpectedCandidates
        })
        console.log(JSON.stringify({checkpoint: 'C', status: 'PASS', ...exportResult}, null, 2))
    } finally {
        cleanup = await cleanupAsset(exportResult?.assetId || [...createdAssets][0])
    }
    console.log(JSON.stringify({
        verdict: 'exact finite native-grid membership; modest reduceRegions export completed',
        requests,
        cleanup
    }, null, 2))
}

try {
    await main()
} catch (error) {
    let cleanupError = null
    try {
        await cancelRunningTask()
        for (const assetId of [...createdAssets]) {
            await cleanupAsset(assetId)
        }
    } catch (caughtCleanupError) {
        cleanupError = caughtCleanupError
    }
    console.error(JSON.stringify({
        verdict: 'STOPPED',
        error: error?.stack || String(error),
        cleanupError: cleanupError?.stack || null,
        requests,
        remainingTrackedAssets: [...createdAssets]
    }, null, 2))
    process.exitCode = 1
}
