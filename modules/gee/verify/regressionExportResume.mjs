// Whether regression results survive real batch exports, and whether Resume keeps only what this precision wrote.
//
// Production's own source, compatibility, preparation and tile paths run under the gee module's REST transport,
// as the linked user whose credentials arrive on stdin. `ccdc` classifies a real Sentinel-1 collection with a real
// regression. Only the observations of `image` and `incompatible` are controlled - radar regression in target units,
// centred as in phenologyRegressionPrecision.mjs - and their stand-in records the regression marker as collection.js
// does. Everything is written into a folder named for the run, and `cleanup` removes only that run's assets, once
// no task of the run may still be writing.
//
// Not a test: it needs credentials, writes assets and starts batch tasks. REG_EXPORT_MODE selects plan, image,
// incompatible, ccdc, resume (ccdc from its Resume onward, over a collection holding tile 0 only), read or
// cleanup; REG_EXPORT_RUN names the run and is required by every mode but plan. `file` exports an Optical
// Phenology to Drive through the production file path, its Classification reading an input asset of the run, and
// downloads what production lists into the container's /tmp/sepal_regression_export_<run> for GDAL. It never
// cancels: `file-status` reconnects to its task (REG_EXPORT_TASK) after credentials expire, and `file-cleanup` removes
// the run's Drive folder.
//
//   docker exec -i -w /usr/local/src/sepal/modules/gee gee node --experimental-test-module-mocks \
//       verify/regressionExportResume.mjs < credentials.json

import assert from 'node:assert/strict'
import {mkdir, writeFile} from 'node:fs/promises'
import {mock} from 'node:test'

import {defer, firstValueFrom, lastValueFrom, of, switchMap} from 'rxjs'

import {googleProjectId} from '#gee/config'
import {drive} from '#gee/jobs/ee/batch/drive'
import {eeLimiter$} from '#gee/jobs/service/eeLimiter'
import {serviceAccountToken$} from '#gee/jobs/service/serviceAccountToken'
import ee from '#sepal/ee/ee'
import {DEFAULT_EE_ENDPOINT, inEEContext} from '#sepal/ee/eeContext'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'
import {EERestClient} from '#sepal/ee/rest/eeRestClient'
import {EERestRuntime} from '#sepal/ee/restRuntime'
import {recordRegressionPrecision} from '#sepal/ee/timeSeries/regressionPrecision'
import {NotFoundException} from '#sepal/exception'
import {delete$, get$, patchJson$, postJson$} from '#sepal/httpClient'
import {encodingFromProperties} from '#sepal/recipe/output/bandEncoding'
import {PHENOLOGY_BANDS} from '#sepal/recipe/type/phenology'

import {failure} from './eeFailures.mjs'
import {cleanupScratch, createDeletionGuard, isTerminal, runMode} from './probeRun.mjs'

const MODE = process.env.REG_EXPORT_MODE || 'plan'
const RUN_ID = process.env.REG_EXPORT_RUN
const TASK_POLL_MS = 5000
const TASK_TIMEOUT_MS = 10 * 60 * 1000
const CANCEL_CONFIRM_MS = 2 * 60 * 1000

const AREA = () => ee.Geometry.Rectangle([-0.002, -0.002, 0.002, 0.002])
// West of -0.0005 the regression is beyond int16; between it and 0.0005, negative and fractional; east of 0.0005,
// masked.
const POINTS = {formerlyClipped: [-0.0015, 0], negative: [0, 0], masked: [0.0012, 0]}
const CLASSIFICATION_ID = 'classification-verify'
const OPTICAL_CLASSIFICATION_ID = 'classification-optical-verify'
const DRIVE_EXPORTS = 'SEPAL/exports'
const FILE_WAIT_MS = 8 * 60 * 1000

let user
let credentials
let observations

const main = async () => {
    const modes = {
        plan: {run: plan, offline: true},
        image: {run: image, createsFixtures: true},
        incompatible: {run: incompatible, createsFixtures: true},
        ccdc: {run: ccdc, createsFixtures: true},
        resume: {run: ccdc},
        read: {run: read},
        cleanup: {run: cleanup},
        file: {run: file, createsFixtures: true},
        'file-status': {run: fileStatus},
        'file-cleanup': {run: fileCleanup}
    }
    if (MODE !== 'plan') {
        assert.match(RUN_ID || '', /^r[a-z0-9]{4,20}$/, 'REG_EXPORT_RUN must name this run (r followed by 4-20 [a-z0-9])')
    }
    if (['image', 'incompatible', 'file'].includes(MODE)) {
        mock.module('#sepal/ee/timeSeries/collection', {
            exports: {
                getCollection$: ({recipe, bands}) => defer(() => {
                    if (recipe.model.sources.classification && bands?.includes('regression')) {
                        recordRegressionPrecision(recipe.model.sources.dataSets)
                    }
                    return of(observations)
                })
            }
        })
    }
    const result = await runMode({modes, mode: MODE, authenticate, provisionStorage: () => as(ee.createFolder$(scratchFolder()))})
    console.info(JSON.stringify({mode: MODE, runId: RUN_ID, ...result}, null, 2))
}

const plan = async () => ({status: 'PLAN', folder: 'projects/<project>/assets/sepal_regression_export_<run>', modes: ['image', 'incompatible', 'ccdc', 'resume', 'read', 'cleanup', 'file', 'file-status', 'file-cleanup']})

// A Phenology of controlled radar regression observations, exported by the generic image path and read back.
const image = async () => {
    const assetId = scratchId('image')
    const {imageAssetSource$, startImageAssetExport$} = await import('#gee/jobs/task/export/imageAssetExport')
    const {readExportAsset$, assertRegressionCompatible, regressionCompatibility$} = await import('#gee/jobs/task/export/regressionCompatibility')
    observations = controlledObservations()
    const request = exportRequest({title: scratchName('image'), assetId, strategy: 'new'})
    const graph = await inScope(() => as(imageAssetSource$(request)))
    const expected = await as(ee.getInfo$(sample(graph.image), 'Sample exported graph'))
    const started = await inScope(() => as(startImageAssetExport$(request)))
    const task = await waitForTask(started.eeTaskId)
    if (task.state !== 'COMPLETED') {
        return {status: task.state, assetId, task}
    }
    const record = await as(ee.getAssetRecord$(assetId, 0))
    const written = await as(ee.getInfo$(sample(ee.Image(assetId)), 'Sample exported asset'))
    const compatibility = await as(regressionCompatibility$(graph.image, graph.regressionPrecision))
    const reread = await as(readExportAsset$(assetId, compatibility))
    assertRegressionCompatible(assetId, reread, compatibility)
    const types = Object.fromEntries(record.bands.map(({id, dataType}) => [id, {precision: dataType.precision, ...dataType.range}]))
    const encoding = encodingFromProperties(record.properties)
    const findings = imageFindings({expected, written, types, encoding, record, compatibility})
    return {status: 'DONE', assetId, task, findings, record: describeRecord(record), samples: {expected, written}}
}

// A collection stating a precision but no schema: Resume must refuse before anything is changed or started.
const incompatible = async () => {
    const assetId = scratchId('incompatible')
    const {imageAssetSource$} = await import('#gee/jobs/task/export/imageAssetExport')
    const {prepareImageCollection$} = await import('#gee/jobs/task/export/toAsset')
    observations = controlledObservations()
    await as(ee.createImageCollection$(assetId, {run: RUN_ID, sepal_regression_precision: '{"version":1,"scales":[1]}'}, 0))
    const before = await as(ee.getAssetRecord$(assetId, 0))
    const request = exportRequest({title: scratchName('incompatible'), assetId, strategy: 'resume'})
    const source = await inScope(() => as(imageAssetSource$(request)))
    let refusal
    try {
        await as(prepareImageCollection$({...source, tileSize: 0.002}))
    } catch (error) {
        refusal = {message: error.message, key: error.userMessage?.key}
    }
    const after = await as(ee.getAssetRecord$(assetId, 0))
    const children = await listAssets(assetId)
    const operations = await as(ee.listOperations$())
    const started = operations
        .map(operation => operation.metadata || {})
        .filter(({description}) => String(description || '').startsWith(`${RUN_ID}_incompatible`))
    assert.ok(refusal, 'Resume was expected to refuse')
    assert.match(refusal.message, /Regression precision or schema is missing or incompatible/)
    assert.equal(after.updateTime, before.updateTime)
    assert.deepEqual(after.properties, before.properties)
    assert.deepEqual(children, {status: 'OK', assets: []})
    assert.deepEqual(started, [])
    return {status: 'DONE', assetId, refusal, updateTime: {before: before.updateTime, after: after.updateTime}, properties: after.properties, tiles: 0, tasksStarted: 0}
}

// CCDC over a real radar collection classified by a real regression: two tiles, one exported, Resume exporting only
// the other, and a final preparation that finds both retained.
const ccdc = async () => {
    const {ccdcAssetSource$} = await import('#gee/jobs/task/export/ccdcAssetExport')
    const {prepareImageCollection$, startCollectionTileExport$} = await import('#gee/jobs/task/export/toAsset')
    const assetId = scratchId('ccdc')
    const request = {
        description: scratchName('ccdc'),
        image: {recipe: ccdcRecipe(), bands: ['regression'], scale: 30, assetId, strategy: 'new', tileSize: 0.002, properties: {}}
    }
    const source = await inScope(() => as(ccdcAssetSource$(request)))
    if (MODE === 'ccdc') {
        const prepared = await as(prepareImageCollection$(source))
        assert.equal(prepared.tiles.length, 2, `${prepared.tiles.length} tiles`)
        const first = await waitForTask((await as(startCollectionTileExport$(source, prepared.tiles[0]))).eeTaskId)
        assert.equal(first.state, 'COMPLETED', JSON.stringify(first))
    }
    const retainedBefore = await as(ee.getAssetRecord$(`${assetId}/0`, 0))
    const resumed = await as(prepareImageCollection$({...source, strategy: 'resume'}))
    const missing = resumed.tiles.filter(({retained}) => !retained)
    assert.deepEqual(resumed.tiles.map(({retained}) => retained), [true, false])
    const exported = []
    for (const tile of missing) {
        exported.push(await waitForTask((await as(startCollectionTileExport$({...source, strategy: 'resume'}, tile))).eeTaskId))
    }
    assert.ok(exported.every(({state}) => state === 'COMPLETED'), JSON.stringify(exported))
    const again = await as(prepareImageCollection$({...source, strategy: 'resume'}))
    assert.deepEqual(again.tiles.map(({retained}) => retained), [true, true])
    const collection = await as(ee.getAssetRecord$(assetId, 0))
    const tiles = await Promise.all([0, 1].map(index => as(ee.getAssetRecord$(`${assetId}/${index}`, 0))))
    const values = await as(ee.getInfo$(ee.ImageCollection(assetId).mosaic().reduceRegion({
        reducer: ee.Reducer.first(), geometry: ee.Geometry.Point([-60.049, -3.119]), scale: 30
    }), 'Sample CCDC asset'))
    return {
        status: 'DONE',
        assetId,
        tasks: {exported},
        tiles: {resumed: resumed.tiles, again: again.tiles},
        retainedTileUnchanged: retainedBefore.updateTime === tiles[0].updateTime,
        collection: describeRecord({...collection, bands: []}),
        tileRecords: tiles.map(tile => ({
            name: tile.name,
            updateTime: tile.updateTime,
            regression: {precision: tile.properties.sepal_regression_precision, schemaMatchesCollection: tile.properties.sepal_regression_schema === collection.properties.sepal_regression_schema},
            bands: tile.bands.map(({id, dataType}) => ({id, precision: dataType.precision, dimensions: dataType.dimensionsCount || 0, ...dataType.range}))
        })),
        encoding: encodingFromProperties(collection.properties),
        values
    }
}

// What this run's assets hold now. Read-only.
const read = async () => {
    const listed = await listAssets(scratchFolder())
    const records = []
    for (const {id} of listed.assets || []) {
        const record = await as(ee.getAssetRecord$(id, 0))
        records.push({
            ...describeRecord({...record, bands: record.bands || []}),
            types: Object.fromEntries((record.bands || []).map(({id, dataType}) => [id, {precision: dataType.precision, dimensions: dataType.dimensionsCount || 0, ...dataType.range}])),
            encoding: encodingFromProperties(record.properties)
        })
    }
    const operations = (await as(ee.listOperations$()))
        .map(({name, metadata = {}}) => ({task: name.split('/').pop(), state: metadata.state, description: metadata.description}))
        .filter(({description}) => String(description || '').startsWith(`${RUN_ID}_`))
    const root = await listAssets(`projects/${user.projectId}/assets`)
    const scratch = (root.assets || []).map(({id}) => id).filter(id => id.includes('sepal_regression_export_'))
    return {status: listed.status, records, operations, scratchFoldersInRoot: root.status === 'OK' ? scratch : root}
}

// An Optical Phenology exported to Drive by the production file path. The task and its destination are reported the
// moment it is submitted, and a run that finds a task of its own already started submits nothing.
const file = async () => {
    const {startImageDriveExport$} = await import('#gee/jobs/task/export/imageDriveExport')
    const {castToLargest} = await import('#gee/jobs/task/export/castToLargest')
    const ImageFactory = (await import('#sepal/ee/imageFactory')).default
    const {withOutputBands} = await import('#sepal/ee/outputBands')
    const folder = scratchName('file')
    const started = (await runTasks()).filter(({description}) => description === folder)
    assert.deepEqual(started, [], `This run has started its export already; reconnect with file-status: ${JSON.stringify(started)}`)
    const input = await ensureOpticalInput()
    const before = {sepal: await driveFolderExists('SEPAL'), exports: await driveFolderExists(DRIVE_EXPORTS)}
    observations = controlledObservations('optical')
    const recipe = phenologyRecipe(folder, 'optical')
    const bands = {selection: PHENOLOGY_BANDS.map(({name}) => name)}
    const expected = await inScope(() => as(ImageFactory(recipe, withOutputBands(bands)).getImage$().pipe(
        switchMap(image => {
            const cast = castToLargest(image)
            return ee.getInfo$(ee.Dictionary({samples: sample(cast), names: cast.bandNames(), types: cast.bandTypes()}), 'Sample file image')
        })
    )))
    const {eeTaskId} = await inScope(() => as(startImageDriveExport$(
        {image: {recipe, bands, driveFolder: folder, scale: 30}},
        {sepalUser: sepalUser()}
    )))
    console.info(JSON.stringify({submitted: {taskId: eeTaskId, destination: `${DRIVE_EXPORTS}/${folder}`, fileNamePrefix: folder, before}}))
    return {input, expected, ...await fileOutcome(eeTaskId, folder)}
}

// The Optical Classification's input: an asset of this run with the bands it includes, which readiness reads.
const ensureOpticalInput = async () => {
    const assetId = scratchId('input')
    try {
        await as(ee.getAssetRecord$(assetId, 0))
        return {assetId, created: false}
    } catch (error) {
        if (error.eeStatusCode !== 404) {
            throw error
        }
    }
    const serverConfig = ee.batch.Export.convertToServerParams({
        image: ee.Image.constant([0.1, 0.3]).rename(['red', 'nir']).float(),
        description: scratchName('input'),
        assetId,
        region: AREA(),
        scale: 30,
        crs: 'EPSG:4326',
        maxPixels: 1e6
    }, ee.data.ExportDestination.ASSET, ee.data.ExportType.IMAGE)
    const taskId = await as(ee.startImageExport$(ee.batch.ExportTask.create(serverConfig), `export ${assetId}`))
    console.info(JSON.stringify({submitted: {taskId, destination: assetId}}))
    const task = await awaitTask(taskId)
    assert.equal(task.state, 'COMPLETED', JSON.stringify(task))
    return {assetId, created: true, task}
}

const fileStatus = async () => {
    const taskId = process.env.REG_EXPORT_TASK
    assert.ok(taskId, 'REG_EXPORT_TASK names the task file submitted')
    return await fileOutcome(taskId, scratchName('file'))
}

// Waits without cancelling, then downloads what production lists for the destination.
const fileOutcome = async (taskId, folder) => {
    const {listDownloads$} = await import('#gee/jobs/task/storage/destination')
    const task = await awaitTask(taskId)
    if (task.state !== 'COMPLETED') {
        return {status: task.state, task}
    }
    const {files} = await firstValueFrom(listDownloads$({type: 'drive', folder}, {sepalUser: sepalUser()}))
    const directory = `/tmp/${scratchFolder().split('/').pop()}`
    await mkdir(directory, {recursive: true})
    const downloaded = []
    for (const {name, size, url, headers} of files) {
        const response = await fetch(url, {headers})
        assert.ok(response.ok, `${name}: HTTP ${response.status}`)
        const path = `${directory}/${name}`
        await writeFile(path, Buffer.from(await response.arrayBuffer()))
        downloaded.push({name, size, path})
    }
    return {status: 'DOWNLOADED', task, files: downloaded}
}

const fileCleanup = async () => {
    const {cleanupDestination$} = await import('#gee/jobs/task/storage/destination')
    const folder = `${DRIVE_EXPORTS}/${scratchName('file')}`
    const permission = await deletionGuard()
    if (!permission.allowed) {
        return {status: 'SKIPPED', reason: permission.reason, tasks: permission.tasks}
    }
    await lastValueFrom(cleanupDestination$({type: 'drive', folder: scratchName('file')}, {sepalUser: sepalUser()}))
    return {status: 'DONE', folder, remains: await driveFolderExists(folder), exportsRemain: await driveFolderExists(DRIVE_EXPORTS)}
}

const awaitTask = async taskId => {
    const startedAt = Date.now()
    for (;;) {
        const status = await as(ee.getTaskStatus$(taskId, 'Export status', 0))
        if (isTerminal(status.state) || Date.now() - startedAt > FILE_WAIT_MS) {
            return {taskId, state: status.state, error: status.error_message, seconds: (Date.now() - startedAt) / 1000}
        }
        await sleep(TASK_POLL_MS)
    }
}

const runTasks = async () => (await as(ee.listOperations$()))
    .map(({name, metadata = {}}) => ({task: name.split('/').pop(), state: metadata.state, description: metadata.description}))
    .filter(({description}) => String(description || '').startsWith(`${RUN_ID}_`))

// Only "not found" is absence: anything else Drive answers is a failure to find out.
const driveFolderExists = async path => {
    try {
        await firstValueFrom(drive({sepalUser: sepalUser()}).listFiles$({path}))
        return true
    } catch (error) {
        if (error instanceof NotFoundException) {
            return false
        }
        throw error
    }
}

const sepalUser = () => ({
    username: 'verify-user',
    googleTokens: {accessToken: credentials.access_token, accessTokenExpiryDate: Number(credentials.access_token_expiry_date)}
})

const cleanup = async () => {
    const parent = scratchFolder()
    const result = await cleanupScratch({parent, guard: deletionGuard, listAssets, deleteAsset, owns: ownedByThisRun})
    const folder = result.status === 'DONE' && result.remainingListed === 0
        ? await deleteAsset(parent)
        : {status: 'KEPT'}
    return {parent, ...result, folder}
}

const imageFindings = ({expected, written, types, encoding, record, compatibility}) => {
    const {formerlyClipped, negative, masked} = written
    for (const [name, value] of Object.entries(expected.formerlyClipped)) {
        assert.equal(formerlyClipped[name], value, `${name} at the formerly clipped point`)
        assert.equal(negative[name], expected.negative[name], `${name} at the negative point`)
    }
    assert.deepEqual(masked, expected.masked)
    assert.ok(formerlyClipped.median > 32767, `median ${formerlyClipped.median} is within int16`)
    assert.ok(negative.median < 0 && !Number.isInteger(negative.median), `median ${negative.median} is not negative and fractional`)
    for (const name of ['median', 'background', 'amplitude', 'median_1', 'offset_1', 'slope_1']) {
        assert.equal(types[name].precision, 'FLOAT', `${name} is ${types[name].precision}`)
    }
    for (const name of ['dayOfYear_1', 'days_1']) {
        assert.equal(types[name].precision, 'INT', `${name} is ${types[name].precision}`)
        assert.ok(Number.isInteger(formerlyClipped[name]), `${name} ${formerlyClipped[name]} is not an integer`)
    }
    assert.equal(record.properties.sepal_regression_precision, '{"version":1,"scales":[1]}')
    assert.equal(record.properties.sepal_regression_schema, compatibility.schema)
    for (const name of Object.keys(types)) {
        assert.deepEqual(encoding[name], /^(dayOfYear|days)_/.test(name) ? undefined : {scale: 1, offset: 0}, `${name} encoding`)
    }
    return {
        median: {formerlyClipped: formerlyClipped.median, negative: negative.median, masked: masked.median},
        publicMedian: {formerlyClipped: formerlyClipped.median * (encoding.median?.scale ?? 1), negative: negative.median * (encoding.median?.scale ?? 1)},
        timing: {dayOfYear_1: formerlyClipped.dayOfYear_1, days_1: formerlyClipped.days_1},
        types: Object.fromEntries(['median', 'amplitude', 'offset_1', 'dayOfYear_1', 'days_1'].map(name => [name, types[name]])),
        encoding: Object.fromEntries(['median', 'amplitude', 'offset_1', 'dayOfYear_1'].map(name => [name, encoding[name] ?? null])),
        precision: record.properties.sepal_regression_precision,
        schemaMatchesSource: record.properties.sepal_regression_schema === compatibility.schema
    }
}

const describeRecord = ({name, type, updateTime, bands, properties}) => ({
    name,
    type,
    updateTime,
    bands: bands.length,
    regression: {precision: properties.sepal_regression_precision, schema: properties.sepal_regression_schema}
})

// Radar regression observations in target units, as the collection stores them: 40000.75 west (beyond int16),
// -1.8755 (the reviewed fixture's negative centre) in the middle, masked east.
// Optical observations are the same targets, 40.00075 and -1.8755, stored ×1,000 as its collection stores them.
const controlledObservations = (family = 'radar') => {
    const longitude = ee.Image.pixelLonLat().select('longitude')
    return ee.ImageCollection(Array.from({length: 36}, (_value, i) => {
        const seasonal = 0.02 * Math.sin(2 * Math.PI * i / 12)
        const value = family === 'optical'
            ? ee.Image(-1.8755 + seasonal).where(longitude.lt(-0.0005), 40.00075 + seasonal).float().multiply(1000).float()
            : ee.Image(-1.8755 + seasonal).where(longitude.lt(-0.0005), 40000.75 + 1000 * seasonal).float()
        return value
            .rename('regression')
            .updateMask(longitude.lt(0.0005))
            .clip(AREA())
            .set('system:time_start', ee.Date.fromYMD(2020 + Math.floor(i / 12), i % 12 + 1, 15).millis())
    }))
}

const exportRequest = ({title, assetId, strategy}) => ({
    image: {
        recipe: phenologyRecipe(title),
        bands: {selection: PHENOLOGY_BANDS.map(({name}) => name)},
        scale: 30,
        assetId,
        strategy,
        properties: {}
    }
})

const RADAR_OPTIONS = {
    orbits: ['DESCENDING'],
    geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'NONE',
    multitemporalSpeckleFilter: 'NONE',
    outlierRemoval: 'NONE',
    orbitNumbers: 'ALL',
    minObservations: 1
}

const ccdcRecipe = () => ({
    id: `${RUN_ID}-ccdc`,
    type: 'CCDC',
    title: scratchName('ccdc'),
    model: {
        aoi: {type: 'POLYGON', path: [[-60.050, -3.120], [-60.046, -3.120], [-60.046, -3.118], [-60.050, -3.118]]},
        dates: {startDate: '2020-01-01', endDate: '2022-01-01'},
        sources: {dataSets: {SENTINEL_1: ['SENTINEL_1']}, classification: CLASSIFICATION_ID, breakpointBands: ['regression']},
        options: RADAR_OPTIONS,
        ccdcOptions: {dateFormat: 1, minObservations: 4, chiSquareProbability: 0.9, minNumOfYearsScaler: 1.33, lambda: 20, maxIterations: 10000}
    }
})

const phenologyRecipe = (title, family = 'radar') => ({
    id: `${RUN_ID}-phenology`,
    type: 'PHENOLOGY',
    title,
    model: {
        aoi: {type: 'POLYGON', path: [[-0.002, -0.002], [0.002, -0.002], [0.002, 0.002], [-0.002, 0.002]]},
        dates: {fromYear: 2020, toYear: 2022},
        sources: family === 'optical'
            ? {dataSets: {LANDSAT: ['LANDSAT_8']}, classification: OPTICAL_CLASSIFICATION_ID, band: 'regression'}
            : {dataSets: {SENTINEL_1: ['SENTINEL_1']}, classification: CLASSIFICATION_ID, band: 'regression'},
        options: {}
    }
})

// One descending Sentinel-1 scene over Manaus, whose VV and VH the radar time series supplies.
const SCENE = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20210607T093924_20210607T093949_038232_04830A_3468'

// Water, forest and city, with fractional and negative regression targets.
const REFERENCE_DATA = [
    [-60.02, -3.13, -1.875], [-60.03, -3.14, -1.5], [-60.01, -3.135, -1.25],
    [-60.30, -2.80, 0.125], [-60.31, -2.81, 0.375], [-60.29, -2.79, 0.25],
    [-60.00, -3.05, 2.5], [-60.01, -3.06, 2.75], [-59.99, -3.07, 2.625]
].map(([x, y, value]) => ({x, y, class: value}))

const CLASSIFICATION = {
    id: CLASSIFICATION_ID,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [{imageId: 'image-1', type: 'ASSET', id: SCENE, bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['VV', 'VH']}]}]},
        legend: {entries: [1, 2].map(value => ({id: `entry-${value}`, value, label: `class ${value}`, color: '#000000'}))},
        trainingData: {dataSets: [{dataSetId: 'points', type: 'SAMPLE_CLASSIFICATION', referenceData: REFERENCE_DATA}]},
        auxiliaryImagery: [],
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 5, variablesPerSplit: null, minLeafPopulation: 1, bagFraction: 0.5, maxNodes: null, seed: 1},
        scale: 30
    }
}

// What readiness reads of an Optical one: features an optical collection supplies, from this run's input asset.
// `file` never classifies with it.
const opticalClassification = () => ({
    ...CLASSIFICATION,
    id: OPTICAL_CLASSIFICATION_ID,
    model: {
        ...CLASSIFICATION.model,
        inputImagery: {images: [{imageId: 'image-1', type: 'ASSET', id: scratchId('input'), bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]}
    }
})

const recordOf = id => id === CLASSIFICATION_ID
    ? CLASSIFICATION
    : id === OPTICAL_CLASSIFICATION_ID ? opticalClassification() : null

const inScope = fn => {
    const scope = new RecipeScope(id => of(recordOf(id)))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

const sample = image => {
    const at = ([x, y]) => image.reduceRegion({reducer: ee.Reducer.first(), geometry: ee.Geometry.Point([x, y]), scale: 30})
    return ee.Dictionary(Object.fromEntries(Object.entries(POINTS).map(([name, point]) => [name, at(point)])))
}

const as = call$ => lastValueFrom(inEEContext(user, call$), {defaultValue: null})

const waitForTask = async taskId => {
    const startedAt = Date.now()
    for (;;) {
        const status = await as(ee.getTaskStatus$(taskId, 'Export status', 0))
        if (isTerminal(status.state)) {
            return {taskId, state: status.state, error: status.error_message, seconds: (Date.now() - startedAt) / 1000}
        }
        if (Date.now() - startedAt > TASK_TIMEOUT_MS) {
            return {taskId, ...await cancelAndConfirm(taskId)}
        }
        await sleep(TASK_POLL_MS)
    }
}

// A cancellation request is not a cancellation: until a terminal state is confirmed the task may still write.
const cancelAndConfirm = async taskId => {
    await as(ee.cancelTask$(taskId, 'Cancel export', 0))
    const confirmBy = Date.now() + CANCEL_CONFIRM_MS
    for (;;) {
        const status = await as(ee.getTaskStatus$(taskId, 'Export status', 0))
        if (isTerminal(status.state)) {
            return {state: status.state, cancellation: 'CONFIRMED'}
        }
        if (Date.now() >= confirmBy) {
            return {state: 'CANCELLATION_UNCONFIRMED', cancellation: 'UNCONFIRMED'}
        }
        await sleep(TASK_POLL_MS)
    }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

// probeRun's guard reads ee.data's listing shape; this run's tasks are listed through the user's REST context.
const deletionGuard = createDeletionGuard({
    runId: RUN_ID,
    data: {listOperations: (_limit, callback) => as(ee.listOperations$()).then(operations => callback(operations), error => callback(null, error))}
})

const listAssets = async parent => {
    try {
        const assets = []
        let pageToken
        do {
            const page = await as(ee.listAssetsPage$(parent, pageToken, 0))
            assets.push(...(page.assets || []).map(({name, id, type}) => ({id: name || id, type})))
            pageToken = page.nextPageToken
        } while (pageToken)
        return {status: 'OK', assets}
    } catch (error) {
        return {...failure(error), parent}
    }
}

const deleteAsset = async assetId => {
    try {
        await as(ee.deleteAsset$(assetId, 0))
        return {status: 'DELETED'}
    } catch (error) {
        return failure(error)
    }
}

const ownedByThisRun = id => String(id).startsWith(`${scratchFolder()}/${RUN_ID}_`)

const scratchFolder = () => `projects/${user.projectId}/assets/sepal_regression_export_${RUN_ID}`

const scratchName = suffix => `${RUN_ID}_${suffix}`

const scratchId = suffix => `${scratchFolder()}/${scratchName(suffix)}`

// Credentials arrive on stdin as one line of JSON, never as an argument or an environment variable.
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

const authenticate = async () => {
    if (process.stdin.isTTY) {
        throw new Error('Linked-user credential receiver must not be a TTY')
    }
    credentials = await readCredentialsFromStdin()
    if (!credentials.access_token || !credentials.project_id) {
        throw new Error('Linked-user authorization is incomplete')
    }
    if (Number(credentials.access_token_expiry_date) <= Date.now()) {
        throw new Error('Linked-user authorization is expired')
    }
    const client = new EERestClient({ee, http: {get$, postJson$, patchJson$, delete$}, limiter$: eeLimiter$, serviceAccountToken$})
    const runtime = new EERestRuntime({ee, serviceAccountToken$, projectId: googleProjectId, createTransport: () => client})
    await lastValueFrom(runtime.ready$(), {defaultValue: null})
    user = {
        requestId: `verify-regression-${RUN_ID}`,
        username: 'verify-user',
        auth: {type: 'user', accessToken: credentials.access_token, expiresAt: Number(credentials.access_token_expiry_date)},
        projectId: credentials.project_id,
        workloadTag: 'sepal-work-verify',
        endpoint: DEFAULT_EE_ENDPOINT
    }
    await firstValueFrom(inEEContext(user, ee.getInfo$(ee.Number(1), 'Linked-user check')))
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error?.stack || String(error))
    process.exit(1)
})
