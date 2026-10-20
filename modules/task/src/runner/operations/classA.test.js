import assert from 'node:assert/strict'
import {test} from 'node:test'

import {operations} from '../operations.js'

const client = ({start, status = [{state: 'COMPLETED'}]}) => {
    const calls = []
    return {
        calls,
        sepal: {
            startExport: async (path, body) => {
                calls.push({path, body})
                return start
            },
            gee: async (path, body) => {
                calls.push({path, body})
                return path === 'task/operation/status' ? status.shift() : {}
            }
        }
    }
}

const run = (operation, params, sepal) =>
    operations[operation](params, {sepal, report: () => {}, signal: new AbortController().signal, sleep: async () => {}})

test('an image export to asset starts in gee, is followed, then shared when asked', async () => {
    const params = {image: {recipe: {type: 'MOSAIC'}, sharing: 'PUBLIC'}}
    const {sepal, calls} = client({start: {eeTaskId: 'T1', assetId: 'projects/p/assets/out'}})

    await run('image.GEE', params, sepal)

    assert.deepEqual(
        calls.map(({path}) => path),
        ['task/export/image/asset', 'task/operation/status', 'task/asset/share']
    )
    assert.equal(calls[0].body, params)
    assert.deepEqual(calls[2].body, {assetId: 'projects/p/assets/out'})
})

test('a CCDC export to asset starts in gee and is followed', async () => {
    const {sepal, calls} = client({start: {eeTaskId: 'T2', assetId: 'a'}})

    await run('ccdc.GEE', {image: {recipe: {type: 'CCDC'}}, description: 'd'}, sepal)

    assert.deepEqual(
        calls.map(({path}) => path),
        ['task/export/ccdc/asset', 'task/operation/status']
    )
})

test('a Drive export a user without a Google account cannot make completes without following anything', async () => {
    const {sepal, calls} = client({start: {eeTaskId: null}})

    await run('image.DRIVE', {image: {recipe: {type: 'MOSAIC'}}}, sepal)

    assert.deepEqual(calls.map(({path}) => path), ['task/export/image/drive'])
})

test('an image export stopped before it completes is not shared', async () => {
    const abort = new AbortController()
    const {sepal, calls} = client({start: {eeTaskId: 'T1', assetId: 'a'}, status: [{state: 'RUNNING'}]})

    await operations['image.GEE'](
        {image: {sharing: 'PUBLIC'}},
        {sepal, report: () => {}, signal: abort.signal, sleep: async () => abort.abort()}
    )

    assert.ok(!calls.map(({path}) => path).includes('task/asset/share'))
})
