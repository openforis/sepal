import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

const calls = []
const decoded = []
const selected = []
const IMAGE = {type: 'Image', geometry: () => REGION}
const TABLE = {type: 'FeatureCollection', select: selectors => { selected.push(selectors); return TABLE }}
const REGION = {type: 'Geometry'}
const EXPRESSION = {result: 'image', values: {image: {constantValue: 1}}}
const REGION_EXPRESSION = {result: 'region', values: {region: {constantValue: 2}}}
const USER = {username: 'alice'}
const exporter = name => (options, context) => {
    calls.push({name, options, context})
    return of({eeTaskId: 'T1'})
}

mock.module('#sepal/ee/ee', {
    exports: {default: {
        Deserializer: {decodeCloudApi: expression => { decoded.push(expression); return expression.result }},
        Image: value => { assert.equal(value, 'image'); return IMAGE },
        FeatureCollection: value => { assert.equal(value, 'image'); return TABLE },
        Geometry: value => { assert.equal(value, 'region'); return REGION }
    }}
})
mock.module('#gee/jobs/task/export/toAsset', {
    exports: {startImageToAssetExport$: exporter('image-asset'), startTableToAssetExport$: exporter('table-asset')}
})
mock.module('#gee/jobs/task/export/toDrive', {
    exports: {startImageToDriveExport$: exporter('image-drive')}
})
mock.module('#gee/jobs/task/export/eeObjectTableDriveExport', {
    exports: {startTableToDriveExport$: exporter('table-drive')}
})
mock.module('#gee/jobs/task/export/toWorkspace', {
    exports: {startImageToWorkspaceExport$: exporter('image-workspace'), startTableToWorkspaceExport$: exporter('table-workspace')}
})

const {startEEObjectExport$} = await import('#gee/jobs/task/export/eeObjectExport')

beforeEach(() => { calls.length = 0; decoded.length = 0; selected.length = 0 })

for (const [kind, destination, name] of [
    ['IMAGE', 'GEE', 'image-asset'], ['IMAGE', 'DRIVE', 'image-drive'], ['IMAGE', 'SEPAL', 'image-workspace'],
    ['TABLE', 'GEE', 'table-asset'], ['TABLE', 'DRIVE', 'table-drive'], ['TABLE', 'SEPAL', 'table-workspace']
]) {
    test(`decodes and dispatches ${kind} to ${destination} using the existing exporter`, async () => {
        const request = {
            description: 'my export',
            export: {
                kind, destination, expression: EXPRESSION, region: REGION_EXPRESSION,
                assetId: 'projects/p/assets/out', driveFolder: 'exports', filenamePrefix: 'output',
                scale: 30, fileFormat: kind === 'IMAGE' ? 'GEO_TIFF' : 'SHP',
                selectors: ['id'], properties: {source: 'notebook'}
            }
        }

        assert.deepEqual(await lastValueFrom(startEEObjectExport$(request, {sepalUser: USER})), {eeTaskId: 'T1'})
        assert.equal(calls.length, 1)
        assert.equal(calls[0].name, name)
        const {options, context} = calls[0]
        assert.equal(options[kind === 'IMAGE' ? 'image' : 'collection'], kind === 'IMAGE' ? IMAGE : TABLE)
        if (kind === 'TABLE' && destination === 'SEPAL') {
            assert.match(options.description, /^my_export_/)
        } else {
            assert.equal(options.description, kind === 'IMAGE' && destination !== 'GEE' ? 'output' : 'my_export')
        }
        assert.equal(options.filenamePrefix, 'output')
        assert.equal(options.fileFormat, kind === 'IMAGE' ? 'GeoTIFF' : 'SHP')
        assert.equal(options.assetId, 'projects/p/assets/out')
        assert.deepEqual(options.selectors, ['id'])
        assert.deepEqual(options.properties, {source: 'notebook'})
        if (kind === 'IMAGE') {
            assert.equal(options.region, REGION)
            assert.equal(options.scale, 30)
            assert.deepEqual(decoded, [EXPRESSION, REGION_EXPRESSION])
        } else {
            assert.deepEqual(decoded, [EXPRESSION])
            assert.deepEqual(selected, destination === 'GEE' ? [['id']] : [])
        }
        if (destination !== 'GEE') {
            assert.deepEqual(context, {sepalUser: USER})
        }
        if (destination === 'DRIVE') {
            assert.equal(options.folder, 'exports')
        }
    })
}

test('rejects malformed expressions before decoding or starting an export', async () => {
    await assert.rejects(lastValueFrom(startEEObjectExport$({export: {kind: 'IMAGE', destination: 'SEPAL', expression: 'bad'}})), /expression/)
    assert.deepEqual(decoded, [])
    assert.deepEqual(calls, [])
})

test('workspace image exports get separate temporary folders even for the same name', async () => {
    const request = {description: 'ndvi', export: {kind: 'IMAGE', destination: 'SEPAL', expression: EXPRESSION}}
    await lastValueFrom(startEEObjectExport$(request, {sepalUser: USER}))
    await lastValueFrom(startEEObjectExport$(request, {sepalUser: USER}))
    assert.match(calls[0].options.folder, /^ndvi_/)
    assert.notEqual(calls[0].options.folder, calls[1].options.folder)
    assert.equal(calls[0].options.region, REGION)
})

test('workspace table exports also get separate temporary folders', async () => {
    const request = {description: 'plots', export: {kind: 'TABLE', destination: 'SEPAL', expression: EXPRESSION}}
    await lastValueFrom(startEEObjectExport$(request, {sepalUser: USER}))
    await lastValueFrom(startEEObjectExport$(request, {sepalUser: USER}))
    assert.match(calls[0].options.description, /^plots_/)
    assert.notEqual(calls[0].options.description, calls[1].options.description)
    assert.equal(calls[0].options.filenamePrefix, 'plots')
})

for (const destination of ['GEE', 'SEPAL']) {
    test(`rejects maxVertices for ${destination} because its unchanged exporter cannot apply it`, async () => {
        await assert.rejects(lastValueFrom(startEEObjectExport$({export: {
            kind: 'TABLE', destination, expression: EXPRESSION, assetId: 'projects/p/assets/out', maxVertices: 100
        }}, {sepalUser: USER})), /maxVertices.*not supported/)
        assert.deepEqual(calls, [])
    })
}
