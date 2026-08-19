import ee from '#sepal/ee/ee'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {sparseRandomCandidates} from '#sepal/ee/samplingDesign/sparseRandomSampling'
import {stratifiedSystematicExactCandidates} from '#sepal/ee/samplingDesign/systematicSampling'
import {resolveSamplingGridCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

const cb = op => new Promise((res, rej) => op((r, e) => e ? rej(e) : res(r)))
const evaluate = v => new Promise((res, rej) => v.evaluate((r, e) => e ? rej(e) : res(r)))
const assert = (c, m) => {
    if (!c) {
        throw new Error(m)
    }
}
const EASE = resolveSamplingGridCrs('EPSG:6933')
const NORTH = 'EPSG:6931'

const allocation = [{stratum: 1, area: 1e10, sampleSize: 20}]
// Built lazily: constructing an EE object at module scope triggers algorithm lookup before authentication.
const regionOf = () => ee.Geometry.Rectangle([30, 10, 30.4, 10.4], 'EPSG:4326', false)

const stratification = ({crs, scale}) =>
    ee.Image(1).rename('stratum').toInt().reproject(ee.Projection(crs).atScale(scale))

// minDistance is left UNSET so the spacing floor is 2 * Stratification pixel size and the Stratification grid
// actually drives the nested density. With minDistance pinned above both floors the two runs build identical
// layouts and an invariance check proves nothing.
const candidates = ({arrangementCrs = EASE, stratificationCrs = 'EPSG:32636', scale = 10, gridOrigin = 'FIXED', minDistance, allocation: allocationOverride, region: regionOverride} = {}) =>
    stratifiedSystematicExactCandidates({
        allocation: allocationOverride || allocation,
        stratification: stratification({crs: stratificationCrs, scale}),
        region: regionOverride || regionOf(),
        stratificationGrid: {crs: stratificationCrs, scale},
        arrangementGrid: {crs: arrangementCrs},
        sampleArrangement: {minDistance, gridOrigin, seed: 2},
        densityOffset: 0
    })

// Every candidate as WGS84 lon/lat, sorted - a frame both runs share, so two lattices can be compared as
// physical positions rather than as indices that mean different things per CRS.
const wgs84Points = collection => collection
    .map(feature => {
        const c = feature.geometry().transform('EPSG:4326', 0.001).coordinates()
        return ee.Feature(null, {lon: c.get(0), lat: c.get(1)})
    })
    .reduceColumns(ee.Reducer.toList(2), ['lon', 'lat']).get('list')

// ~1 m at these latitudes. Cross-CRS reconstruction goes through different projection paths, so positions that
// are physically the same can differ by far more than exact float equality tolerates.
const easePoints = collection => collection
    .map(feature => {
        const c = feature.geometry().transform(ee.Projection(EASE), 0.001).coordinates()
        return ee.Feature(null, {x: c.get(0), y: c.get(1)})
    })
    .reduceColumns(ee.Reducer.toList(2), ['x', 'y']).get('list')

// Tolerance is sized to the REPROJECTION PATH, not to the harness. The cross-CRS gate compares lattices built in
// different projections, where physically identical positions differ by far more than float equality tolerates;
// ~1 m at these latitudes. Origin invariance is same-CRS through a much shorter reconstruction path and stays
// EXACT - a sub-metre translation is precisely the failure it exists to catch.
const CROSS_CRS_TOLERANCE_DEGREES = 1e-5
const matchesWithin = (point, others) => others.some(other =>
    Math.abs(point[0] - other[0]) < CROSS_CRS_TOLERANCE_DEGREES
        && Math.abs(point[1] - other[1]) < CROSS_CRS_TOLERANCE_DEGREES)
const matchesExactly = (point, others) => others.some(other =>
    point[0] === other[0] && point[1] === other[1])

const count = (text, name) => (text.match(new RegExp(`Image\\.${name}`, 'g')) || []).length

const subtreeFunctions = (node, values, seen = new Set()) => {
    const names = new Set()
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

const reprojectBranches = value => {
    const parsed = JSON.parse(value.serialize())
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
                const fns = subtreeFunctions(args?.image, values)
                found.push({
                    reachesLattice: fns.has('Image.pixelCoordinates'),
                    reachesCategorical: fns.has('Image.constant') || fns.has('Image.load')
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

const firstPoint = collection => ee.Feature(collection.sort('i').first()).geometry()
    .transform(ee.Projection(EASE), 0.001).coordinates()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const readCredentials = async () => {
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

const isExpiredCredentials = error =>
    /401|unauthorized|invalid.*credential|invalid.*token|token.*(expired|revoked)/i.test(String(error))

const isNotFound = error => /not found|does not exist|404/i.test(String(error))

// Modest cross-CRS batch: proves Earth Engine accepts and materializes the CURRENT production graph - masked
// single band, no buffer - and that the result carries the right schema, geometry and identity. Batch
// compatibility only; exactness is established by the finite matrices, not here.
const runModestExport = async () => {
    const credentials = await readCredentials()
    if (Number(credentials.access_token_expiry_date) <= Date.now()) {
        throw new Error('Linked-user authorization is expired')
    }
    ee.data.clearAuthToken()
    ee.data.setAuthTokenRefresher(null)
    ee.data.setAuthToken(null, 'Bearer', credentials.access_token, null, null, null, false)
    await cb(c => ee.initialize(null, null, c, e => c(null, e), null, credentials.project_id))
    ee.setMaxRetries(0)

    // Cross-CRS: Stratification EPSG:32636, Arrangement EPSG:6933.
    const collection = candidates({
        arrangementCrs: EASE,
        stratificationCrs: 'EPSG:32636',
        scale: 128,
        gridOrigin: 'SEEDED',
        allocation: [{stratum: 1, area: 1e6, sampleSize: 1000}],
        region: ee.Geometry.Rectangle([30, 10, 30.05, 10.05], 'EPSG:4326', false)
    })
    const text = JSON.stringify(collection.serialize())
    const graph = {
        reduceToVectors: count(text, 'reduceToVectors'),
        reproject: count(text, 'reproject'),
        buffer: (text.match(/Geometry\.buffer/g) || []).length,
        serializedBytes: text.length
    }
    const startedAt = Date.now()
    const assetId = `projects/${credentials.project_id}/assets/sd_grid_invariants_modest_${startedAt}`
    const task = ee.batch.Export.table.toAsset(collection, `sd-grid-invariants-modest-${startedAt}`, assetId)
    task.start()
    // Emitted before any polling: the task outlives this process and a fresh token resumes from these ids.
    console.log(JSON.stringify({checkpoint: 'GRID_INVARIANTS_MODEST_STARTED', taskId: task.id, assetId, graph}))

    for (;;) {
        const [status] = await cb(c => ee.data.getTaskStatus(task.id, (r, e) => c(r, e)))
        console.log(JSON.stringify({
            checkpoint: 'GRID_INVARIANTS_MODEST_POLL', state: status.state,
            eecu: Number(status.batch_eecu_usage_seconds || 0)
        }))
        if (!['READY', 'RUNNING'].includes(status.state)) {
            if (status.state !== 'COMPLETED') {
                throw new Error(`Modest export ${status.state}: ${status.error_message || ''}`)
            }
            const runtimeSeconds = (Number(status.update_timestamp_ms) - Number(status.start_timestamp_ms)) / 1000
            const eecu = Number(status.batch_eecu_usage_seconds || 0)
            const ready = ee.FeatureCollection(assetId)
            const validation = await evaluate(ee.Dictionary({
                size: ready.size(),
                properties: ee.Feature(ready.first()).propertyNames(),
                geometryTypes: ready.map(f => ee.Feature(null, {type: f.geometry().type()})).aggregate_histogram('type'),
                distinctIds: ready.map(f => f.set('key', f.getNumber('stratum').format('%d')
                    .cat(':').cat(f.getNumber('i').format('%d')).cat(':').cat(f.getNumber('j').format('%d'))))
                    .aggregate_count_distinct('key')
            }))
            await cb(c => ee.data.deleteAsset(assetId, (r, e) => c(r, e))).catch(e => {
                if (!isNotFound(e)) {
                    throw e
                }
            })
            console.log(JSON.stringify({
                checkpoint: 'GRID_INVARIANTS_MODEST', status: 'PASS', taskId: task.id, assetId,
                runtimeSeconds, eecu, graph, validation, cleanedUp: true
            }, null, 2))
            return
        }
        await sleep(10000)
    }
}

const main = async () => {
    if (process.env.SD_SYSTEMATIC_MODEST === '1') {
        return runModestExport()
    }
    await cb(c => ee.data.authenticateViaPrivateKey(serviceAccountCredentials, c, e => c(null, e)))
    await cb(c => ee.initialize(null, null, c, e => c(null, e), null, googleProjectId))
    ee.setMaxRetries(0)

    const results = {}

    // GATE: graph shape.
    const graph = candidates()
    const text = JSON.stringify(graph.serialize())
    const shape = {
        reduceToVectors: count(text, 'reduceToVectors'),
        reproject: count(text, 'reproject'),
        reduceRegions: count(text, 'reduceRegions'),
        reduceRegion: (text.match(/"Image\.reduceRegion"/g) || []).length,
        sampleRegions: count(text, 'sampleRegions'),
        displace: count(text, 'displace'),
        focalMax: count(text, 'focalMax'),
        reduceResolution: count(text, 'reduceResolution'),
        resample: count(text, 'resample'),
        // Counted so the buffer removal is visible in the recorded profile, not inferred.
        buffer: (text.match(/Geometry\.buffer/g) || []).length,
        serializedBytes: text.length
    }
    assert(shape.reduceToVectors === 2, `expected 2 reduceToVectors, got ${shape.reduceToVectors}`)
    for (const forbidden of ['reduceRegions', 'reduceRegion', 'sampleRegions', 'displace', 'focalMax', 'reduceResolution', 'resample', 'buffer']) {
        assert(shape[forbidden] === 0, `${forbidden} present: ${shape[forbidden]}`)
    }
    // Exactly one reproject, and it is the upstream categorical lock - never on the lattice branch.
    const branches = reprojectBranches(graph)
    assert(branches.length === 1, `expected exactly 1 reproject, got ${branches.length}`)
    assert(!branches[0].reachesLattice, 'reproject is on the lattice branch')
    assert(branches[0].reachesCategorical, 'reproject does not reach the categorical source')
    results.graph = {...shape, reprojectBranch: branches[0]}

    // GATE: Arrangement CRS is live - changing it must move the lattice. Compares the FULL point set in a shared
    // frame, so an inert Arrangement CRS produces identical sets and the assertion fails.
    const easeSet = await evaluate(wgs84Points(candidates({arrangementCrs: EASE})))
    const northSet = await evaluate(wgs84Points(candidates({arrangementCrs: NORTH})))
    assert(easeSet.length && northSet.length, 'Arrangement CRS gate produced an empty lattice')
    const inAoi = set => set.every(([lon, lat]) => lon >= 29.9 && lon <= 30.5 && lat >= 9.9 && lat <= 10.5)
    assert(inAoi(easeSet) && inAoi(northSet), 'Arrangement CRS gate produced points outside the AOI')
    // An inert Arrangement CRS produces the SAME lattice, so it can produce neither a differing count nor a
    // point with no counterpart. Either alone is decisive; the disjunction avoids a false alarm if two genuinely
    // different lattices happened to land the same number of points in the AOI.
    const unmatched = northSet.filter(point => !matchesWithin(point, easeSet)).length
    assert(easeSet.length !== northSet.length || unmatched > 0,
        `Arrangement CRS is inert: ${easeSet.length} points, all matching within ${CROSS_CRS_TOLERANCE_DEGREES} degrees`)
    results.arrangementCrsLive = {
        easePoints: easeSet.length,
        northPoints: northSet.length,
        northPointsWithNoEaseCounterpart: unmatched,
        toleranceDegrees: CROSS_CRS_TOLERANCE_DEGREES,
        bothInsideAoi: true
    }

    // GATE: origin invariance. Vary Stratification scale with minDistance UNSET so the floor (2 * pixel size)
    // really does select a different nested density; hold Arrangement CRS and seed. Membership may change,
    // position may not - every surviving point of the sparser lattice must sit exactly on a point of the denser
    // one. If the two runs selected the SAME density the check would be a tautology, so that is asserted too.
    // The floor only binds when the area-driven target exponent is BELOW it, so this fixture uses a small area
    // with a large requested count (target exponent 3) and coarse Stratification pixels: 128 m -> floor 256 m ->
    // diameter 2^8, 1024 m -> floor 2048 m -> diameter 2^11. Small AOI to keep both lattices enumerable.
    const originAllocation = [{stratum: 1, area: 1e6, sampleSize: 1000}]
    const originRegion = ee.Geometry.Rectangle([30, 10, 30.05, 10.05], 'EPSG:4326', false)
    const seeded = scale => candidates({
        scale, gridOrigin: 'SEEDED', allocation: originAllocation, region: originRegion
    })
    const dense = await evaluate(wgs84Points(seeded(128)))
    const sparse = await evaluate(wgs84Points(seeded(1024)))
    // Both halves of the contract: changing the Stratification pixel size MAY change membership / the selected
    // nested density, and MUST NOT translate the lattice.
    assert(sparse.length < dense.length,
        `Coarser Stratification pixels did not thin the lattice (${dense.length} vs ${sparse.length})`)
    const translatedPoints = sparse.filter(point => !matchesExactly(point, dense))
    assert(!translatedPoints.length,
        `Stratification scale translated the seeded lattice: ${JSON.stringify(translatedPoints.slice(0, 3))}`)
    results.originInvariance = {
        densePoints: dense.length,
        sparsePoints: sparse.length,
        sparseIsSubsetOfDense: true,
        comparison: 'exact',
        translatedPoints: translatedPoints.length
    }

    // GATE: edge convention is centre-in-region. Build an AOI whose right edge passes EXACTLY through lattice
    // point centres, and assert those points are excluded. Pins the convention so a re-added buffer fails here.
    // Fine lattice (256 m diameter) so the rectangle holds many points and several share an exact edge x.
    const edgeAllocation = [{stratum: 1, area: 1e6, sampleSize: 1000}]
    const edgeFixture = region => candidates({region, allocation: edgeAllocation, scale: 128})
    const wide = ee.Geometry.Rectangle([2900000, 1290000, 2904000, 1292000], ee.Projection(EASE), false, true)
    const widePoints = await evaluate(easePoints(edgeFixture(wide)))
    assert(widePoints.length > 2, `edge fixture needs several points, got ${widePoints.length}`)
    const edgeX = Math.max(...widePoints.map(([x]) => x))
    const onEdge = widePoints.filter(([x]) => Math.abs(x - edgeX) < 1e-6).length
    const clipped = ee.Geometry.Rectangle([2900000, 1290000, edgeX, 1292000], ee.Projection(EASE), false, true)
    const clippedPoints = await evaluate(easePoints(edgeFixture(clipped)))
    const survivors = clippedPoints.filter(([x]) => Math.abs(x - edgeX) < 1e-6).length
    assert(survivors === 0,
        `boundary-coincident lattice points survived: ${survivors} of ${onEdge} at x=${edgeX}`)
    results.edgeConvention = {
        widePoints: widePoints.length,
        pointsOnEdge: onEdge,
        clippedPoints: clippedPoints.length,
        survivorsOnEdge: survivors,
        convention: 'centre-in-region (boundary-coincident excluded)'
    }

    // GATE: Random's edge convention, ASSERTED. Systematic's now fails visibly if a buffer returns; without this
    // a later change to Random's frame would re-diverge the pair with nothing catching it.
    const randomAllocation = [{stratum: 1, area: 1e6, sampleSize: 10}]
    const randomCells = region => sparseRandomCandidates({
        stratification: stratification({crs: 'EPSG:32636', scale: 10}),
        region,
        grid: {crs: EASE, scale: 10},
        seed: 1,
        loThresholds: [0],
        hiThresholds: [1],
        allocation: randomAllocation
    })
    const cellX = collection => collection
        .map(feature => ee.Feature(null, {x: feature.geometry().transform(ee.Projection(EASE), 0.001).coordinates().get(0)}))
        .aggregate_array('x')
    const randomWide = ee.Geometry.Rectangle([2900000, 1290000, 2900200, 1290100], ee.Projection(EASE), false, true)
    const randomWidePoints = await evaluate(cellX(randomWide ? randomCells(randomWide) : null))
    assert(randomWidePoints.length > 2, `Random edge fixture needs several cells, got ${randomWidePoints.length}`)
    // Cell centres sit at (i + 0.5) * scale, so an edge there passes exactly through a column of centres.
    const randomEdgeX = Math.max(...randomWidePoints)
    const randomOnEdge = randomWidePoints.filter(x => Math.abs(x - randomEdgeX) < 1e-6).length
    const randomClipped = ee.Geometry.Rectangle([2900000, 1290000, randomEdgeX, 1290100], ee.Projection(EASE), false, true)
    const randomClippedPoints = await evaluate(cellX(randomCells(randomClipped)))
    const randomSurvivors = randomClippedPoints.filter(x => Math.abs(x - randomEdgeX) < 1e-6).length
    assert(randomSurvivors === 0,
        `Random kept boundary-coincident cells: ${randomSurvivors} of ${randomOnEdge} at x=${randomEdgeX}`)
    results.randomEdgeConvention = {
        widePoints: randomWidePoints.length,
        pointsOnEdge: randomOnEdge,
        clippedPoints: randomClippedPoints.length,
        survivorsOnEdge: randomSurvivors,
        convention: 'centre-in-region (boundary-coincident excluded)',
        agreesWithSystematic: true
    }

    console.log(JSON.stringify({checkpoint: 'GRID_INVARIANTS', status: 'PASS', ...results}, null, 2))
}

main().catch(error => {
    // Exit 2 means only the credential expired: any running batch task is untouched and monitoring can resume.
    if (isExpiredCredentials(error)) {
        console.log(JSON.stringify({checkpoint: 'GRID_INVARIANTS_CREDENTIALS_EXPIRED', error: String(error)}))
        process.exitCode = 2
        return
    }
    console.error(error?.stack || error)
    process.exitCode = 1
})
