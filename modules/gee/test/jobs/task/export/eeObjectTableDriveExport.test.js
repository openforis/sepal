import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

const started = []
const prepared = []
mock.module('#gee/jobs/task/storage/destination', {
    exports: {
        exportFolderName: text => text.replaceAll('/', '_'),
        prepareDestination$: ({folder}, {sepalUser}) => {
            prepared.push({folder, username: sepalUser.username})
            return of({})
        }
    }
})
mock.module('#sepal/ee/ee', {
    exports: {default: {
        data: {ExportDestination: {DRIVE: 'DRIVE'}, ExportType: {TABLE: 'TABLE'}},
        batch: {
            Export: {convertToServerParams: (config, destination, type) => ({config, destination, type})},
            ExportTask: {create: config => config}
        },
        startTableExport$: task => { started.push(task); return of('T1') }
    }}
})

const {inEEContext} = await import('#sepal/ee/eeContext')
const {startTableToDriveExport$} = await import('#gee/jobs/task/export/eeObjectTableDriveExport')
const COLLECTION = {collection: true}
const USER = {username: 'alice'}
const context = type => ({requestId: 'r', username: 'alice', auth: {type}, projectId: 'p', endpoint: 'https://ee'})
beforeEach(() => { started.length = 0; prepared.length = 0 })

test('the object table Drive adapter prepares storage and forwards its output options', async () => {
    const result = await lastValueFrom(inEEContext(context('user'), startTableToDriveExport$({
        collection: COLLECTION, description: 'plots', folder: 'exports/tables', filenamePrefix: 'output',
        fileFormat: 'SHP', selectors: ['id'], maxVertices: 100
    }, {sepalUser: USER})))
    assert.deepEqual(result, {eeTaskId: 'T1'})
    assert.deepEqual(prepared, [{folder: 'exports_tables', username: 'alice'}])
    assert.deepEqual(started, [{destination: 'DRIVE', type: 'TABLE', config: {
        collection: COLLECTION, description: 'plots', folder: 'exports_tables', fileNamePrefix: 'output',
        fileFormat: 'SHP', selectors: ['id'], maxVertices: 100
    }}])
})

test('the object table Drive adapter rejects a service account before preparing storage', async () => {
    await assert.rejects(lastValueFrom(inEEContext(context('serviceAccount'), startTableToDriveExport$({
        collection: COLLECTION, description: 'plots'
    }, {sepalUser: USER}))), /Cannot export to Drive using service account/)
    assert.deepEqual(started, [])
    assert.deepEqual(prepared, [])
})
