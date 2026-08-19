import ee from '#sepal/ee/ee'

import {
    googleProjectId,
    serviceAccountCredentials
} from '#gee/config'
import {resolveSamplingGridCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {
    seedOriginPhase,
    selectSystematicLevels,
    stratifiedSystematicFinalSamples,
    systematicSelectionSummary
} from '#sepal/ee/samplingDesign/systematicSampling'
import {nestedLevel} from '#sepal/ee/samplingDesign/systematicLatticeMath'

const ARRANGEMENT_CRS = resolveSamplingGridCrs('EPSG:6933')
const ERROR_MARGIN = 0.001
const SENTINEL = -9999
const SQRT3 = Math.sqrt(3)
const FINITE_REFERENCE_INDEX_LIMIT = 48
const MAX_LATTICE_EXPONENT = 24
const BASE_GRID_SLACK = 0.75
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
const SUDAN_POLL_INTERVAL_MS = 10000
const SUDAN_MAX_RUNNING_MS = 45 * 60 * 1000
const SUDAN_MAX_BATCH_EECU_SECONDS = 10000
const ASSET_ROOT = 'projects/daniel-wiell/assets'
const PREVIOUS_TASK_ID = 'V5TQ36Q45MVR2IRQHSUW6KB4'
const PREVIOUS_FAILED_ASSET = `${ASSET_ROOT}/sd_systematic_source_grid_exact_candidates_sudan_1786973003495`
const RETAINED_EVIDENCE_ASSETS = [
    `${ASSET_ROOT}/sd_systematic_source_grid_nominations_sudan_1786962198406`,
    `${ASSET_ROOT}/sd_systematic_source_grid_validation_sudan_1786969987644`
]
const SUDAN_CANDIDATE_ASSET = `${ASSET_ROOT}/sd_systematic_exact_centred_sudan_1787037882518`
const FINAL_LEVELS_BY_STRATUM = {
    0: 1,
    1: 1,
    2: 1.5,
    3: 1,
    4: 1,
    5: 1,
    6: 0.5,
    7: 0.5,
    8: 1
}
const FINAL_COUNTS_BY_STRATUM = {
    0: 1996,
    1: 6687,
    2: 1462,
    3: 1527,
    4: 24158,
    5: 22844,
    6: 2852,
    7: 57266,
    8: 26
}
const FINAL_TOTAL = 118818
const EXPORT_PROPERTIES = ['stratum', 'i', 'j', 'level']
const FINAL_EXPORT_PROPERTIES = ['id', 'stratum', 'selectedLevel']
const FINITE_CANDIDATE_PROPERTIES = [
    ...EXPORT_PROPERTIES,
    'id', 'arrangementX', 'arrangementY', 'observedClass', 'observedMask',
    'centroidDisplacement', 'parityBranch'
]
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

const finiteConfigs = [
    {
        name: 'same-crs-discriminating-exact-corner',
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        rootOrigin: {x: -80, y: 80},
        classShift: 0,
        cornerDiscriminator: true,
        requireCorner: true
    },
    {
        name: 'same-crs-exact-source-boundary',
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        rootOrigin: {x: 0, y: 0},
        classShift: 0
    },
    {
        name: 'same-crs-negative-side-source-boundary',
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        rootOrigin: {x: -1e-7, y: -1e-7},
        classShift: 1
    },
    {
        name: 'same-crs-positive-side-source-boundary',
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        rootOrigin: {x: 1e-7, y: 1e-7},
        classShift: 2
    },
    {
        name: 'same-crs-seeded-shift-and-hole',
        source: {crs: ARRANGEMENT_CRS, transform: [17, 0, -137.3, 0, -17, 138.7]},
        rootOrigin: {x: 13.25, y: -17.75},
        classShift: 1
    },
    {
        name: 'cross-crs-fixed-shifted-utm',
        source: {crs: 'EPSG:32631', transform: [20, 0, 165861, 0, -20, 160]},
        rootOrigin: {x: 0, y: 0},
        classShift: 2
    },
    {
        name: 'cross-crs-seeded-shifted-utm',
        source: {crs: 'EPSG:32631', transform: [23, 0, 165843, 0, -23, 184]},
        rootOrigin: {x: -11.5, y: 19.25},
        classShift: 0
    },
    {
        name: 'same-crs-isolated-one-pixel-class',
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -160, 0, -20, 160]},
        rootOrigin: {x: -70, y: 70},
        classShift: 0,
        isolatedClass: true,
        isolatedCell: {i: 4, j: 4}
    },
    {
        name: 'cross-crs-repair-density',
        source: {crs: 'EPSG:32631', transform: [16, 0, 165853, 0, -16, 176]},
        rootOrigin: {x: -7.5, y: 11.25},
        classShift: 1,
        densityFactor: 0.5
    }
]

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message)
    }
}

const positiveMod = (value, modulus) => ((value % modulus) + modulus) % modulus

const pixelCentreFloorPreflight = () => {
    const checks = [
        {value: -2.5, expected: -3},
        {value: -0.5, expected: -1},
        {value: 0.5, expected: 0}
    ].map(check => ({...check, actual: Math.floor(check.value)}))
    checks.forEach(({value, expected, actual}) =>
        assert(actual === expected, `Pixel-centre floor mismatch for ${value}: ${actual} != ${expected}`)
    )
    return {status: 'PASS', checks}
}

const onConfiguredGrid = ({image, projection}) => image.reproject(projection)

// Two forms of the categorical input exist: a combined class-and-mask image (sentinel + explicit mask band), and
// the MASKED SINGLE BAND already reprojected to the Stratification grid that stratificationImage$ supplies.
// This mode runs the finite matrix against the masked single band, comparing
// against the UNCHANGED sentinel-form oracle.
const MASKED_SINGLE_BAND = process.env.SD_SYSTEMATIC_MASKED_BAND === '1'

const productionStratification = ({sourceClass, sourceMask, sourceProjection}) =>
    sourceClass.updateMask(sourceMask).rename('stratum').toInt()
        .setDefaultProjection(sourceProjection)
        .reproject(sourceProjection)

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

const exactPointValue = ({i, j, dx, dy, originX, originY}) => ({
    x: originX + i * dx + positiveMod(j, 2) * dx / 2,
    y: originY + j * dy
})

const exactPoint = ({projection, i, j, dx, dy, originX, originY}) => {
    const eeI = ee.Number(i).toInt()
    const eeJ = ee.Number(j).toInt()
    const parity = eeJ.mod(2).add(2).mod(2)
    const x = ee.Number(originX).add(eeI.multiply(dx)).add(parity.multiply(ee.Number(dx).divide(2)))
    const y = ee.Number(originY).add(eeJ.multiply(dy))
    return {x, y, geometry: ee.Geometry.Point([x, y], projection)}
}

const latticeTransform = ({layout, parity}) => parity === 0
    ? [layout.dx, 0, ee.Number(layout.originX).subtract(layout.dx / 2), 0, -2 * layout.dy,
        ee.Number(layout.originY).add(layout.dy)]
    : [layout.dx, 0, layout.originX, 0, -2 * layout.dy, ee.Number(layout.originY).add(2 * layout.dy)]

const finiteLayoutValues = config => [32, 64, 128].map((diameter, index) => {
    const effectiveDiameter = diameter * (config.densityFactor || 1)
    const dx = effectiveDiameter * SQRT3
    const dy = effectiveDiameter * 1.5
    return {
        stratum: index + 1,
        diameter: effectiveDiameter,
        dx,
        dy,
        originX: positiveMod(config.rootOrigin.x, dx * 16),
        originY: positiveMod(config.rootOrigin.y, dy * 32)
    }
})

const buildFiniteScenario = config => {
    const arrangementProjection = ee.Projection(ARRANGEMENT_CRS)
    const sourceProjection = ee.Projection(config.source.crs, config.source.transform)
    const outer = [[0, 0], [16, 0], [16, 16], [0, 16], [0, 0]]
    const hole = [[6, 6], [10, 6], [10, 10], [6, 10], [6, 6]]
    const region = ee.Geometry.Polygon([outer, hole], sourceProjection, false)
    const sourceCoordinates = ee.Image.pixelCoordinates(sourceProjection)
    const sourceI = sourceCoordinates.select('x').floor().toInt()
    const sourceJ = sourceCoordinates.select('y').floor().toInt()
    let sourceMask = sourceI.multiply(7).add(sourceJ.multiply(11)).add(1).mod(13).neq(0).toInt()
    let sourceClass = sourceI.multiply(3).add(sourceJ.multiply(5)).add(config.classShift)
        .mod(3).add(1).toInt()
    if (config.cornerDiscriminator) {
        const lowerRight = sourceI.eq(4).and(sourceJ.eq(4))
        const lowerLeft = sourceI.eq(3).and(sourceJ.eq(4))
        const upperRight = sourceI.eq(4).and(sourceJ.eq(3))
        const upperLeft = sourceI.eq(3).and(sourceJ.eq(3))
        sourceClass = ee.Image(2)
            .where(lowerRight, 1)
            .where(lowerLeft, 2)
            .where(upperRight, 3)
            .where(upperLeft, 1)
            .toInt()
        sourceMask = ee.Image(1).where(upperLeft, 0).toInt()
    }
    if (config.isolatedClass) {
        sourceClass = sourceI.add(sourceJ).mod(2).add(1).toInt()
            .where(
                sourceI.eq(config.isolatedCell.i).and(sourceJ.eq(config.isolatedCell.j)),
                3
            )
    }
    const nativeLookupImage = sourceClass.updateMask(sourceMask).unmask(SENTINEL).rename('observedClass')
        .addBands(sourceMask.unmask(0).rename('observedMask'))
        .setDefaultProjection(sourceProjection)
    const lookupImage = onConfiguredGrid({image: nativeLookupImage, projection: sourceProjection})
    return {
        ...config,
        arrangementProjection,
        sourceProjection,
        region,
        sourceClass,
        sourceMask,
        lookupImage,
        maskedStratification: productionStratification({sourceClass, sourceMask, sourceProjection}),
        layouts: finiteLayoutValues(config)
    }
}

const buildConfiguredGridScenario = mode => {
    const arrangementProjection = ee.Projection(ARRANGEMENT_CRS)
    const nativeProjection = ee.Projection(
        ARRANGEMENT_CRS,
        [20, 0, -160, 0, -20, 160]
    )
    const configuredProjection = ee.Projection(
        ARRANGEMENT_CRS,
        [20, 0, -153, 0, -20, 153]
    )
    const outer = [[0, 0], [16, 0], [16, 16], [0, 16], [0, 0]]
    const hole = [[6, 6], [10, 6], [10, 10], [6, 10], [6, 6]]
    const region = ee.Geometry.Polygon([outer, hole], configuredProjection, false)
    const nativeCoordinates = ee.Image.pixelCoordinates(nativeProjection)
    const nativeI = nativeCoordinates.select('x').floor().toInt()
    const nativeJ = nativeCoordinates.select('y').floor().toInt()
    const nativeClass = nativeI.multiply(5).add(nativeJ.multiply(7)).mod(3).add(1).toInt()
    const nativeMask = nativeI.multiply(11).add(nativeJ.multiply(13)).add(1).mod(9).neq(0).toInt()
    const nativeLookup = nativeClass.updateMask(nativeMask).unmask(SENTINEL).rename('observedClass')
        .addBands(nativeMask.unmask(0).rename('observedMask'))
        .setDefaultProjection(nativeProjection)
    const lookupImage = mode === 'forced-configured'
        ? onConfiguredGrid({image: nativeLookup, projection: configuredProjection})
        : mode === 'default-configured'
            ? nativeLookup.setDefaultProjection(configuredProjection)
            : nativeLookup
    const config = {
        name: `native-versus-configured-${mode}`,
        source: {crs: ARRANGEMENT_CRS, transform: [20, 0, -153, 0, -20, 153]},
        rootOrigin: {x: 4.75, y: -6.25},
        classShift: 0
    }
    return {
        ...config,
        arrangementProjection,
        sourceProjection: configuredProjection,
        nativeProjection,
        configuredProjection,
        region,
        sourceClass: nativeClass,
        sourceMask: nativeMask,
        lookupImage,
        // The witness discriminates on WHICH projection the categorical is locked to, so the masked form must
        // mirror the same three modes rather than always forcing the configured grid.
        maskedStratification: (masked => mode === 'forced-configured'
            ? masked.reproject(configuredProjection)
            : mode === 'default-configured'
                ? masked.setDefaultProjection(configuredProjection)
                : masked
        )(nativeClass.updateMask(nativeMask).rename('stratum').toInt().setDefaultProjection(nativeProjection)),
        layouts: finiteLayoutValues(config),
        configuredGridMode: mode
    }
}

const densestPlan = scenario => {
    const densest = scenario.layouts.reduce(
        (selected, layout) => layout.diameter < selected.diameter ? layout : selected,
        scenario.layouts[0]
    )
    const layouts = scenario.layouts.map((layout, layoutIndex) => {
        const ratio = layout.diameter / densest.diameter
        assert(Number.isSafeInteger(ratio) && ratio >= 1 && (ratio & (ratio - 1)) === 0,
            `${scenario.name}: non-nested diameter ratio ${ratio}`)
        const numericOrigins = [layout.originX, layout.originY, densest.originX, densest.originY]
            .every(value => typeof value === 'number')
        if (numericOrigins) {
            const phaseShiftI = Math.round((layout.originX - densest.originX) / densest.dx)
            const phaseShiftJ = Math.round((layout.originY - densest.originY) / densest.dy)
            assert(Math.abs(layout.originX - densest.originX - phaseShiftI * densest.dx) < 1e-7,
                `${scenario.name}: non-integral x phase for ${layout.stratum}`)
            assert(Math.abs(layout.originY - densest.originY - phaseShiftJ * densest.dy) < 1e-7,
                `${scenario.name}: non-integral y phase for ${layout.stratum}`)
        }
        return {
            ...layout,
            layoutIndex,
            ratio,
            phaseShiftI: ee.Number(layout.originX).subtract(densest.originX).divide(densest.dx).round().toInt(),
            phaseShiftJ: ee.Number(layout.originY).subtract(densest.originY).divide(densest.dy).round().toInt()
        }
    })
    return {densest, layouts}
}

const denseToClassIndices = ({denseI, denseJ, ratio, phaseShiftI, phaseShiftJ}) => {
    const r = ee.Image(ratio).toInt()
    const shiftI = ee.Image(phaseShiftI).toInt()
    const shiftJ = ee.Image(phaseShiftJ).toInt()
    const jNumerator = denseJ.subtract(shiftJ)
    const classJ = jNumerator.divide(r).toInt()
    const denseParity = denseJ.mod(2).add(2).mod(2)
    const classParity = classJ.mod(2).add(2).mod(2)
    const correction = r.multiply(classParity).subtract(denseParity).divide(2).toInt()
    const iNumerator = denseI.subtract(shiftI).subtract(correction)
    return {
        classI: iNumerator.divide(r).toInt(),
        classJ,
        member: jNumerator.mod(r).eq(0).and(iNumerator.mod(r).eq(0))
    }
}

const paddedRegion = ({scenario, layout}) => scenario.region.buffer(
    Math.max(layout.dx, layout.dy) * 2,
    ee.ErrorMargin(Math.max(layout.dx, layout.dy), 'projected'),
    scenario.arrangementProjection
)

const vectorizeBranch = ({scenario, plan, parity, acceptedOnly}) => {
    const transform = latticeTransform({layout: plan.densest, parity})
    const branchProjection = ee.Projection(ARRANGEMENT_CRS, transform)
    const coordinates = ee.Image.pixelCoordinates(branchProjection)
    const denseI = coordinates.select('x').floor().toInt()
    const row = coordinates.select('y').floor().toInt()
    const denseJ = parity === 0 ? row.multiply(-2).toInt() : row.multiply(-2).add(1).toInt()
    const denseResidue = denseJ.mod(32).add(32).mod(32).multiply(16)
        .add(denseI.mod(16).add(16).mod(16)).toInt()

    let image
    if (acceptedOnly) {
        const strata = plan.layouts.map(({stratum}) => stratum)
        assert(!MASKED_SINGLE_BAND || scenario.maskedStratification,
            `Scenario ${scenario.name} has no masked single band to test`)
        const classImage = MASKED_SINGLE_BAND
            ? scenario.maskedStratification
            : scenario.lookupImage.select('observedClass')
        const layoutIndex = classImage
            .remap(strata, plan.layouts.map(({layoutIndex}) => layoutIndex), -1).toInt()
        const ratio = layoutIndex.remap(
            plan.layouts.map(({layoutIndex}) => layoutIndex),
            plan.layouts.map(({ratio}) => ratio),
            1
        ).toInt()
        const phaseShiftI = layoutIndex.remap(
            plan.layouts.map(({layoutIndex}) => layoutIndex),
            plan.layouts.map(({phaseShiftI}) => phaseShiftI),
            0
        ).toInt()
        const phaseShiftJ = layoutIndex.remap(
            plan.layouts.map(({layoutIndex}) => layoutIndex),
            plan.layouts.map(({phaseShiftJ}) => phaseShiftJ),
            0
        ).toInt()
        const indices = denseToClassIndices({denseI, denseJ, ratio, phaseShiftI, phaseShiftJ})
        // With a masked single band the validity mask rides on the image itself, so remap yields a masked
        // pixel where the source is masked and no explicit mask term is needed.
        const accepted = MASKED_SINGLE_BAND
            ? layoutIndex.gte(0).and(indices.member)
            : scenario.lookupImage.select('observedMask').eq(1).and(layoutIndex.gte(0)).and(indices.member)
        const residue = indices.classJ.mod(32).add(32).mod(32).multiply(16)
            .add(indices.classI.mod(16).add(16).mod(16)).toInt()
        const label = layoutIndex.multiply(512).add(residue).add(1).toInt().rename('label')
        image = label
            .addBands(indices.classI.rename('i'))
            .addBands(indices.classJ.rename('j'))
            .updateMask(accepted)
    } else {
        image = denseResidue.add(1).rename('label')
            .addBands(denseI.rename('i'))
            .addBands(denseJ.rename('j'))
    }

    // Keep temporary centroids in default WGS84: native custom-WKT geometries can exceed EE's aggregation cache.
    const vectors = image.reduceToVectors({
        reducer: ee.Reducer.first().forEach(['i', 'j']),
        geometry: paddedRegion({scenario, layout: plan.densest}),
        crs: ARRANGEMENT_CRS,
        crsTransform: transform,
        geometryType: 'centroid',
        eightConnected: false,
        labelProperty: 'label',
        maxPixels: 1e13,
        bestEffort: false
    })
    const byLayoutIndex = ee.Dictionary.fromLists(
        plan.layouts.map(({layoutIndex}) => String(layoutIndex)),
        plan.layouts.map(layout => ee.Dictionary(layout))
    )
    return vectors.map(feature => {
        const i = feature.getNumber('i').toInt()
        const j = feature.getNumber('j').toInt()
        const compact = feature.getNumber('label').subtract(1)
        const layoutIndex = compact.divide(512).floor().toInt()
        const residue = compact.mod(512).toInt()
        const layout = acceptedOnly
            ? ee.Dictionary(byLayoutIndex.get(layoutIndex.format('%d')))
            : ee.Dictionary(plan.densest)
        const stratum = acceptedOnly ? layout.getNumber('stratum').toInt() : null
        const point = exactPoint({
            projection: scenario.arrangementProjection,
            i,
            j,
            dx: layout.getNumber('dx'),
            dy: layout.getNumber('dy'),
            originX: layout.getNumber('originX'),
            originY: layout.getNumber('originY')
        })
        const centroid = feature.geometry().transform(scenario.arrangementProjection, ERROR_MARGIN).coordinates()
        const centroidDisplacement = ee.Number(centroid.get(0)).subtract(point.x).pow(2)
            .add(ee.Number(centroid.get(1)).subtract(point.y).pow(2)).sqrt()
        const base = feature.setGeometry(point.geometry).set({
            i,
            j,
            arrangementX: point.x,
            arrangementY: point.y,
            centroidDisplacement,
            parityBranch: parity
        })
        return acceptedOnly
            ? base.set({
                stratum,
                level: ee.List(NESTED_LEVELS).get(residue),
                observedClass: stratum,
                observedMask: 1,
                id: stratum.format('%d').cat(':').cat(i.format('%d')).cat(':').cat(j.format('%d'))
            })
            : base.set('rawKey', i.format('%d').cat(':').cat(j.format('%d')))
    }).filterBounds(scenario.region)
}

const rasterRawLattice = scenario => {
    const plan = densestPlan(scenario)
    return ee.FeatureCollection([
        vectorizeBranch({scenario, plan, parity: 0, acceptedOnly: false}),
        vectorizeBranch({scenario, plan, parity: 1, acceptedOnly: false})
    ]).flatten()
}

const rasterCandidates = scenario => {
    const plan = densestPlan(scenario)
    return ee.FeatureCollection([
        vectorizeBranch({scenario, plan, parity: 0, acceptedOnly: true}),
        vectorizeBranch({scenario, plan, parity: 1, acceptedOnly: true})
    ]).flatten().select(FINITE_CANDIDATE_PROPERTIES)
}

const explicitRawReference = scenario => {
    const plan = densestPlan(scenario)
    return ee.FeatureCollection(ee.List.sequence(
        -FINITE_REFERENCE_INDEX_LIMIT,
        FINITE_REFERENCE_INDEX_LIMIT
    ).map(j => ee.List.sequence(-FINITE_REFERENCE_INDEX_LIMIT, FINITE_REFERENCE_INDEX_LIMIT).map(i => {
            const point = exactPoint({
                projection: scenario.arrangementProjection,
                i,
                j,
                ...plan.densest
            })
            return ee.Feature(point.geometry, {
                i,
                j,
                rawKey: ee.Number(i).format('%d').cat(':').cat(ee.Number(j).format('%d')),
                arrangementX: point.x,
                arrangementY: point.y
            })
        })
    ).flatten()).filterBounds(scenario.region)
}

const explicitCandidateReference = scenario => {
    const raw = ee.FeatureCollection(scenario.layouts.map(layout =>
        ee.FeatureCollection(ee.List.sequence(
            -FINITE_REFERENCE_INDEX_LIMIT,
            FINITE_REFERENCE_INDEX_LIMIT
        ).map(j => ee.List.sequence(-FINITE_REFERENCE_INDEX_LIMIT, FINITE_REFERENCE_INDEX_LIMIT).map(i => {
                const point = exactPoint({
                    projection: scenario.arrangementProjection,
                    i,
                    j,
                    ...layout
                })
                const sourceCoordinates = point.geometry.transform(
                    scenario.sourceProjection,
                    ee.ErrorMargin(ERROR_MARGIN, 'projected')
                ).coordinates()
                return ee.Feature(point.geometry, {
                    id: ee.Number(layout.stratum).format('%d')
                        .cat(':').cat(ee.Number(i).format('%d')).cat(':').cat(ee.Number(j).format('%d')),
                    stratum: layout.stratum,
                    i,
                    j,
                    level: ee.List(NESTED_LEVELS).get(
                        ee.Number(j).mod(32).add(32).mod(32).multiply(16)
                            .add(ee.Number(i).mod(16).add(16).mod(16)).toInt()
                    ),
                    arrangementX: point.x,
                    arrangementY: point.y,
                    sourceU: sourceCoordinates.get(0),
                    sourceV: sourceCoordinates.get(1)
                })
            })
        ).flatten())
    )).flatten().filterBounds(scenario.region)
    return scenario.lookupImage.reduceRegions({
        collection: raw,
        reducer: ee.Reducer.first().forEach(['observedClass', 'observedMask']),
        crs: scenario.sourceProjection,
        maxPixelsPerRegion: 1,
        tileScale: 4
    })
        .filter(ee.Filter.eq('observedMask', 1))
        .filter(ee.Filter.equals({leftField: 'stratum', rightField: 'observedClass'}))
}

const record = feature => ee.Dictionary({
    id: feature.get('id'),
    rawKey: feature.get('rawKey'),
    stratum: feature.get('stratum'),
    i: feature.get('i'),
    j: feature.get('j'),
    level: feature.get('level'),
    arrangementX: feature.get('arrangementX'),
    arrangementY: feature.get('arrangementY'),
    observedClass: feature.get('observedClass'),
    observedMask: feature.get('observedMask'),
    centroidDisplacement: feature.get('centroidDisplacement'),
    parityBranch: feature.get('parityBranch'),
    sourceU: feature.get('sourceU'),
    sourceV: feature.get('sourceV')
})

const finiteComparison = scenario => {
    const rawReference = explicitRawReference(scenario)
    const rawRaster = rasterRawLattice(scenario)
    const reference = explicitCandidateReference(scenario)
    const candidates = rasterCandidates(scenario)
    return ee.Dictionary({
        name: scenario.name,
        rawReference: rawReference.map(feature => ee.Feature(null, {record: record(feature)}))
            .aggregate_array('record'),
        rawRaster: rawRaster.map(feature => ee.Feature(null, {record: record(feature)}))
            .aggregate_array('record'),
        reference: reference.map(feature => ee.Feature(null, {record: record(feature)}))
            .aggregate_array('record'),
        candidates: candidates.map(feature => ee.Feature(null, {record: record(feature)}))
            .aggregate_array('record'),
        referenceByStratum: reference.aggregate_histogram('stratum'),
        candidateByStratum: candidates.aggregate_histogram('stratum'),
        sourceBoundaryCandidates: reference.map(feature => {
            const u = feature.getNumber('sourceU')
            const v = feature.getNumber('sourceV')
            return feature.set({
                boundaryDistance: u.subtract(u.round()).abs().min(v.subtract(v.round()).abs()),
                cornerDistance: u.subtract(u.round()).abs().max(v.subtract(v.round()).abs())
            })
        }).filter(ee.Filter.lt('boundaryDistance', 1e-8)).size(),
        sourceCornerCandidates: reference.map(feature => {
            const u = feature.getNumber('sourceU')
            const v = feature.getNumber('sourceV')
            return feature.set('cornerDistance', u.subtract(u.round()).abs().max(v.subtract(v.round()).abs()))
        }).filter(ee.Filter.lt('cornerDistance', 1e-8)).size(),
        isolatedClassCandidates: scenario.isolatedClass
            ? reference.filter(ee.Filter.eq('stratum', 3)).size()
            : 0,
        requiresCorner: Boolean(scenario.requireCorner)
    })
}

const summarizeFinite = result => {
    const rawReference = new Map(result.rawReference.map(row => [row.rawKey, row]))
    const rawRasterRows = result.rawRaster
    const rawRaster = new Map(rawRasterRows.map(row => [row.rawKey, row]))
    const reference = new Map(result.reference.map(row => [row.id, row]))
    const candidateRows = result.candidates
    const candidates = new Map(candidateRows.map(row => [row.id, row]))
    const missingRaw = [...rawReference.keys()].filter(key => !rawRaster.has(key))
    const extraRaw = [...rawRaster.keys()].filter(key => !rawReference.has(key))
    const rawGeometryMismatches = [...rawReference].filter(([key, expected]) => {
        const actual = rawRaster.get(key)
        return actual && (Math.abs(Number(expected.arrangementX) - Number(actual.arrangementX)) > 0.001
            || Math.abs(Number(expected.arrangementY) - Number(actual.arrangementY)) > 0.001)
    })
    const missing = [...reference.keys()].filter(key => !candidates.has(key))
    const extra = [...candidates.keys()].filter(key => !reference.has(key))
    const matched = [...reference].filter(([key]) => candidates.has(key))
    const indexPropertyMismatches = matched.filter(([key, expected]) => {
        const actual = candidates.get(key)
        return Number(actual.stratum) !== Number(expected.stratum)
            || Number(actual.i) !== Number(expected.i)
            || Number(actual.j) !== Number(expected.j)
    })
    const levelMismatches = matched.filter(([key, expected]) =>
        Number(candidates.get(key).level) !== Number(expected.level)
    )
    const classMismatches = matched.filter(([key, expected]) =>
        Number(candidates.get(key).observedClass) !== Number(expected.observedClass)
    )
    const maskMismatches = matched.filter(([key, expected]) =>
        Number(candidates.get(key).observedMask) !== Number(expected.observedMask)
    )
    const reconstructedGeometryMismatches = matched.filter(([key, expected]) => {
        const actual = candidates.get(key)
        return Math.abs(Number(actual.arrangementX) - Number(expected.arrangementX)) > 0.001
            || Math.abs(Number(actual.arrangementY) - Number(expected.arrangementY)) > 0.001
    })
    const maxCentroidDisplacement = Math.max(0, ...rawRasterRows.concat(candidateRows)
        .map(({centroidDisplacement}) => Number(centroidDisplacement || 0)))
    const summary = {
        name: result.name,
        rawReference: rawReference.size,
        rawRasterRows: rawRasterRows.length,
        rawDistinct: rawRaster.size,
        rawDuplicates: rawRasterRows.length - rawRaster.size,
        missingRaw: missingRaw.length,
        extraRaw: extraRaw.length,
        rawGeometryMismatches: rawGeometryMismatches.length,
        referenceCandidates: reference.size,
        candidateRows: candidateRows.length,
        distinctCandidateKeys: candidates.size,
        duplicateCandidateKeys: candidateRows.length - candidates.size,
        missing: missing.length,
        extra: extra.length,
        indexPropertyMismatches: indexPropertyMismatches.length,
        levelMismatches: levelMismatches.length,
        classMismatches: classMismatches.length,
        maskMismatches: maskMismatches.length,
        reconstructedGeometryMismatches: reconstructedGeometryMismatches.length,
        referenceByStratum: result.referenceByStratum,
        candidateByStratum: result.candidateByStratum,
        sourceBoundaryCandidates: Number(result.sourceBoundaryCandidates),
        sourceCornerCandidates: Number(result.sourceCornerCandidates),
        requiresCorner: Boolean(result.requiresCorner),
        isolatedClassCandidates: Number(result.isolatedClassCandidates),
        maxVectorCentroidDisplacementMetres: maxCentroidDisplacement,
        examples: {
            missingRaw: missingRaw.slice(0, 5),
            extraRaw: extraRaw.slice(0, 5),
            missing: missing.slice(0, 5),
            extra: extra.slice(0, 5),
            indexPropertyMismatches: indexPropertyMismatches.slice(0, 5).map(([key]) => key),
            levelMismatches: levelMismatches.slice(0, 5).map(([key, expected]) => ({
                key,
                expected: expected.level,
                actual: candidates.get(key).level
            })),
            classMismatches: classMismatches.slice(0, 5).map(([key]) => key),
            maskMismatches: maskMismatches.slice(0, 5).map(([key]) => key),
            reconstructedGeometryMismatches: reconstructedGeometryMismatches.slice(0, 5).map(([key]) => key)
        }
    }
    const failed = summary.rawDuplicates || summary.missingRaw || summary.extraRaw
        || summary.rawGeometryMismatches || summary.duplicateCandidateKeys
        || summary.missing || summary.extra || summary.indexPropertyMismatches
        || summary.levelMismatches || summary.classMismatches || summary.maskMismatches
        || summary.reconstructedGeometryMismatches
        || summary.requiresCorner && summary.sourceCornerCandidates < 1
        || result.name.includes('isolated') && !summary.isolatedClassCandidates
    if (failed) {
        throw new Error(`Exact-centred finite mismatch: ${JSON.stringify(summary)}`)
    }
    return summary
}

const compareCandidateRecords = ({expectedRows, actualRows}) => {
    const expected = new Map(expectedRows.map(row => [row.id, row]))
    const actual = new Map(actualRows.map(row => [row.id, row]))
    const missing = [...expected.keys()].filter(key => !actual.has(key))
    const extra = [...actual.keys()].filter(key => !expected.has(key))
    const duplicates = actualRows.length - actual.size
    const propertyMismatches = [...expected].filter(([key, expectedRow]) => {
        const actualRow = actual.get(key)
        return actualRow && (Number(actualRow.stratum) !== Number(expectedRow.stratum)
            || Number(actualRow.i) !== Number(expectedRow.i)
            || Number(actualRow.j) !== Number(expectedRow.j)
            || Number(actualRow.level) !== Number(expectedRow.level)
            || Number(actualRow.observedClass) !== Number(expectedRow.observedClass)
            || Number(actualRow.observedMask) !== Number(expectedRow.observedMask)
            || Math.abs(Number(actualRow.arrangementX) - Number(expectedRow.arrangementX)) > 0.001
            || Math.abs(Number(actualRow.arrangementY) - Number(expectedRow.arrangementY)) > 0.001)
    }).map(([key]) => key)
    return {
        expected: expected.size,
        actualRows: actualRows.length,
        actualDistinct: actual.size,
        missing: missing.length,
        extra: extra.length,
        duplicates,
        propertyMismatches: propertyMismatches.length,
        examples: {
            missing: missing.slice(0, 5),
            extra: extra.slice(0, 5),
            propertyMismatches: propertyMismatches.slice(0, 5)
        }
    }
}

const configuredGridWitness = () => {
    const forcedScenario = buildConfiguredGridScenario('forced-configured')
    const defaultScenario = buildConfiguredGridScenario('default-configured')
    const nativeScenario = buildConfiguredGridScenario('direct-native')
    const reference = explicitCandidateReference(forcedScenario)
    const rows = collection => collection.map(feature =>
        ee.Feature(null, {record: record(feature)})
    ).aggregate_array('record')
    return ee.Dictionary({
        reference: rows(reference),
        forcedConfigured: rows(rasterCandidates(forcedScenario)),
        defaultConfigured: rows(rasterCandidates(defaultScenario)),
        directNative: rows(rasterCandidates(nativeScenario)),
        nativeProjection: ee.Dictionary({
            crs: forcedScenario.nativeProjection.crs(),
            transform: forcedScenario.nativeProjection.transform()
        }),
        configuredProjection: ee.Dictionary({
            crs: forcedScenario.configuredProjection.crs(),
            transform: forcedScenario.configuredProjection.transform()
        })
    })
}

const summarizeConfiguredGridWitness = result => {
    const forced = compareCandidateRecords({
        expectedRows: result.reference,
        actualRows: result.forcedConfigured
    })
    const withDefault = compareCandidateRecords({
        expectedRows: result.reference,
        actualRows: result.defaultConfigured
    })
    const directNative = compareCandidateRecords({
        expectedRows: result.reference,
        actualRows: result.directNative
    })
    const exact = summary => !summary.missing && !summary.extra
        && !summary.duplicates && !summary.propertyMismatches
    assert(exact(forced), `Forced configured-grid candidate mismatch: ${JSON.stringify(forced)}`)
    assert(!exact(directNative),
        `Configured-grid fixture does not discriminate against direct-native evaluation: ${JSON.stringify(directNative)}`)
    return {
        status: 'PASS',
        nativeProjection: result.nativeProjection,
        configuredProjection: result.configuredProjection,
        forcedConfigured: forced,
        setDefaultProjection: withDefault,
        directNative,
        setDefaultPreservedConfiguredSemantics: exact(withDefault),
        requiresReproject: !exact(withDefault)
    }
}

const floorDiv = (value, divisor) => {
    const quotient = value / divisor
    return value % divisor < 0n ? quotient - 1n : quotient
}

const exactModuloNumerator = ({rootNumerator, denominator, period}) => {
    const scaledPeriod = denominator * BigInt(period)
    return rootNumerator - floorDiv(rootNumerator, scaledPeriod) * scaledPeriod
}

const parityValue = value => Number(((BigInt(value) % 2n) + 2n) % 2n)

const nestingPhaseShift = ({phase, ratio}) => {
    const xDense = exactModuloNumerator({...phase.x, period: 16})
    const yDense = exactModuloNumerator({...phase.y, period: 32})
    const xCoarse = exactModuloNumerator({...phase.x, period: 16 * ratio})
    const yCoarse = exactModuloNumerator({...phase.y, period: 32 * ratio})
    return {
        a: (xCoarse - xDense) / phase.x.denominator,
        b: (yCoarse - yDense) / phase.y.denominator
    }
}

const coarseToDenseValue = ({coarseI, coarseJ, ratio, a, b}) => {
    const r = BigInt(ratio)
    const denseJ = b + r * BigInt(coarseJ)
    return {
        denseI: a + r * BigInt(coarseI)
            + (r * BigInt(parityValue(coarseJ)) - BigInt(parityValue(denseJ))) / 2n,
        denseJ
    }
}

const denseToCoarseValue = ({denseI, denseJ, ratio, a, b}) => {
    const r = BigInt(ratio)
    const jNumerator = BigInt(denseJ) - b
    if (jNumerator % r !== 0n) {
        return null
    }
    const coarseJ = jNumerator / r
    const correctionNumerator = r * BigInt(parityValue(coarseJ)) - BigInt(parityValue(denseJ))
    if (correctionNumerator % 2n !== 0n) {
        return null
    }
    const iNumerator = BigInt(denseI) - a - correctionNumerator / 2n
    return iNumerator % r === 0n ? {coarseI: iNumerator / r, coarseJ} : null
}

const pureNestingProof = () => {
    const rational = (numerator, denominator) => ({
        rootNumerator: BigInt(numerator),
        denominator: BigInt(denominator)
    })
    const phases = [
        {name: 'fixed', x: rational(0, 1), y: rational(0, 1)},
        {name: 'seeded-a', x: rational(123456789, 10000), y: rational(987654321, 100000)},
        {name: 'seeded-b', x: rational(16777213, 97), y: rational(33554429, 193)}
    ]
    const families = [
        {name: 'finite', ratios: [1, 2, 4]},
        {name: 'sudan', ratios: [1, 8, 16, 32, 64]},
        {name: 'repair', ratios: [1, 2, 16, 32, 64, 128]}
    ]
    let compared = 0
    for (const phase of phases) {
        for (const family of families) {
            for (const ratio of family.ratios) {
                const shifts = nestingPhaseShift({phase, ratio})
                assert(shifts.a % 16n === 0n && shifts.b % 32n === 0n,
                    `${family.name}/${phase.name}/${ratio}: phase is not nesting-aligned`)
                for (let coarseJ = -8; coarseJ <= 8; coarseJ++) {
                    for (let coarseI = -8; coarseI <= 8; coarseI++) {
                        const dense = coarseToDenseValue({...shifts, ratio, coarseI, coarseJ})
                        const inverse = denseToCoarseValue({...shifts, ratio, ...dense})
                        assert(inverse && inverse.coarseI === BigInt(coarseI)
                            && inverse.coarseJ === BigInt(coarseJ),
                        `${family.name}/${phase.name}/${ratio}: inverse mapping failed`)
                        assert(nestedLevel(coarseI, coarseJ)
                            === nestedLevel(Number(inverse.coarseI), Number(inverse.coarseJ)),
                        `${family.name}/${phase.name}/${ratio}: level mismatch`)
                        compared += 1
                    }
                }
            }
        }
    }
    return {
        status: 'PASS',
        phases: phases.length,
        families: families.length,
        ratioCases: families.reduce((total, family) => total + family.ratios.length, 0) * phases.length,
        comparedPoints: compared,
        mapping: {
            denseJ: 'phaseShiftJ + ratio * classJ',
            denseI: 'phaseShiftI + ratio * classI + (ratio*parity(classJ)-parity(denseJ))/2'
        }
    }
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
        reduceToVectors: count(/Image\.reduceToVectors/g),
        reduceRegions: count(/Image\.reduceRegions/g),
        sampleRegions: count(/Image\.sampleRegions/g),
        displace: count(/Image\.displace/g),
        focalMax: count(/Image\.focalMax/g),
        reduceResolution: count(/Image\.reduceResolution/g),
        resample: count(/Image\.resample/g),
        reduceRegion: count(/"Image\.reduceRegion"/g),
        reproject: count(/Image\.reproject/g),
        forbiddenFunctions: [...new Set(functionNames.filter(name =>
            /reduceRegions|sampleRegions|displace|focalMax|reduceResolution|resample/i.test(name)
        ))],
        functionNames: [...new Set(functionNames)].sort()
    }
}

const assertCandidateGraph = (graph, expectedReproject = 1) => {
    const expected = {
        reduceToVectors: 2,
        reduceRegions: 0,
        sampleRegions: 0,
        displace: 0,
        focalMax: 0,
        reduceResolution: 0,
        resample: 0,
        reduceRegion: 0,
        reproject: expectedReproject
    }
    const mismatches = Object.entries(expected)
        .filter(([property, value]) => graph[property] !== value)
        .map(([property, expectedValue]) => ({property, expected: expectedValue, actual: graph[property]}))
    if (mismatches.length || graph.forbiddenFunctions.length) {
        throw new Error(`Candidate graph contract failed: ${JSON.stringify({mismatches, graph})}`)
    }
}

const finalSelection = () => stratifiedSystematicFinalSamples({
    candidates: ee.FeatureCollection(SUDAN_CANDIDATE_ASSET),
    allocation: SUDAN_ALLOCATION,
    strategy: 'CLOSEST',
    seed: 2,
    levelsByStratum: FINAL_LEVELS_BY_STRATUM
})

const finalSelectionGraph = samples => {
    const graph = graphCharacteristics(samples)
    const serialized = serializedExpression(samples)
    const imageFunctions = graph.functionNames.filter(name => name.startsWith('Image.'))
    const expectedZero = [
        'reduceToVectors', 'reproject', 'reduceRegion', 'reduceRegions', 'sampleRegions',
        'displace', 'focalMax', 'reduceResolution', 'resample'
    ]
    const nonZero = expectedZero.filter(property => graph[property] !== 0)
    const containsRasterSource = serialized.includes(SUDAN_SOURCE_ASSET)
    if (nonZero.length || imageFunctions.length || containsRasterSource) {
        throw new Error(`Final-selection graph is not asset-only: ${JSON.stringify({
            nonZero,
            imageFunctions,
            containsRasterSource,
            graph
        })}`)
    }
    return {...graph, imageFunctions, containsRasterSource}
}

const validateSelectedCounts = async samples => {
    const result = await evaluate(ee.Dictionary({
        total: samples.size(),
        perStratum: samples.aggregate_histogram('stratum')
    }))
    const mismatches = Object.entries(FINAL_COUNTS_BY_STRATUM)
        .filter(([stratum, expected]) => Number(result.perStratum?.[stratum] || 0) !== expected)
        .map(([stratum, expected]) => ({
            stratum: Number(stratum),
            expected,
            actual: Number(result.perStratum?.[stratum] || 0)
        }))
    const unexpectedStrata = Object.keys(result.perStratum || {})
        .filter(stratum => !Object.hasOwn(FINAL_COUNTS_BY_STRATUM, stratum))
    if (Number(result.total) !== FINAL_TOTAL || mismatches.length || unexpectedStrata.length) {
        throw new Error(`Final-selection count gate failed before export: ${JSON.stringify({
            expectedTotal: FINAL_TOTAL,
            result,
            mismatches,
            unexpectedStrata
        })}`)
    }
    return {
        total: Number(result.total),
        perStratum: result.perStratum,
        mismatches,
        unexpectedStrata
    }
}

const affineCentreDiagnostic = () => {
    const layout = {
        dx: 32 * SQRT3,
        dy: 48,
        originX: 0,
        originY: 0
    }
    const projection = ee.Projection(ARRANGEMENT_CRS)
    const region = ee.Geometry.Rectangle([-120, -120, 120, 120], projection, false, true)
    return ee.FeatureCollection([0, 1].map(branchParity => {
        const transform = latticeTransform({layout, parity: branchParity})
        const branchProjection = ee.Projection(ARRANGEMENT_CRS, transform)
        const coordinates = ee.Image.pixelCoordinates(branchProjection)
        const i = coordinates.select('x').floor().toInt()
        const row = coordinates.select('y').floor().toInt()
        const j = branchParity === 0 ? row.multiply(-2).toInt() : row.multiply(-2).add(1).toInt()
        const label = j.mod(32).add(32).mod(32).multiply(16)
            .add(i.mod(16).add(16).mod(16)).add(1).toInt().rename('label')
        return label.addBands(i.rename('i')).addBands(j.rename('j')).reduceToVectors({
            reducer: ee.Reducer.first().forEach(['i', 'j']),
            geometry: region,
            crs: ARRANGEMENT_CRS,
            crsTransform: transform,
            geometryType: 'centroid',
            geometryInNativeProjection: false,
            eightConnected: false,
            labelProperty: 'label',
            maxPixels: 1e6,
            bestEffort: false
        }).map(feature => {
            const iValue = feature.getNumber('i').toInt()
            const jValue = feature.getNumber('j').toInt()
            const expected = exactPoint({
                projection,
                i: iValue,
                j: jValue,
                ...layout
            })
            const actual = feature.geometry().transform(projection, ERROR_MARGIN).coordinates()
            const actualX = ee.Number(actual.get(0))
            const actualY = ee.Number(actual.get(1))
            return ee.Feature(null, {record: ee.Dictionary({
                branchParity,
                i: iValue,
                j: jValue,
                expectedX: expected.x,
                expectedY: expected.y,
                actualX,
                actualY,
                dx: actualX.subtract(expected.x),
                dy: actualY.subtract(expected.y)
            })})
        })
    })).flatten().sort('j').limit(20).aggregate_array('record')
}

const sudanLayoutValues = ({area, sampleSize}) => {
    const targetDiameter = Math.sqrt(area / sampleSize / (1.5 * SQRT3)) * BASE_GRID_SLACK
    const targetExponent = Math.floor(Math.log(targetDiameter) / Math.LN2)
    const minimumDiameter = Math.max(SUDAN_MINIMUM_DISTANCE, SUDAN_STRATIFICATION_SCALE * 2) / SQRT3
    const minimumExponent = Math.ceil(Math.log(minimumDiameter) / Math.LN2)
    const exponent = Math.max(targetExponent, minimumExponent)
    const diameter = Math.pow(2, exponent)
    return {exponent, diameter, dx: diameter * SQRT3, dy: diameter * 1.5}
}

const buildSudanScenario = () => {
    const arrangementProjection = ee.Projection(ARRANGEMENT_CRS)
    const sourceProjection = ee.Projection(SUDAN_STRATIFICATION_CRS).atScale(SUDAN_STRATIFICATION_SCALE)
    const region = ee.FeatureCollection(SUDAN_AOI_ASSET)
        .filter(ee.Filter.eq('id', SUDAN_AOI_KEY))
        .geometry(ee.ErrorMargin(1, 'meters'))
    const source = ee.Image(SUDAN_SOURCE_ASSET).select(SUDAN_SOURCE_BAND)
    const sourceMask = source.mask().unmask(0).gt(0).toInt()
    const nativeLookupImage = source.unmask(SENTINEL).toInt().rename('observedClass')
        .addBands(sourceMask.rename('observedMask'))
        .setDefaultProjection(sourceProjection)
    const lookupImage = onConfiguredGrid({image: nativeLookupImage, projection: sourceProjection})
    const maskedStratification = source.toInt().updateMask(sourceMask).rename('stratum')
        .reproject(sourceProjection)
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
        const values = sudanLayoutValues(allocation)
        return {
            ...allocation,
            ...values,
            originX: rootOrigin.x.mod(values.dx * 16),
            originY: rootOrigin.y.mod(values.dy * 32)
        }
    })
    return {
        name: 'sudan-exact-centred-graph-only',
        arrangementProjection,
        sourceProjection,
        region,
        lookupImage,
        maskedStratification,
        layouts
    }
}

const sudanGraphOnly = () => {
    const scenario = buildSudanScenario()
    const plan = densestPlan(scenario)
    const candidates = rasterCandidates(scenario)
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    const area = SUDAN_ALLOCATION.reduce((total, row) => total + row.area, 0)
    return {
        graph,
        densest: {
            diameter: plan.densest.diameter,
            dx: plan.densest.dx,
            dy: plan.densest.dy,
            estimatedLatticePixels: area / (plan.densest.dx * plan.densest.dy)
        },
        layouts: plan.layouts.map(layout => ({
            stratum: layout.stratum,
            diameter: layout.diameter,
            ratio: layout.ratio,
            requested: layout.sampleSize,
            classSpecificLatticeEstimate: layout.area / (layout.dx * layout.dy)
        })),
        classSpecificLatticeEstimate: plan.layouts.reduce((total, layout) =>
            total + layout.area / (layout.dx * layout.dy), 0),
        exportsStarted: 0
    }
}

const isNotFound = error => /not found|does not exist|404/i.test(String(error))

const verifyPreviousState = async () => {
    const statuses = await callbackPromise(callback =>
        ee.data.getTaskStatus(PREVIOUS_TASK_ID, (result, error) => callback(result, error))
    )
    const status = statuses[0]
    assert(status && !['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(status.state),
        `Previous task is not terminal: ${JSON.stringify(status)}`)
    let failedTargetAbsent = false
    try {
        await callbackPromise(callback =>
            ee.data.getAsset(PREVIOUS_FAILED_ASSET, (asset, error) => callback(asset, error))
        )
    } catch (error) {
        if (!isNotFound(error)) {
            throw error
        }
        failedTargetAbsent = true
    }
    const evidence = []
    for (const assetId of RETAINED_EVIDENCE_ASSETS) {
        const asset = await callbackPromise(callback =>
            ee.data.getAsset(assetId, (result, error) => callback(result, error))
        )
        evidence.push({assetId, type: asset.type})
    }
    assert(failedTargetAbsent, `Previous failed target unexpectedly exists: ${PREVIOUS_FAILED_ASSET}`)
    return {
        task: {id: PREVIOUS_TASK_ID, state: status.state, error: status.error_message || null},
        failedTarget: {assetId: PREVIOUS_FAILED_ASSET, absent: true},
        retainedEvidence: evidence
    }
}

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

const activeExactCentredTasks = async () => {
    const tasks = await callbackPromise(callback =>
        ee.data.getTaskList((result, error) => callback(result, error))
    )
    const rows = Array.isArray(tasks) ? tasks : tasks?.tasks
    if (!Array.isArray(rows)) {
        throw new Error(`Unexpected task-list response: ${JSON.stringify(Object.keys(tasks || {}))}`)
    }
    return rows
        .filter(task => /^sd-systematic-exact-centred-(sudan|final)-/.test(task.description || ''))
        .filter(task => ['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(task.state))
        .map(task => ({
            id: task.id,
            description: task.description,
            state: task.state,
            eecu: Number(task.batch_eecu_usage_seconds || 0)
        }))
}

const waitForSudanTask = async (taskId, {
    checkpoint = 'SUDAN_EXPORT_TASK',
    cancellationCheckpoint = 'SUDAN_EXPORT_CANCEL_REQUESTED'
} = {}) => {
    const history = []
    let cancellation = null
    for (;;) {
        const statuses = await callbackPromise(callback =>
            ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
        )
        const status = statuses[0]
        const timestamp = Date.now()
        const runningMilliseconds = Number(status.start_timestamp_ms)
            ? timestamp - Number(status.start_timestamp_ms)
            : 0
        const entry = {
            timestamp,
            state: status.state,
            runningSeconds: runningMilliseconds / 1000,
            eecu: Number(status.batch_eecu_usage_seconds || 0)
        }
        history.push(entry)
        console.log(JSON.stringify({checkpoint, taskId, ...entry}))
        if (!['READY', 'RUNNING', 'CANCEL_REQUESTED'].includes(status.state)) {
            return {status, history, cancellation}
        }
        if (!cancellation && status.state === 'RUNNING') {
            const reason = entry.eecu >= SUDAN_MAX_BATCH_EECU_SECONDS
                ? `batch EECU reached ${entry.eecu} seconds`
                : runningMilliseconds >= SUDAN_MAX_RUNNING_MS
                    ? `RUNNING duration reached ${runningMilliseconds / 60000} minutes`
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
    throw new Error(`Asset not visible in the established retry window: ${assetId}`)
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
    const reference = explicitCandidateReference(scenario)
    const candidates = ee.FeatureCollection(assetId)
    const layouts = ee.Dictionary.fromLists(
        scenario.layouts.map(({stratum}) => String(stratum)),
        scenario.layouts.map(layout => ee.Dictionary(layout))
    )
    const checkedCandidates = candidates.map(feature => {
        const stratum = feature.getNumber('stratum').toInt()
        const i = feature.getNumber('i').toInt()
        const j = feature.getNumber('j').toInt()
        const layout = ee.Dictionary(layouts.get(stratum.format('%d')))
        const expected = exactPoint({
            projection: scenario.arrangementProjection,
            i,
            j,
            dx: layout.getNumber('dx'),
            dy: layout.getNumber('dy'),
            originX: layout.getNumber('originX'),
            originY: layout.getNumber('originY')
        })
        const coordinates = feature.geometry().transform(
            scenario.arrangementProjection,
            ee.ErrorMargin(ERROR_MARGIN, 'projected')
        ).coordinates()
        const displacement = ee.Number(coordinates.get(0)).subtract(expected.x).pow(2)
            .add(ee.Number(coordinates.get(1)).subtract(expected.y).pow(2))
            .sqrt()
        return feature.set({
            id: stratum.format('%d').cat(':').cat(i.format('%d')).cat(':').cat(j.format('%d')),
            arrangementX: expected.x,
            arrangementY: expected.y,
            observedClass: stratum,
            observedMask: 1,
            assetGeometryDisplacement: displacement
        })
    })
    const result = await evaluate(ee.Dictionary({
        reference: reference.map(feature => ee.Feature(null, {record: record(feature)})).aggregate_array('record'),
        candidates: checkedCandidates.map(feature => ee.Feature(null, {record: record(feature)}))
            .aggregate_array('record'),
        size: candidates.size(),
        byStratum: candidates.aggregate_histogram('stratum'),
        properties: ee.Feature(candidates.first()).propertyNames(),
        geometryTypes: candidates.map(feature => ee.Feature(null, {
            geometryType: feature.geometry().type()
        })).aggregate_histogram('geometryType'),
        maximumGeometryDisplacementMetres: checkedCandidates.aggregate_max('assetGeometryDisplacement'),
        geometryDisplacementViolations: checkedCandidates
            .filter(ee.Filter.gt('assetGeometryDisplacement', 0.5)).size(),
        classMembershipViolations: checkedCandidates
            .filter(ee.Filter.equals({leftField: 'stratum', rightField: 'observedClass'}).not()).size(),
        maskMembershipViolations: checkedCandidates.filter(ee.Filter.neq('observedMask', 1)).size()
    }))
    const summary = summarizeFinite({
        name: `${scenario.name}-ready-asset`,
        rawReference: [],
        rawRaster: [],
        reference: result.reference,
        candidates: result.candidates,
        referenceByStratum: {},
        candidateByStratum: {},
        sourceBoundaryCandidates: 0,
        sourceCornerCandidates: 0,
        isolatedClassCandidates: 0
    })
    const userProperties = result.properties.filter(property => !property.startsWith('system:')).sort()
    const expectedProperties = [...EXPORT_PROPERTIES].sort()
    const missingProperties = expectedProperties.filter(property => !userProperties.includes(property))
    const unexpectedProperties = userProperties.filter(property => !expectedProperties.includes(property))
    const diagnosticProperties = [
        'id', 'arrangementX', 'arrangementY', 'observedClass', 'observedMask',
        'assetGeometryDisplacement', 'centroidDisplacement', 'parityBranch', 'label', 'rawKey', 'source'
    ].filter(property => userProperties.includes(property))
    const pointRows = Number(result.geometryTypes?.Point || 0)
    const failures = {
        size: Number(result.size) !== summary.referenceCandidates,
        geometryType: pointRows !== Number(result.size)
            || Object.keys(result.geometryTypes || {}).some(type => type !== 'Point'),
        geometryDisplacement: Number(result.geometryDisplacementViolations) !== 0
            || Number(result.maximumGeometryDisplacementMetres) > 0.5,
        classMembership: Number(result.classMembershipViolations) !== 0,
        maskMembership: Number(result.maskMembershipViolations) !== 0,
        schema: Boolean(missingProperties.length || unexpectedProperties.length || diagnosticProperties.length)
    }
    const failed = Object.entries(failures).filter(([_name, value]) => value).map(([name]) => name)
    if (failed.length) {
        throw new Error(`Ready exact-centred asset validation failed: ${JSON.stringify({
            failed,
            result,
            summary,
            userProperties,
            expectedProperties,
            missingProperties,
            unexpectedProperties,
            diagnosticProperties
        })}`)
    }
    return {
        ...summary,
        size: Number(result.size),
        byStratum: result.byStratum,
        properties: result.properties,
        userProperties,
        expectedProperties,
        missingProperties,
        unexpectedProperties,
        diagnosticProperties,
        geometryTypes: result.geometryTypes,
        maximumGeometryDisplacementMetres: Number(result.maximumGeometryDisplacementMetres),
        geometryDisplacementViolations: Number(result.geometryDisplacementViolations),
        classMembershipViolations: Number(result.classMembershipViolations),
        maskMembershipViolations: Number(result.maskMembershipViolations)
    }
}

const validateSudanReadyAsset = async assetId => {
    const candidates = ee.FeatureCollection(assetId)
    const checked = candidates.map(feature => {
        const stratum = feature.getNumber('stratum').toInt()
        const i = feature.getNumber('i').toInt()
        const j = feature.getNumber('j').toInt()
        return feature.set('_structuralId', stratum.format('%d')
            .cat(':').cat(i.format('%d')).cat(':').cat(j.format('%d')))
    })
    const selection = selectSystematicLevels({
        samples: candidates,
        allocation: SUDAN_ALLOCATION,
        strategy: 'CLOSEST'
    })
    const result = await evaluate(ee.Dictionary({
        total: candidates.size(),
        perStratum: candidates.aggregate_histogram('stratum'),
        distinctIds: checked.aggregate_count_distinct('_structuralId'),
        rowsMissingRequiredProperties: candidates.size().subtract(
            candidates.filter(ee.Filter.notNull(EXPORT_PROPERTIES)).size()
        ),
        properties: ee.Feature(candidates.first()).propertyNames(),
        geometryTypes: candidates.map(feature => ee.Feature(null, {
            geometryType: feature.geometry().type()
        })).aggregate_histogram('geometryType'),
        selection: systematicSelectionSummary(selection)
    }))
    const total = Number(result.total)
    const distinctIds = Number(result.distinctIds)
    const duplicates = total - distinctIds
    const userProperties = result.properties.filter(property => !property.startsWith('system:')).sort()
    const expectedProperties = [...EXPORT_PROPERTIES].sort()
    const missingProperties = expectedProperties.filter(property => !userProperties.includes(property))
    const unexpectedProperties = userProperties.filter(property => !expectedProperties.includes(property))
    const pointRows = Number(result.geometryTypes?.Point || 0)
    const [strata, rawCounts, selectedCounts, selectedLevels] = result.selection
    const selected = strata.map((stratumValue, index) => {
        const stratum = Number(stratumValue)
        const requested = SUDAN_ALLOCATION.find(row => row.stratum === stratum).sampleSize
        const rawCount = Number(rawCounts[index])
        return {
            stratum,
            requested,
            rawCount,
            selectedLevel: Number(selectedLevels[index]),
            selectedCount: Number(selectedCounts[index]),
            requiresRepair: rawCount < requested
        }
    })
    const strataRequiringRepair = selected.filter(({requiresRepair}) => requiresRepair)
        .map(({stratum}) => stratum)
    const selectedTotal = selected.reduce((sum, row) => sum + row.selectedCount, 0)
    const failures = {
        empty: total === 0,
        duplicates: duplicates !== 0,
        requiredProperties: Number(result.rowsMissingRequiredProperties) !== 0,
        schema: Boolean(missingProperties.length || unexpectedProperties.length),
        geometry: pointRows !== total
            || Object.keys(result.geometryTypes || {}).some(type => type !== 'Point')
    }
    const failed = Object.entries(failures).filter(([_name, value]) => value).map(([name]) => name)
    if (failed.length) {
        throw new Error(`Sudan ready candidate validation failed; completed asset retained: ${JSON.stringify({
            assetId,
            failed,
            result,
            duplicates,
            userProperties,
            expectedProperties,
            missingProperties,
            unexpectedProperties
        })}`)
    }
    return {
        total,
        perStratum: result.perStratum,
        distinctIds,
        duplicates,
        rowsMissingRequiredProperties: Number(result.rowsMissingRequiredProperties),
        membershipFieldsPersisted: false,
        properties: result.properties,
        userProperties,
        expectedProperties,
        missingProperties,
        unexpectedProperties,
        geometryTypes: result.geometryTypes,
        selection: selected,
        selectedTotal,
        strataRequiringRepair,
        nextGate: strataRequiringRepair.length ? 'repair' : 'final-selection'
    }
}

const validateFinalReadyAsset = async assetId => {
    const samples = ee.FeatureCollection(assetId)
    const levels = ee.Dictionary(FINAL_LEVELS_BY_STRATUM)
    const checked = samples.map(feature => {
        const id = feature.getString('id')
        const stratum = feature.getNumber('stratum').toInt()
        const formatValid = id.match('^-?[0-9]+:-?[0-9]+:-?[0-9]+$').size().eq(1)
        const prefixValid = ee.String(id.split(':').get(0)).compareTo(stratum.format('%d')).eq(0)
        const expectedLevel = levels.getNumber(stratum.format('%d'))
        return feature.set({
            _invalidId: formatValid.and(prefixValid).not(),
            _levelMismatch: feature.getNumber('selectedLevel').neq(expectedLevel)
        })
    })
    const result = await evaluate(ee.Dictionary({
        total: samples.size(),
        perStratum: samples.aggregate_histogram('stratum'),
        distinctIds: samples.aggregate_count_distinct('id'),
        rowsMissingRequiredProperties: samples.size().subtract(
            samples.filter(ee.Filter.notNull(FINAL_EXPORT_PROPERTIES)).size()
        ),
        invalidIds: checked.aggregate_sum('_invalidId'),
        selectedLevelMismatches: checked.aggregate_sum('_levelMismatch'),
        properties: ee.Feature(samples.first()).propertyNames(),
        geometryTypes: samples.map(feature => ee.Feature(null, {
            geometryType: feature.geometry().type()
        })).aggregate_histogram('geometryType')
    }))
    const total = Number(result.total)
    const distinctIds = Number(result.distinctIds)
    const duplicates = total - distinctIds
    const userProperties = result.properties.filter(property => !property.startsWith('system:')).sort()
    const expectedProperties = [...FINAL_EXPORT_PROPERTIES].sort()
    const missingProperties = expectedProperties.filter(property => !userProperties.includes(property))
    const unexpectedProperties = userProperties.filter(property => !expectedProperties.includes(property))
    const countMismatches = Object.entries(FINAL_COUNTS_BY_STRATUM)
        .filter(([stratum, expected]) => Number(result.perStratum?.[stratum] || 0) !== expected)
        .map(([stratum, expected]) => ({
            stratum: Number(stratum),
            expected,
            actual: Number(result.perStratum?.[stratum] || 0)
        }))
    const unexpectedStrata = Object.keys(result.perStratum || {})
        .filter(stratum => !Object.hasOwn(FINAL_COUNTS_BY_STRATUM, stratum))
    const pointRows = Number(result.geometryTypes?.Point || 0)
    const failures = {
        total: total !== FINAL_TOTAL,
        counts: Boolean(countMismatches.length || unexpectedStrata.length),
        duplicates: duplicates !== 0,
        requiredProperties: Number(result.rowsMissingRequiredProperties) !== 0,
        ids: Number(result.invalidIds) !== 0,
        levels: Number(result.selectedLevelMismatches) !== 0,
        schema: Boolean(missingProperties.length || unexpectedProperties.length),
        geometry: pointRows !== total
            || Object.keys(result.geometryTypes || {}).some(type => type !== 'Point')
    }
    const failed = Object.entries(failures).filter(([_name, value]) => value).map(([name]) => name)
    if (failed.length) {
        throw new Error(`Final ready asset validation failed: ${JSON.stringify({
            assetId,
            failed,
            result,
            duplicates,
            userProperties,
            expectedProperties,
            missingProperties,
            unexpectedProperties,
            countMismatches,
            unexpectedStrata
        })}`)
    }
    return {
        total,
        perStratum: result.perStratum,
        distinctIds,
        duplicates,
        rowsMissingRequiredProperties: Number(result.rowsMissingRequiredProperties),
        invalidIds: Number(result.invalidIds),
        selectedLevelMismatches: Number(result.selectedLevelMismatches),
        properties: result.properties,
        userProperties,
        expectedProperties,
        missingProperties,
        unexpectedProperties,
        geometryTypes: result.geometryTypes,
        countMismatches,
        unexpectedStrata
    }
}

const runModestExport = async () => {
    await authenticate({linkedUser: true})
    const previousState = await verifyPreviousState()
    const config = finiteConfigs.find(({name}) => name === 'cross-crs-seeded-shifted-utm')
    const scenario = buildFiniteScenario(config)
    const candidates = rasterCandidates(scenario).select(EXPORT_PROPERTIES)
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_systematic_exact_centred_modest_${startedAt}`
    const task = ee.batch.Export.table.toAsset(
        candidates,
        `sd-systematic-exact-centred-modest-${startedAt}`,
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
            throw new Error(`Modest exact-centred export failed: ${JSON.stringify(taskResult.status)}`)
        }
        visibility = await waitForVisibility(assetId)
        validation = await validateReadyAsset({scenario, assetId})
    } finally {
        cleanup = await cleanupAsset(assetId)
    }
    return {
        status: 'PASS',
        previousState,
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
        attempts: 1
    }
}

const runSudanPreflight = async () => {
    await authenticate()
    const scenario = buildSudanScenario()
    const candidates = rasterCandidates(scenario).select(EXPORT_PROPERTIES)
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    const plan = densestPlan(scenario)
    const area = SUDAN_ALLOCATION.reduce((sum, row) => sum + row.area, 0)
    return {
        scenario: scenario.name,
        graph,
        densest: {
            diameter: plan.densest.diameter,
            dx: plan.densest.dx,
            dy: plan.densest.dy,
            estimatedLatticePixels: area / (plan.densest.dx * plan.densest.dy)
        },
        exportProperties: EXPORT_PROPERTIES,
        exportsStarted: 0,
        eeValueRequests: 0
    }
}

const runSudanExport = async () => {
    await authenticate({linkedUser: true})
    const activeTasks = await activeExactCentredTasks()
    assert(activeTasks.length === 0,
        `An exact-centred Sudan task is already active: ${JSON.stringify(activeTasks)}`)
    const scenario = buildSudanScenario()
    const candidates = rasterCandidates(scenario).select(EXPORT_PROPERTIES)
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    const plan = densestPlan(scenario)
    const area = SUDAN_ALLOCATION.reduce((sum, row) => sum + row.area, 0)
    const densest = {
        diameter: plan.densest.diameter,
        dx: plan.densest.dx,
        dy: plan.densest.dy,
        estimatedLatticePixels: area / (plan.densest.dx * plan.densest.dy)
    }
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_systematic_exact_centred_sudan_${startedAt}`
    const task = ee.batch.Export.table.toAsset(
        candidates,
        `sd-systematic-exact-centred-sudan-${startedAt}`,
        assetId
    )
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'SUDAN_EXPORT_STARTED',
        taskId: task.id,
        assetId,
        startedAt,
        graph,
        densest,
        attempts: 1
    }, null, 2))
    const taskResult = await waitForSudanTask(task.id)
    const runtimeSeconds = Number(taskResult.status.start_timestamp_ms)
        ? (Number(taskResult.status.update_timestamp_ms) - Number(taskResult.status.start_timestamp_ms)) / 1000
        : 0
    const eecu = Number(taskResult.status.batch_eecu_usage_seconds || 0)
    if (taskResult.status.state !== 'COMPLETED') {
        const cleanup = await cleanupAsset(assetId)
        return {
            status: taskResult.status.state,
            taskId: task.id,
            assetId,
            graph,
            densest,
            stateHistory: taskResult.history,
            cancellation: taskResult.cancellation,
            runtimeSeconds,
            eecu,
            error: taskResult.status.error_message || null,
            cleanup,
            attempts: 1
        }
    }
    const visibility = await waitForVisibility(assetId)
    const validation = await validateSudanReadyAsset(assetId)
    return {
        status: 'PASS',
        taskId: task.id,
        assetId,
        graph,
        densest,
        stateHistory: taskResult.history,
        cancellation: taskResult.cancellation,
        runtimeSeconds,
        eecu,
        visibility,
        validation,
        assetDisposition: {retained: true, assetId},
        attempts: 1
    }
}

const runSudanRecovery = async () => {
    const taskId = process.env.SD_SYSTEMATIC_SUDAN_TASK_ID
    const assetId = process.env.SD_SYSTEMATIC_SUDAN_ASSET_ID
    assert(taskId && assetId, 'Sudan recovery requires task and asset IDs')
    await authenticate({linkedUser: true})
    const scenario = buildSudanScenario()
    const candidates = rasterCandidates(scenario).select(EXPORT_PROPERTIES)
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    const plan = densestPlan(scenario)
    const area = SUDAN_ALLOCATION.reduce((sum, row) => sum + row.area, 0)
    const densest = {
        diameter: plan.densest.diameter,
        dx: plan.densest.dx,
        dy: plan.densest.dy,
        estimatedLatticePixels: area / (plan.densest.dx * plan.densest.dy)
    }
    console.log(JSON.stringify({
        checkpoint: 'SUDAN_EXPORT_RECOVERING',
        taskId,
        assetId,
        exportsStarted: 0
    }))
    const taskResult = await waitForSudanTask(taskId)
    const runtimeSeconds = Number(taskResult.status.start_timestamp_ms)
        ? (Number(taskResult.status.update_timestamp_ms) - Number(taskResult.status.start_timestamp_ms)) / 1000
        : 0
    const eecu = Number(taskResult.status.batch_eecu_usage_seconds || 0)
    if (taskResult.status.state !== 'COMPLETED') {
        const cleanup = await cleanupAsset(assetId)
        return {
            status: taskResult.status.state,
            taskId,
            assetId,
            graph,
            densest,
            stateHistory: taskResult.history,
            cancellation: taskResult.cancellation,
            runtimeSeconds,
            eecu,
            error: taskResult.status.error_message || null,
            cleanup,
            attempts: 1,
            recoveryExportsStarted: 0
        }
    }
    const visibility = await waitForVisibility(assetId)
    const validation = await validateSudanReadyAsset(assetId)
    return {
        status: 'PASS',
        taskId,
        assetId,
        graph,
        densest,
        stateHistory: taskResult.history,
        cancellation: taskResult.cancellation,
        runtimeSeconds,
        eecu,
        visibility,
        validation,
        assetDisposition: {retained: true, assetId},
        attempts: 1,
        recoveryExportsStarted: 0
    }
}

const runFinalPreflight = async ({linkedUser = false} = {}) => {
    await authenticate({linkedUser})
    const candidateAsset = await callbackPromise(callback =>
        ee.data.getAsset(SUDAN_CANDIDATE_ASSET, (result, error) => callback(result, error))
    )
    const samples = finalSelection()
    const graph = finalSelectionGraph(samples)
    const counts = await validateSelectedCounts(samples)
    return {
        candidateAsset: {assetId: SUDAN_CANDIDATE_ASSET, type: candidateAsset.type},
        graph,
        counts,
        levelsByStratum: FINAL_LEVELS_BY_STRATUM,
        exportsStarted: 0
    }
}

const runFinalGraphPreflight = async () => {
    await authenticate()
    const samples = finalSelection()
    return {
        graph: finalSelectionGraph(samples),
        candidateAsset: SUDAN_CANDIDATE_ASSET,
        levelsByStratum: FINAL_LEVELS_BY_STRATUM,
        expectedCountsByStratum: FINAL_COUNTS_BY_STRATUM,
        expectedTotal: FINAL_TOTAL,
        exportsStarted: 0,
        eeValueRequests: 0
    }
}

const runFinalExport = async () => {
    await authenticate({linkedUser: true})
    const activeTasks = await activeExactCentredTasks()
    assert(activeTasks.length === 0,
        `An exact-centred task is already active: ${JSON.stringify(activeTasks)}`)
    const candidateAsset = await callbackPromise(callback =>
        ee.data.getAsset(SUDAN_CANDIDATE_ASSET, (result, error) => callback(result, error))
    )
    const samples = finalSelection()
    const graph = finalSelectionGraph(samples)
    const preExportCounts = await validateSelectedCounts(samples)
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_systematic_exact_centred_final_${startedAt}`
    const task = ee.batch.Export.table.toAsset(
        samples,
        `sd-systematic-exact-centred-final-${startedAt}`,
        assetId
    )
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'FINAL_EXPORT_STARTED',
        taskId: task.id,
        assetId,
        candidateAsset: SUDAN_CANDIDATE_ASSET,
        graph,
        preExportCounts,
        attempts: 1
    }, null, 2))
    const taskResult = await waitForSudanTask(task.id, {
        checkpoint: 'FINAL_EXPORT_TASK',
        cancellationCheckpoint: 'FINAL_EXPORT_CANCEL_REQUESTED'
    })
    const runtimeSeconds = Number(taskResult.status.start_timestamp_ms)
        ? (Number(taskResult.status.update_timestamp_ms) - Number(taskResult.status.start_timestamp_ms)) / 1000
        : 0
    const eecu = Number(taskResult.status.batch_eecu_usage_seconds || 0)
    if (taskResult.status.state !== 'COMPLETED') {
        return {
            status: taskResult.status.state,
            taskId: task.id,
            assetId,
            candidateAsset: {assetId: SUDAN_CANDIDATE_ASSET, type: candidateAsset.type, retained: true},
            graph,
            preExportCounts,
            stateHistory: taskResult.history,
            cancellation: taskResult.cancellation,
            runtimeSeconds,
            eecu,
            error: taskResult.status.error_message || null,
            assetDisposition: {retained: true, assetId},
            attempts: 1
        }
    }
    const visibility = await waitForVisibility(assetId)
    const validation = await validateFinalReadyAsset(assetId)
    return {
        status: 'PASS',
        taskId: task.id,
        assetId,
        candidateAsset: {assetId: SUDAN_CANDIDATE_ASSET, type: candidateAsset.type, retained: true},
        graph,
        preExportCounts,
        stateHistory: taskResult.history,
        cancellation: taskResult.cancellation,
        runtimeSeconds,
        eecu,
        visibility,
        validation,
        assetDisposition: {retained: true, assetId},
        attempts: 1,
        candidateGenerationOperationsStarted: 0,
        repairOperationsStarted: 0
    }
}

const runFinalRecovery = async () => {
    const taskId = process.env.SD_SYSTEMATIC_FINAL_TASK_ID
    const assetId = process.env.SD_SYSTEMATIC_FINAL_ASSET_ID
    assert(taskId && assetId, 'Final recovery requires task and asset IDs')
    await authenticate({linkedUser: true})
    const candidateAsset = await callbackPromise(callback =>
        ee.data.getAsset(SUDAN_CANDIDATE_ASSET, (result, error) => callback(result, error))
    )
    const samples = finalSelection()
    const graph = finalSelectionGraph(samples)
    console.log(JSON.stringify({
        checkpoint: 'FINAL_EXPORT_RECOVERING',
        taskId,
        assetId,
        recoveryExportsStarted: 0
    }))
    const taskResult = await waitForSudanTask(taskId, {
        checkpoint: 'FINAL_EXPORT_TASK',
        cancellationCheckpoint: 'FINAL_EXPORT_CANCEL_REQUESTED'
    })
    const runtimeSeconds = Number(taskResult.status.start_timestamp_ms)
        ? (Number(taskResult.status.update_timestamp_ms) - Number(taskResult.status.start_timestamp_ms)) / 1000
        : 0
    const eecu = Number(taskResult.status.batch_eecu_usage_seconds || 0)
    if (taskResult.status.state !== 'COMPLETED') {
        return {
            status: taskResult.status.state,
            taskId,
            assetId,
            candidateAsset: {assetId: SUDAN_CANDIDATE_ASSET, type: candidateAsset.type, retained: true},
            graph,
            stateHistory: taskResult.history,
            cancellation: taskResult.cancellation,
            runtimeSeconds,
            eecu,
            error: taskResult.status.error_message || null,
            assetDisposition: {retained: true, assetId},
            attempts: 1,
            recoveryExportsStarted: 0
        }
    }
    const visibility = await waitForVisibility(assetId)
    const validation = await validateFinalReadyAsset(assetId)
    return {
        status: 'PASS',
        taskId,
        assetId,
        candidateAsset: {assetId: SUDAN_CANDIDATE_ASSET, type: candidateAsset.type, retained: true},
        graph,
        stateHistory: taskResult.history,
        cancellation: taskResult.cancellation,
        runtimeSeconds,
        eecu,
        visibility,
        validation,
        assetDisposition: {retained: true, assetId},
        attempts: 1,
        recoveryExportsStarted: 0,
        candidateGenerationOperationsStarted: 0,
        repairOperationsStarted: 0
    }
}

const runFinite = async ({firstOnly = false, cornerOnly = false} = {}) => {
    const floorPreflight = pixelCentreFloorPreflight()
    const nesting = pureNestingProof()
    await authenticate()
    const summaries = []
    const configs = cornerOnly
        ? finiteConfigs.filter(({name}) => name === 'same-crs-discriminating-exact-corner')
        : firstOnly
            ? finiteConfigs.filter(({name}) => name === 'same-crs-exact-source-boundary')
            : finiteConfigs
    for (const config of configs) {
        const scenario = buildFiniteScenario(config)
        const value = finiteComparison(scenario)
        const serializedBytes = Buffer.byteLength(serializedExpression(value))
        const result = await evaluate(value)
        const summary = {...summarizeFinite(result), payloadBytes: serializedBytes}
        summaries.push(summary)
        console.log(JSON.stringify({checkpoint: 'FINITE_SCENARIO', status: 'PASS', ...summary}))
    }
    let configuredGrid = null
    let sudan = null
    if (!firstOnly && !cornerOnly) {
        const configuredValue = configuredGridWitness()
        const payloadBytes = Buffer.byteLength(serializedExpression(configuredValue))
        configuredGrid = {
            payloadBytes,
            ...summarizeConfiguredGridWitness(await evaluate(configuredValue))
        }
        console.log(JSON.stringify({
            checkpoint: 'FINITE_CONFIGURED_GRID',
            status: 'PASS',
            ...configuredGrid
        }))
        sudan = sudanGraphOnly()
    }
    return {floorPreflight, nesting, summaries, configuredGrid, sudan}
}

const runConfiguredGridOnly = async () => {
    const floorPreflight = pixelCentreFloorPreflight()
    const nesting = pureNestingProof()
    await authenticate()
    const value = configuredGridWitness()
    const payloadBytes = Buffer.byteLength(serializedExpression(value))
    return {
        floorPreflight,
        nesting,
        payloadBytes,
        witness: summarizeConfiguredGridWitness(await evaluate(value))
    }
}

const runModestPreflight = async () => {
    await authenticate()
    const config = finiteConfigs.find(({name}) => name === 'cross-crs-seeded-shifted-utm')
    const scenario = buildFiniteScenario(config)
    const candidates = rasterCandidates(scenario).select(EXPORT_PROPERTIES)
    const graph = graphCharacteristics(candidates)
    assertCandidateGraph(graph)
    return {
        scenario: scenario.name,
        graph,
        exportProperties: EXPORT_PROPERTIES,
        exportsStarted: 0,
        eeValueRequests: 0
    }
}

const main = async () => {
    if (process.env.SD_SYSTEMATIC_FINAL_RECOVER === '1') {
        console.log(JSON.stringify({
            checkpoint: 'FINAL_EXPORT_RECOVERY',
            ...await runFinalRecovery()
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_FINAL_EXPORT === '1') {
        console.log(JSON.stringify({
            checkpoint: 'FINAL_EXPORT',
            ...await runFinalExport()
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_FINAL_PREFLIGHT === '1') {
        console.log(JSON.stringify({
            checkpoint: 'FINAL_PREFLIGHT',
            status: 'PASS',
            ...await runFinalPreflight()
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_FINAL_GRAPH === '1') {
        console.log(JSON.stringify({
            checkpoint: 'FINAL_GRAPH_PREFLIGHT',
            status: 'PASS',
            ...await runFinalGraphPreflight()
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_SUDAN_RECOVER === '1') {
        console.log(JSON.stringify({
            checkpoint: 'SUDAN_EXPORT_RECOVERY',
            ...await runSudanRecovery()
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_SUDAN_EXPORT === '1') {
        console.log(JSON.stringify({
            checkpoint: 'SUDAN_EXPORT',
            ...await runSudanExport()
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_SUDAN_PREFLIGHT === '1') {
        console.log(JSON.stringify({
            checkpoint: 'SUDAN_PREFLIGHT',
            status: 'PASS',
            ...await runSudanPreflight()
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_AFFINE_DIAGNOSTIC === '1') {
        await authenticate()
        console.log(JSON.stringify({
            checkpoint: 'AFFINE_CENTRE_DIAGNOSTIC',
            rows: await evaluate(affineCentreDiagnostic()),
            eeValueRequests: 1,
            exportsStarted: 0
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_MODEST_EXPORT === '1') {
        console.log(JSON.stringify({checkpoint: 'MODEST_EXPORT', ...await runModestExport()}, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_MODEST_PREFLIGHT === '1') {
        console.log(JSON.stringify({
            checkpoint: 'MODEST_PREFLIGHT',
            status: 'PASS',
            ...await runModestPreflight()
        }, null, 2))
        return
    }
    if (process.env.SD_SYSTEMATIC_CONFIGURED_GRID_ONLY === '1') {
        console.log(JSON.stringify({
            checkpoint: 'SYSTEMATIC_LATTICE_CONFIGURED_GRID',
            status: 'PASS',
            ...await runConfiguredGridOnly(),
            eeValueRequests: 1,
            exportsStarted: 0,
            retries: 0
        }, null, 2))
        return
    }
    const firstOnly = process.env.SD_SYSTEMATIC_FIRST_ONLY === '1'
    const cornerOnly = process.env.SD_SYSTEMATIC_CORNER_ONLY === '1'
    const result = await runFinite({firstOnly, cornerOnly})
    console.log(JSON.stringify({
        checkpoint: cornerOnly
            ? 'SYSTEMATIC_LATTICE_CORNER_FINITE'
            : firstOnly ? 'SYSTEMATIC_LATTICE_FIRST_FINITE' : 'SYSTEMATIC_LATTICE_FINITE',
        status: 'PASS',
        ...result,
        eeValueRequests: firstOnly || cornerOnly ? 1 : finiteConfigs.length + 1,
        exportsStarted: 0,
        retries: 0
    }, null, 2))
}

main().catch(error => {
    console.error(error?.stack || error)
    process.exitCode = 1
})
