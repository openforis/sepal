import assert from 'node:assert/strict'
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, test} from 'node:test'

import {FileServer, holdingOpen, noticingChunks, serving} from '../testSupport/fileServer.js'
import {exportToWorkspace} from './workspaceExport.js'

const HOUR = 60 * 60 * 1000
const destination = {type: 'drive', folder: 'Sepal/exports/t-1'}

let downloadDir
let server

beforeEach(async () => {
    downloadDir = await mkdtemp(join(tmpdir(), 'workspace-export-'))
})

afterEach(async () => {
    await server?.close()
    server = null
    await rm(downloadDir, {recursive: true, force: true})
})

test('starts the export, follows it, downloads it and cleans up', async () => {
    server = await FileServer.start(serving({'a.tif': 'aaa'}))
    const sepal = fakeSepal({states: [{state: 'COMPLETED'}], contents: {'a.tif': 'aaa'}})

    const result = await exportTo({sepal})

    assert.deepEqual(result, {downloaded: true})
    assert.deepEqual(
        sepal.calls.map(({path}) => path),
        ['start', 'task/operation/status', 'task/download/files', 'task/download/cleanup']
    )
    assert.deepEqual(sepal.calls.at(-1).body, {destination})
    assert.equal(await readFile(join(downloadDir, 'a.tif'), 'utf8'), 'aaa')
})

test('downloads as a local processing step once the export has completed', async () => {
    server = await FileServer.start(serving({'a.tif': 'aaa'}))
    const sepal = fakeSepal({states: [{state: 'COMPLETED'}], contents: {'a.tif': 'aaa'}})
    const localProcessing = {
        run: async work => {
            sepal.calls.push({path: 'local processing begins'})
            await work()
            sepal.calls.push({path: 'local processing ends'})
        }
    }

    await exportTo({sepal, localProcessing})

    assert.deepEqual(sepal.calls.map(({path}) => path), [
        'start', 'task/operation/status', 'local processing begins', 'task/download/files', 'local processing ends', 'task/download/cleanup'
    ])
})

test('an export that fails still cleans up and fails', async () => {
    const sepal = fakeSepal({states: [{state: 'FAILED', errorMessage: 'Quota exceeded'}]})

    await assert.rejects(exportTo({sepal}), {earthEngineMessage: 'Quota exceeded'})

    assert.deepEqual(
        sepal.calls.map(({path}) => path),
        ['start', 'task/operation/status', 'task/download/cleanup']
    )
})

test('a cancelled export downloads nothing, cleans up and resolves', async () => {
    const abort = new AbortController()
    const sepal = fakeSepal({states: [{state: 'RUNNING'}]})

    const result = await exportTo({sepal, signal: abort.signal, sleep: async () => abort.abort()})

    assert.deepEqual(result, {downloaded: false})
    assert.ok(!sepal.calls.map(({path}) => path).includes('task/download/files'))
    assert.equal(sepal.calls.at(-1).path, 'task/download/cleanup')
})

test('a cancelled download leaves no complete-looking file and cleans up', async () => {
    server = await FileServer.start(holdingOpen)
    const abort = new AbortController()
    const sepal = fakeSepal({states: [{state: 'COMPLETED'}], contents: {'a.tif': 'x'.repeat(1000)}})

    const result = await exportTo({sepal, signal: abort.signal, fetchFn: noticingChunks(() => abort.abort())})

    assert.deepEqual(result, {downloaded: false})
    assert.deepEqual(await readdir(downloadDir), [])
    assert.equal(sepal.calls.at(-1).path, 'task/download/cleanup')
})

test('a cleanup that fails does not fail the export', async () => {
    server = await FileServer.start(serving({'a.tif': 'aaa'}))
    const sepal = fakeSepal({states: [{state: 'COMPLETED'}], contents: {'a.tif': 'aaa'}, cleanupFails: true})

    assert.deepEqual(await exportTo({sepal}), {downloaded: true})
})

const PASS_THROUGH = {run: work => work()}

const exportTo = ({sepal, signal = new AbortController().signal, sleep = async () => {}, fetchFn, localProcessing = PASS_THROUGH}) =>
    exportToWorkspace({start: sepal.start, downloadDir, sepal, report: () => {}, signal, sleep, fetchFn, localProcessing})

const fakeSepal = ({states, contents = {}, cleanupFails = false}) => {
    const calls = []
    const answers = {
        'task/operation/status': () => states.shift(),
        'task/download/files': () => ({
            files: Object.entries(contents).map(([name, content]) => ({name, size: content.length, url: server.url(`/${name}`), headers: {}})),
            expiresAt: Date.now() + HOUR
        }),
        'task/download/cleanup': () => {
            if (cleanupFails) {
                throw new Error('gee unavailable')
            }
            return {}
        }
    }
    return {
        calls,
        start: async () => {
            calls.push({path: 'start'})
            return {eeTaskId: 'EE-1', destination}
        },
        gee: async (path, body) => {
            calls.push({path, body})
            return answers[path]?.() ?? {}
        }
    }
}
