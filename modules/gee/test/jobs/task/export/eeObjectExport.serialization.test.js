import assert from 'node:assert/strict'
import {before, mock, test} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

import ee from '#sepal/ee/ee'

import {initializeOfflineEE} from '../../../support/eeOffline.js'

let exported
const start = options => {
    exported = options
    return of({eeTaskId: 'offline'})
}
mock.module('#gee/jobs/task/export/toAsset', {
    exports: {startImageToAssetExport$: start, startTableToAssetExport$: start}
})
mock.module('#gee/jobs/task/export/toDrive', {
    exports: {startImageToDriveExport$: start}
})
mock.module('#gee/jobs/task/export/eeObjectTableDriveExport', {
    exports: {startTableToDriveExport$: start}
})
mock.module('#gee/jobs/task/export/toWorkspace', {
    exports: {startImageToWorkspaceExport$: start, startTableToWorkspaceExport$: start}
})

const {startEEObjectExport$} = await import('#gee/jobs/task/export/eeObjectExport')
before(initializeOfflineEE)

test('the real Earth Engine decoder accepts Cloud API image and region dictionaries', async () => {
    await lastValueFrom(startEEObjectExport$({description: 'image', export: {
        kind: 'IMAGE', destination: 'GEE', assetId: 'projects/p/assets/out', scale: 30,
        expression: {result: '0', values: {'0': {functionInvocationValue: {
            functionName: 'Image.load', arguments: {id: {constantValue: 'projects/p/assets/input'}}
        }}}},
        region: {result: '0', values: {'0': {functionInvocationValue: {
            functionName: 'GeometryConstructors.Polygon',
            arguments: {coordinates: {constantValue: [[[0, 0], [1, 0], [1, 1], [0, 0]]]}}
        }}}}
    }}))

    assert.ok(exported.image instanceof ee.Image)
    assert.deepEqual(JSON.parse(exported.image.args.id.serialize()), {
        result: '0', values: {'0': {constantValue: 'projects/p/assets/input'}}
    })
    assert.ok(exported.region instanceof ee.Geometry)
    assert.deepEqual(exported.region.args.coordinates, [[[0, 0], [1, 0], [1, 1], [0, 0]]])
})

test('the real Earth Engine decoder accepts Cloud API table dictionaries', async () => {
    await lastValueFrom(startEEObjectExport$({description: 'table', export: {
        kind: 'TABLE', destination: 'GEE', assetId: 'projects/p/assets/out',
        expression: {result: '0', values: {'0': {functionInvocationValue: {
            functionName: 'Collection.loadTable', arguments: {tableId: {constantValue: 'projects/p/assets/input'}}
        }}}}
    }}))

    assert.ok(exported.collection instanceof ee.FeatureCollection)
    assert.equal(exported.collection.args.tableId, 'projects/p/assets/input')
})

for (const destination of ['GEE', 'DRIVE', 'SEPAL']) {
    test(`${destination} retains a polygon mask when exporting on an explicit pixel grid`, async () => {
        const image = ee.Image('projects/p/assets/input')
        const region = ee.Geometry.Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]])
        const crsTransform = [0.01, 0, 0, 0, -0.01, 1]

        await lastValueFrom(startEEObjectExport$({description: 'triangle', export: {
            kind: 'IMAGE', destination, assetId: 'projects/p/assets/out',
            expression: JSON.parse(image.serialize()), region: JSON.parse(region.serialize()),
            crs: 'EPSG:4326', crsTransform
        }}))

        assert.equal(exported.image.func.getSignature().name, 'Image.clip')
        assert.equal(exported.image.args.input.serialize(), image.serialize())
        assert.equal(exported.image.args.geometry.serialize(), region.serialize())
        assert.deepEqual(exported.crsTransform, crsTransform)
    })
}

for (const scaling of [{scale: 30}, {dimensions: '100x100'}]) {
    test(`keeps native bounding-box clipping with ${Object.keys(scaling)[0]}`, async () => {
        const image = ee.Image('projects/p/assets/input')
        const region = ee.Geometry.Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]])

        await lastValueFrom(startEEObjectExport$({description: 'triangle', export: {
            kind: 'IMAGE', destination: 'DRIVE',
            expression: JSON.parse(image.serialize()), region: JSON.parse(region.serialize()), ...scaling
        }}))

        assert.equal(exported.image.serialize(), image.serialize())
        assert.equal(exported.region.serialize(), region.serialize())
    })
}
