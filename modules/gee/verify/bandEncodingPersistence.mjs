// Whether the band encoding an export establishes survives as Earth Engine asset metadata, for a payload larger
// than one property holds.
//
// The representation, the property writer and the reader are production's own: encodingProperties() splits and
// names the parts, replaceAssetProperties$ writes the collection's, and assetBandEvidence/encodingFromProperties
// read them back in one evaluation. Only the image and the region are fixtures, because nothing here depends on
// pixels.
//
// Not a test. Nothing runs it automatically; it needs Earth Engine credentials, writes assets and starts batch
// tasks. See README.md. Modes are selected with EE_ENC_MODE; main() lists them.

import {firstValueFrom} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {assetBandEvidence} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {
    bandsWithEncoding,
    clearedEncodingProperties,
    ENCODING_PROPERTY,
    encodingFromProperties,
    encodingProperties,
    encodingPropertyKeys
} from '#sepal/recipe/output/bandEncoding'
import {sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'

import {failure, failureKind} from './eeFailures.mjs'
import {cleanupScratch, createDeletionGuard, isTerminal, runMode} from './probeRun.mjs'

const NAMESPACE = process.env.EE_ENC_NAMESPACE || 'sepal_band_encoding_persistence'
const RUN_ID = process.env.EE_ENC_RUN || 'run1'
const MEASURES = Number(process.env.EE_ENC_MEASURES || 24)
const TASK_POLL_MS = 5000
const TASK_TIMEOUT_MS = Number(process.env.EE_ENC_TASK_TIMEOUT_MS || 15 * 60 * 1000)
const CANCEL_CONFIRM_MS = Number(process.env.EE_ENC_CANCEL_CONFIRM_MS || 2 * 60 * 1000)

// One pixel on an explicit grid: the export must be as close to free as an export gets.
const CRS = 'EPSG:4326'
const CRS_TRANSFORM = [0.01, 0, 0, 0, -0.01, 0.02]
const REGION = () => ee.Geometry({
    type: 'Polygon',
    coordinates: [[[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02], [0, 0]]]
}, CRS, false)

const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
const THERMAL = {scale: 0.1, offset: -273.15, unit: 'K'}

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message)
    }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})

const bytes = value => Buffer.byteLength(String(value), 'utf8')

const deletionGuard = createDeletionGuard({runId: RUN_ID, data: ee.data})

const main = async () => {
    const mode = process.env.EE_ENC_MODE || 'plan'
    const modes = {
        plan: {run: plan, offline: true},
        image: {run: image, createsFixtures: true},
        collection: {run: collection, createsFixtures: true},
        rewrite: {run: rewrite, createsFixtures: true},
        read: {run: read},
        cleanup: {run: cleanup}
    }
    const result = await runMode({modes, mode, authenticate, provisionStorage: () => ensureFolder(scratchFolder())})
    console.log(JSON.stringify({mode, runId: RUN_ID, ...result}, null, 2))
}

const plan = async () => ({
    status: 'PLAN',
    namespace: NAMESPACE,
    payload: describePayload(),
    assets: {image: scratchId('image'), collection: scratchId('collection')}
})

// One tiny image carrying the fixture's own bands, exported the way a task exports one: the encoding on the
// image, written by the batch export.
const image = async () => {
    const assetId = scratchId('image')
    const encoding = payload()
    const properties = encodingProperties(encoding)
    await deleteIfOwned(assetId)
    const task = await runImageExport({
        assetId,
        properties,
        bands: Object.keys(encoding),
        description: `${scratchName('image')}-${Date.now()}`
    })
    if (task.taskState !== 'COMPLETED') {
        return {status: task.taskState, assetId, task, payload: describePayload()}
    }
    return {
        status: 'DONE',
        assetId,
        task,
        payload: describePayload(),
        written: summarize(properties),
        readback: await compareReadback(assetId, encoding)
    }
}

// A collection whose properties production's own writer sets, plus one tile carrying the same encoding.
const collection = async () => {
    const assetId = scratchId('collection')
    const tileId = `${assetId}/0`
    const encoding = payload()
    const properties = encodingProperties(encoding)
    await deleteCollectionIfOwned(assetId)
    await callbackPromise(callback =>
        ee.data.createAsset({type: 'ImageCollection'}, assetId, false, null, (result, error) => callback(result, error))
    )
    await firstValueFrom(ee.replaceAssetProperties$(assetId, {...properties, run: RUN_ID}, 0))
    const task = await runImageExport({
        assetId: tileId,
        properties,
        bands: Object.keys(encoding),
        description: `${scratchName('tile')}-${Date.now()}`
    })
    if (task.taskState !== 'COMPLETED') {
        return {status: task.taskState, assetId, tileId, task, payload: describePayload()}
    }
    return {
        status: 'DONE',
        assetId,
        tileId,
        task,
        payload: describePayload(),
        written: summarize(properties),
        collectionReadback: await compareReadback(assetId, encoding),
        tileReadback: await compareReadback(tileId, encoding),
        // What a consumer of the collection sees: the reader copies the collection's properties onto the image.
        collectionProperties: partNames(await getAssetProperties(assetId))
    }
}

// Exporting an image that already carries an encoding, with a smaller one: the parts the new manifest does not
// name have to be gone from the new asset, not merely unnamed. Run after `image`, whose asset it re-exports.
const rewrite = async () => {
    const source = scratchId('image')
    const assetId = scratchId('rewritten')
    const encoding = {[Object.keys(payload())[0]]: REFLECTANCE}
    const carried = await callbackPromise(callback =>
        ee.Image(source).toDictionary(encodingPropertyKeys()).evaluate((result, error) => callback(result, error))
    )
    const stated = encodingProperties(encoding)
    const properties = {...clearedEncodingProperties(Object.keys(carried), stated), ...stated}
    await deleteIfOwned(assetId)
    const task = await runImageExport({
        assetId,
        properties,
        bands: Object.keys(encoding),
        description: `${scratchName('rewritten')}-${Date.now()}`,
        source
    })
    if (task.taskState !== 'COMPLETED') {
        return {status: task.taskState, assetId, task}
    }
    const written = await getAssetProperties(assetId)
    return {
        status: 'DONE',
        assetId,
        task,
        carriedBySource: Object.keys(carried).sort(),
        cleared: Object.keys(properties).filter(key => properties[key] === null),
        assetEncodingProperties: partNames(written),
        obsoleteRemoved: !partNames(written).some(key => !Object.keys(stated).includes(key)),
        readback: await compareReadback(assetId, encoding)
    }
}

// Read-only: what an asset written by any release states now, as this release reads it. EE_ENC_ASSET names it.
const read = async () => {
    const assetId = process.env.EE_ENC_ASSET
    assert(assetId, 'EE_ENC_ASSET is required')
    const image = await firstValueFrom(ImageFactory({type: 'ASSET', id: assetId}).getImage$())
    const evidence = await callbackPromise(callback =>
        assetBandEvidence(image, {encodingProperties: encodingPropertyKeys()}).evaluate((result, error) =>
            callback(result, error)
        )
    )
    const encoding = encodingFromProperties(evidence.encoding)
    return {
        status: 'DONE',
        assetId,
        bands: evidence.bands.map(({name}) => name),
        propertiesRead: partNames(evidence.encoding),
        storedVersion: JSON.parse(evidence.encoding[Object.keys(evidence.encoding).find(key => key === 'sepal_band_encoding')] || 'null')?.version,
        encodedBands: Object.keys(encoding).length,
        encoding
    }
}

const cleanup = async () => {
    const parent = scratchFolder()
    return {parent, ...await cleanupScratch({parent, guard: deletionGuard, listAssets, deleteAsset, owns: ownedByThisRun})}
}

// The bands a slice of MEASURES measures produces, encoded as a payload of the size a real one would have.
// The encodings are fixtures: CCDC Slice declares none, and this measures storage, not meaning.
const payload = () => {
    const base = Array.from({length: MEASURES}, (_value, index) => `measure_${index + 1}`)
    const physical = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', ...base.map(name => `${name}_coefs`)]
    const model = {date: {dateType: 'SINGLE'}, options: {gapStrategy: 'INTERPOLATE', harmonics: 3}}
    const names = sliceOutputBands(physical, model).filter(name => base.some(measure => name.startsWith(measure)))
    return Object.fromEntries(names.map((name, index) => [name, index % 7 === 0 ? THERMAL : REFLECTANCE]))
}

const describePayload = () => {
    const encoding = payload()
    const properties = encodingProperties(encoding)
    return {
        bands: Object.keys(encoding).length,
        inlineBytes: bytes(JSON.stringify(encoding)),
        properties: Object.keys(properties).length,
        largestPropertyBytes: Math.max(...Object.values(properties).map(bytes))
    }
}

const summarize = properties => Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, {bytes: bytes(value)}])
)

const partNames = properties => Object.keys(properties).filter(key => key.startsWith('sepal_band_encoding')).sort()

// Read back the way production reads an asset: through the image factory, which mosaics a collection and copies
// its properties onto the image it returns, then the bands and every encoding property in one evaluation, joined
// band by band by bandsWithEncoding - the association a consumer actually sees.
const compareReadback = async (assetId, expected) => {
    const image = await firstValueFrom(ImageFactory({type: 'ASSET', id: assetId}).getImage$())
    const evidence = await callbackPromise(callback =>
        assetBandEvidence(image, {encodingProperties: encodingPropertyKeys()}).evaluate((result, error) =>
            callback(result, error)
        )
    )
    const described = bandsWithEncoding(evidence.bands, evidence.encoding)
    const expectedNames = Object.keys(expected)
    const actualNames = described.map(({name}) => name)
    const mismatched = described.filter(({name, encoding}) =>
        JSON.stringify(encoding) !== JSON.stringify(expected[name])
    )
    const missing = expectedNames.filter(name => !actualNames.includes(name))
    return {
        expectedBands: expectedNames.length,
        assetBands: actualNames.length,
        bandNamesMatch: JSON.stringify(actualNames) === JSON.stringify(expectedNames),
        encodedBands: described.filter(({encoding}) => encoding).length,
        identical: mismatched.length === 0 && missing.length === 0 && actualNames.length === expectedNames.length,
        mismatched: mismatched.slice(0, 5).map(({name, encoding}) => ({name, encoding, expected: expected[name]})),
        missing: missing.slice(0, 5),
        propertiesRead: partNames(evidence.encoding),
        storedVersion: JSON.parse(evidence.encoding[ENCODING_PROPERTY] || 'null')?.version,
        // Nothing but the encoding this export stated may remain on the asset.
        obsoleteProperties: partNames(evidence.encoding).filter(key =>
            !Object.keys(encodingProperties(expected)).includes(key)
        ),
        sample: described.slice(0, 2)
    }
}

const runImageExport = async ({assetId, properties, bands, description, source}) => {
    const startedAt = Date.now()
    let taskId
    try {
        // A source asset is re-exported as it is, so the export carries whatever properties it holds.
        const base = source
            ? ee.Image(source).select(bands)
            : ee.Image.constant(bands.map((_name, index) => index % 251)).toByte().rename(bands)
        const exported = base.set(properties)
        const task = ee.batch.Export.image.toAsset({
            image: exported,
            description,
            assetId,
            region: REGION(),
            crs: CRS,
            crsTransform: CRS_TRANSFORM,
            maxPixels: 1e6
        })
        taskId = await callbackPromise(callback =>
            ee.data.startProcessing(null, task.config_, (result, error) => callback(result, error))
        ).then(result => result.taskId)
    } catch (error) {
        return {phase: 'SUBMIT', taskState: 'SUBMIT_FAILED', error: String(error?.message || error)}
    }
    const outcome = await waitForTask(taskId)
    return {phase: 'TASK', taskId, ...outcome, elapsedSeconds: (Date.now() - startedAt) / 1000}
}

const taskState = async taskId => {
    const [status] = await callbackPromise(callback =>
        ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
    )
    return status
}

const waitForTask = async taskId => {
    const startedAt = Date.now()
    for (;;) {
        const status = await taskState(taskId)
        if (isTerminal(status.state)) {
            return {taskState: status.state, error: status.error_message}
        }
        if (Date.now() - startedAt > TASK_TIMEOUT_MS) {
            return await cancelAndConfirm(taskId)
        }
        await sleep(TASK_POLL_MS)
    }
}

// A cancellation request is not a cancellation: until a terminal state is confirmed the task may still write.
const cancelAndConfirm = async taskId => {
    await callbackPromise(callback => ee.data.cancelTask(taskId, (result, error) => callback(result, error)))
    const confirmBy = Date.now() + CANCEL_CONFIRM_MS
    for (;;) {
        const status = await taskState(taskId)
        if (isTerminal(status.state)) {
            return {taskState: status.state, cancellation: 'CONFIRMED'}
        }
        if (Date.now() >= confirmBy) {
            return {taskState: 'CANCELLATION_UNCONFIRMED', cancellation: 'UNCONFIRMED'}
        }
        await sleep(TASK_POLL_MS)
    }
}

const getAssetProperties = async assetId => {
    const asset = await callbackPromise(callback => ee.data.getAsset(assetId, (result, error) => callback(result, error)))
    return asset.properties || {}
}

const listAssets = async parent => {
    const assets = []
    let pageToken
    do {
        let page
        try {
            page = await callbackPromise(callback =>
                ee.data.listAssets(parent, pageToken ? {pageToken} : {}, (result, error) => callback(result, error))
            )
        } catch (error) {
            return {...failure(error), parent, listed: assets.length}
        }
        const values = page?.Serializable$values || page || {}
        assets.push(...(values.assets || []).map(asset => {
            const {id, name, type} = asset?.Serializable$values || asset
            return {id: name || id, type}
        }))
        pageToken = values.nextPageToken
    } while (pageToken)
    return {status: 'OK', assets}
}

// Only a delete Earth Engine accepted is a deletion. A refusal is carried as it was classified, with what Earth
// Engine said: NOT_VISIBLE is not evidence that the asset is gone.
const deleteAsset = async assetId => {
    try {
        await callbackPromise(callback => ee.data.deleteAsset(assetId, (result, error) => callback(result, error)))
        return {status: 'DELETED'}
    } catch (error) {
        return failure(error)
    }
}

const deleteIfOwned = async assetId => {
    await assertDeletable(assetId)
    return await clearForFixture(assetId)
}

const deleteCollectionIfOwned = async assetId => {
    await assertDeletable(assetId)
    const children = await listAssets(assetId)
    if (children.status === 'OK') {
        for (const child of children.assets) {
            await clearForFixture(child.id)
        }
    }
    return await clearForFixture(assetId)
}

// A rerun clears its own destinations, which is the same decision cleanup makes: this run's asset, and only
// once Earth Engine says no task of this run may still be writing to it.
const assertDeletable = async assetId => {
    assert(ownedByThisRun(assetId), `Refusing to delete an asset this run does not own: ${assetId}`)
    const guard = await deletionGuard()
    assert(guard.allowed, `Refusing to delete ${assetId}: ${guard.reason} (${JSON.stringify(guard.tasks)})`)
}

// A fixture is written next, and writing cannot overwrite an existing asset, so a destination Earth Engine did
// not show us is left to that attempt to settle. Nothing here treats it as removed.
const clearForFixture = async assetId => {
    const removal = await deleteAsset(assetId)
    assert(['DELETED', 'NOT_VISIBLE'].includes(removal.status),
        `Cannot clear ${assetId} (${removal.status}): ${removal.error}`)
    return removal
}

const ownedByThisRun = id => String(id).includes(NAMESPACE) && String(id).split('/').pop().startsWith(`${RUN_ID}_`)
    || String(id).includes(`${NAMESPACE}/${RUN_ID}_`)

const scratchFolder = () => `projects/${ee.data.getProject()}/assets/${NAMESPACE}`

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
    let projectId = googleProjectId
    if (process.env.EE_ENC_SERVICE_ACCOUNT === '1') {
        await callbackPromise(callback =>
            ee.data.authenticateViaPrivateKey(serviceAccountCredentials, callback, error => callback(null, error))
        )
    } else {
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
    }
    await callbackPromise(callback =>
        ee.initialize(null, null, callback, error => callback(null, error), null, projectId)
    )
    ee.setMaxRetries(0)
}

// A folder is created only because a fixture is about to be written into it. Anything else about the listing
// failing is a failure to find out, and creating a folder on that belief would hide it.
const ensureFolder = async folderId => {
    try {
        await callbackPromise(callback => ee.data.getAsset(folderId, (result, error) => callback(result, error)))
        return
    } catch (error) {
        const kind = failureKind(error)
        assert(kind === 'NOT_VISIBLE', `Cannot tell whether ${folderId} exists (${kind}): ${error?.message || error}`)
    }
    await callbackPromise(callback => ee.data.createFolder(folderId, false, (result, error) => callback(result, error)))
}

main().catch(error => {
    console.error(error?.stack || String(error))
    process.exit(1)
})
