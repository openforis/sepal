import assert from 'node:assert/strict'
import {before, describe, test} from 'node:test'

import ee from '#sepal/ee/ee'
import * as requests from '#sepal/ee/rest/eeRequests'

import {answerLibrary, API, initializeOfflineEE, libraryKey, TEST_PROJECT} from '../../support/eeOffline.js'

// Each request built for the REST API is compared with the one the client library itself sends for the same
// operation, so a library upgrade that changes its serialization or naming fails here.

const CONTEXT = {projectId: TEST_PROJECT, workloadTag: 'sepal-work-test'}
const FOLDER = `projects/${TEST_PROJECT}/assets/folder`
const IMAGE_ASSET = `${FOLDER}/image`

before(() => initializeOfflineEE())

describe('a request built for the REST API is the one the client library sends', () => {
    test('computing a value', async () => {
        const image = ee.Image('USGS/SRTMGL1_003').select(['elevation'])

        const library = await withWorkloadTag(CONTEXT.workloadTag, () => libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}/value:compute`, answer: {result: 1}},
            callback => image.getInfo(callback)
        ))

        assert.deepEqual(sent(requests.computeValue(ee, image, CONTEXT)), library)
    })

    test('creating a map with visualization parameters', async () => {
        const image = ee.Image('USGS/SRTMGL1_003')
        const visParams = {bands: ['elevation'], min: 0, max: 3000}

        const library = await withWorkloadTag(CONTEXT.workloadTag, () => libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}/maps?fields=name&workloadTag=${CONTEXT.workloadTag}`, answer: {name: `projects/${TEST_PROJECT}/maps/m1`}},
            callback => image.getMapId({...visParams, format: 'png'}, callback)
        ))

        assert.deepEqual(sent(requests.createMap(ee, image, visParams, CONTEXT)), library)
    })

    test('creating a map of an image styled already', async () => {
        const image = ee.Image('USGS/SRTMGL1_003')

        const library = await withWorkloadTag(CONTEXT.workloadTag, () => libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}/maps?fields=name&workloadTag=${CONTEXT.workloadTag}`, answer: {name: `projects/${TEST_PROJECT}/maps/m1`}},
            callback => image.getMapId({format: 'png'}, callback)
        ))

        assert.deepEqual(sent(requests.createMap(ee, image, null, CONTEXT)), library)
    })

    test('reading an asset', async () => {
        const library = await libraryCall(
            {url: `${API}/v1/${IMAGE_ASSET}?prettyPrint=false`, answer: {name: IMAGE_ASSET, id: IMAGE_ASSET, type: 'IMAGE'}},
            callback => ee.data.getAsset(IMAGE_ASSET, callback)
        )

        assert.deepEqual(sent(requests.getAsset(ee, IMAGE_ASSET)), library)
    })

    test('listing a folder', async () => {
        const library = await libraryCall(
            {url: `${API}/v1/${FOLDER}:listAssets?view=BASIC`, answer: {assets: []}},
            callback => ee.data.listAssets(FOLDER, {view: 'BASIC'}, callback)
        )

        assert.deepEqual(sent(requests.listAssets(ee, FOLDER)), library)
    })

    test('continuing the listing of a folder', async () => {
        const library = await libraryCall(
            {url: `${API}/v1/${FOLDER}:listAssets?pageToken=next-page&view=BASIC`, answer: {assets: []}},
            callback => ee.data.listAssets(FOLDER, {view: 'BASIC', pageToken: 'next-page'}, callback)
        )

        assert.deepEqual(sent(requests.listAssets(ee, FOLDER, 'next-page')), library)
    })

    test('listing the root of a Cloud project', async () => {
        const root = `projects/${TEST_PROJECT}/assets`

        const library = await libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}:listAssets?view=BASIC`, answer: {assets: []}},
            callback => ee.data.listAssets(root, {view: 'BASIC'}, callback)
        )

        assert.deepEqual(sent(requests.listAssets(ee, root)), library)
    })

    test('listing the legacy roots', async () => {
        const library = await libraryCall(
            {url: `${API}/v1/projects/earthengine-legacy:listAssets`, answer: {assets: []}},
            callback => ee.data.listBuckets('projects/earthengine-legacy', callback)
        )

        assert.deepEqual(sent(requests.listBuckets('projects/earthengine-legacy')), library)
    })

    test('deleting an asset', async () => {
        const library = await libraryCall(
            {url: `${API}/v1/${IMAGE_ASSET}`, answer: {}},
            callback => ee.data.deleteAsset(IMAGE_ASSET, callback)
        )

        assert.deepEqual(sent(requests.deleteAsset(ee, IMAGE_ASSET)), library)
    })

    test('moving an asset', async () => {
        const destination = `${FOLDER}/renamed`

        const library = await libraryCall(
            {url: `${API}/v1/${IMAGE_ASSET}:move`, answer: {name: destination, type: 'IMAGE'}},
            callback => ee.data.renameAsset(IMAGE_ASSET, destination, callback)
        )

        assert.deepEqual(sent(requests.moveAsset(ee, IMAGE_ASSET, destination)), library)
    })

    test('creating an image collection', async () => {
        const assetId = `${FOLDER}/collection`
        const library = await libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}/assets?assetId=folder%2Fcollection`, answer: {name: assetId, type: 'IMAGE_COLLECTION'}},
            callback => ee.data.createAsset({type: 'ImageCollection'}, assetId, false, {}, callback)
        )

        assert.deepEqual(sent(requests.createImageCollection(ee, assetId)), library)
    })

    test('creating an image collection with properties', async () => {
        const assetId = `${FOLDER}/collection`
        const properties = {recipe_id: 'r-1', scale: 30}
        const library = await libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}/assets?assetId=folder%2Fcollection`, answer: {name: assetId, type: 'IMAGE_COLLECTION'}},
            callback => ee.data.createAsset({type: 'ImageCollection'}, assetId, false, properties, callback)
        )

        assert.deepEqual(sent(requests.createImageCollection(ee, assetId, properties)), library)
    })

    test('setting and removing asset properties', async () => {
        const properties = {recipe_id: 'r-1', sepal_band_encoding_2: null}
        const library = await libraryCall(
            {url: `${API}/v1/${IMAGE_ASSET}`, answer: {name: IMAGE_ASSET, type: 'IMAGE', properties: {}}},
            callback => ee.data.setAssetProperties(IMAGE_ASSET, properties, callback)
        )

        assert.deepEqual(sent(requests.setAssetProperties(ee, IMAGE_ASSET, properties)), library)
    })

    test('setting system time properties converts them to the asset fields the library sets', async () => {
        const properties = {'system:time_start': 1577836800000, 'system:time_end': 1609459200000, recipe_id: 'r-1'}
        const library = await libraryCall(
            {url: `${API}/v1/${IMAGE_ASSET}`, answer: {name: IMAGE_ASSET, type: 'IMAGE', properties: {}}},
            callback => ee.data.setAssetProperties(IMAGE_ASSET, properties, callback)
        )

        assert.deepEqual(sent(requests.setAssetProperties(ee, IMAGE_ASSET, properties)), library)
    })

    test('removing a property together with a system property', async () => {
        const properties = {'system:time_start': 1577836800000, sepal_band_encoding_2: null, stale: undefined}
        const library = await libraryCall(
            {url: `${API}/v1/${IMAGE_ASSET}`, answer: {name: IMAGE_ASSET, type: 'IMAGE', properties: {}}},
            callback => ee.data.setAssetProperties(IMAGE_ASSET, properties, callback)
        )

        assert.deepEqual(sent(requests.setAssetProperties(ee, IMAGE_ASSET, properties)), library)
    })

    test('creating a folder', async () => {
        const parent = `projects/${TEST_PROJECT}/assets`

        const library = await libraryCall(
            {url: `${API}/v1/${parent}?assetId=new-folder`, answer: {name: `${parent}/new-folder`, type: 'FOLDER'}},
            callback => ee.data.createFolder(`${parent}/new-folder`, false, callback)
        )

        assert.deepEqual(sent(requests.createFolder(parent, 'new-folder')), library)
    })

    test('listing operations', async () => {
        const library = await libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}/operations?pageSize=500`, answer: {operations: []}},
            callback => ee.data.listOperations(undefined, callback)
        )

        assert.deepEqual(sent(requests.listOperations(CONTEXT)), library)
    })

    test('reading an export task\'s status', async () => {
        const library = await libraryCall(
            {url: `${API}/v1/projects/earthengine-legacy/operations/T1`, answer: runningOperation('T1')},
            callback => ee.data.getTaskStatus('T1', callback)
        )

        assert.deepEqual(sent(requests.getOperation(ee, 'T1')), library)
    })

    test('cancelling an export task', async () => {
        const library = await libraryCall(
            {url: `${API}/v1/projects/earthengine-legacy/operations/T1:cancel`, answer: {}},
            callback => ee.data.cancelTask('T1', callback)
        )

        assert.deepEqual(sent(requests.cancelOperation(ee, 'T1')), library)
    })

    test('starting a table export', async () => {
        const collection = ee.FeatureCollection(`projects/${TEST_PROJECT}/assets/table`)
        const libraryTask = ee.batch.Export.table.toDrive(collection, 'description', 'folder', 'prefix', 'CSV', ['a', 'b'])
        libraryTask.id = 'T1'

        const library = await withWorkloadTag(CONTEXT.workloadTag, () => libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}/table:export`, answer: runningOperation('T1')},
            callback => libraryTask.start(() => callback(libraryTask.id), error => callback(null, error))
        ))

        const task = ee.batch.Export.table.toDrive(collection, 'description', 'folder', 'prefix', 'CSV', ['a', 'b'])
        assert.deepEqual(sent(requests.exportTable(ee, task, 'T1', CONTEXT)), library)
    })

    test('starting an image export', async () => {
        const image = ee.Image('USGS/SRTMGL1_003')
        const region = ee.Geometry.Rectangle([0, 0, 1, 1])
        const exportTask = () => ee.batch.Export.image.toAsset(image, 'description', `${FOLDER}/exported`, {'.default': 'sample'}, undefined, region, 30)
        const libraryTask = exportTask()
        libraryTask.id = 'T1'

        const library = await withWorkloadTag(CONTEXT.workloadTag, () => libraryCall(
            {url: `${API}/v1/projects/${TEST_PROJECT}/image:export`, answer: runningOperation('T1')},
            callback => libraryTask.start(() => callback(libraryTask.id), error => callback(null, error))
        ))

        assert.deepEqual(sent(requests.exportImage(ee, exportTask(), 'T1', CONTEXT)), library)
    })
})

test('making an asset public sets a policy granting everyone read access', () => {
    const policy = {bindings: [{role: 'roles/viewer', members: ['allUsers']}]}

    assert.deepEqual(requests.setAssetIamPolicy(IMAGE_ASSET, policy), {
        method: 'POST',
        path: `v1/${IMAGE_ASSET}:setIamPolicy`,
        body: {policy}
    })
})

test('a map is built only from an image', () => {
    const collection = ee.FeatureCollection(`projects/${TEST_PROJECT}/assets/table`)

    assert.throws(
        () => requests.createMap(ee, collection, null, CONTEXT),
        /A map can only be created from an ee\.Image/
    )
})

const runningOperation = taskId => ({
    name: `projects/${TEST_PROJECT}/operations/${taskId}`,
    done: false,
    metadata: {state: 'RUNNING', type: 'EXPORT_FEATURES', description: 'description'}
})

// The one request the library sends for `call`, in comparable form.
const libraryCall = ({url, answer}, call) => new Promise((resolve, reject) => {
    const received = answerLibrary({[url]: answer})
    call((_result, error) => error
        ? reject(new Error(error))
        : resolve(comparable(received[0]))
    )
})

const withWorkloadTag = async (workloadTag, call) => {
    ee.data.setDefaultWorkloadTag(workloadTag)
    try {
        return await call()
    } finally {
        ee.data.resetWorkloadTag(true)
    }
}

const sent = ({method, path, query, body}) =>
    comparable({method, url: libraryKey(`${API}/${path}${query ? `?${new URLSearchParams(query)}` : ''}`), body})

const comparable = ({method, url, body}) => ({method, url: sortedQuery(url), body})

const sortedQuery = value => {
    const url = new URL(value)
    url.searchParams.sort()
    return url.toString()
}
