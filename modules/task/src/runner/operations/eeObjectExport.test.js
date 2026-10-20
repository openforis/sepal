import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, stat, symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, test} from 'node:test'

import {operations} from '../operations.js'

const EXPRESSION = {result: '0', values: {'0': {constantValue: 1}}}
const originalHome = process.env.HOME
let home

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'ee-object-export-'))
    process.env.HOME = home
})

afterEach(async () => {
    process.env.HOME = originalHome
    await rm(home, {recursive: true, force: true})
})

const params = (destination, extra = {}) => ({
    description: 'ndvi',
    export: {kind: 'IMAGE', destination, expression: EXPRESSION, ...extra}
})

const client = ({states = ['COMPLETED'], startError} = {}) => {
    const calls = []
    const destination = {type: 'drive', folderId: 'folder-1'}
    return {
        calls,
        sepal: {
            startExport: async (path, body) => {
                calls.push({path, body})
                if (startError) {
                    throw startError
                }
                return {eeTaskId: 'T1', assetId: 'projects/p/assets/out', destination}
            },
            gee: async (path, body) => {
                calls.push({path, body})
                if (path === 'task/operation/status') {
                    return {state: states.shift()}
                }
                if (path === 'task/download/files') {
                    return {files: [{name: 'ndvi.tif', url: 'https://storage.invalid/ndvi', size: 4}], expiresAt: Date.now() + 3600000}
                }
                return {}
            }
        }
    }
}

const context = (sepal, extra = {}) => ({
    sepal, report: () => {}, signal: new AbortController().signal, sleep: async () => {},
    localProcessing: {run: work => work()},
    fetchFn: async () => new Response('data'),
    ...extra
})

test('registers the operation used by pysepal-api', () => {
    assert.equal(typeof operations['ee.export'], 'function')
})

test('starts an object asset export, follows it and shares it when requested', async () => {
    const {sepal, calls} = client()
    const request = params('GEE', {assetId: 'projects/p/assets/out', sharing: 'PUBLIC'})

    await operations['ee.export'](request, context(sepal))

    assert.deepEqual(calls.map(({path}) => path), ['task/export/ee', 'task/operation/status', 'task/asset/share'])
    assert.deepEqual(calls[0].body, request)
    assert.deepEqual(calls[2].body, {assetId: 'projects/p/assets/out'})
})

test('follows a table export to Drive', async () => {
    const {sepal, calls} = client()
    await operations['ee.export'](params('DRIVE', {kind: 'TABLE'}), context(sepal))
    assert.deepEqual(calls.map(({path}) => path), ['task/export/ee', 'task/operation/status'])
})

test('an export that starts no Earth Engine operation fails instead of reporting success', async () => {
    const {sepal, calls} = client()
    sepal.startExport = async () => ({eeTaskId: null})
    await assert.rejects(operations['ee.export'](params('DRIVE'), context(sepal)), /No Earth Engine export/)
    assert.deepEqual(calls, [])
})

test('downloads a workspace export into its relative path and cleans temporary storage', async () => {
    const {sepal, calls} = client()
    let acquiredSlot = false
    await operations['ee.export'](params('SEPAL', {workspacePath: 'module_results/demo'}), context(sepal, {
        localProcessing: {run: work => { acquiredSlot = true; return work() }}
    }))

    assert.equal(await readFile(join(home, 'module_results/demo/ndvi.tif'), 'utf8'), 'data')
    assert.equal(acquiredSlot, true)
    assert.deepEqual(calls.map(({path}) => path), [
        'task/export/ee', 'task/operation/status', 'task/download/files', 'task/download/cleanup'
    ])
})

test('uses a safe default workspace directory from the description', async () => {
    const {sepal} = client()
    await operations['ee.export']({...params('SEPAL'), description: '../my export'}, context(sepal))
    assert.equal(await readFile(join(home, 'downloads/_my_export/ndvi.tif'), 'utf8'), 'data')
})

test('cancels the Earth Engine operation without downloading or sharing', async () => {
    const {sepal, calls} = client({states: ['RUNNING']})
    const controller = new AbortController()
    await operations['ee.export'](params('SEPAL'), context(sepal, {
        signal: controller.signal, sleep: async () => controller.abort()
    }))
    assert.deepEqual(calls.map(({path}) => path), [
        'task/export/ee', 'task/operation/status', 'task/operation/cancel', 'task/download/cleanup'
    ])
})

test('cleans temporary storage when Earth Engine fails', async () => {
    const {sepal, calls} = client({states: ['FAILED']})
    await assert.rejects(operations['ee.export'](params('SEPAL'), context(sepal)), /Earth Engine export FAILED/)
    assert.equal(calls.at(-1).path, 'task/download/cleanup')
})

for (const workspacePath of ['../outside', '/tmp/outside', 'out/../../outside']) {
    test(`rejects workspace path ${workspacePath} before starting an export`, async () => {
        const {sepal, calls} = client()
        await assert.rejects(operations['ee.export'](params('SEPAL', {workspacePath}), context(sepal)), /workspacePath/)
        assert.deepEqual(calls, [])
    })
}

test('rejects a symlink outside the home before creating directories or starting an export', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'ee-object-outside-'))
    try {
        await symlink(outside, join(home, 'linked'))
        const {sepal, calls} = client()
        await assert.rejects(operations['ee.export'](params('SEPAL', {workspacePath: 'linked/output'}), context(sepal)), /workspacePath/)
        assert.deepEqual(calls, [])
        await assert.rejects(stat(join(outside, 'output')), {code: 'ENOENT'})
    } finally {
        await rm(outside, {recursive: true, force: true})
    }
})

for (const invalid of [
    {kind: 'OTHER'}, {destination: 'OTHER'}, {expression: 'serialized-string'}, {expression: null},
    {destination: 'GEE', assetId: null}, {destination: 'GEE', assetId: 'a', assetType: 'ImageCollection'}
]) {
    test(`rejects invalid object export ${JSON.stringify(invalid)}`, async () => {
        const {sepal, calls} = client()
        await assert.rejects(operations['ee.export'](params('SEPAL', invalid), context(sepal)), /export|assetId|ImageCollection/)
        assert.deepEqual(calls, [])
    })
}
