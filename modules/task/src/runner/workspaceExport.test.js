import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

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

    expect(result).toEqual({downloaded: true})
    expect(sepal.calls.map(({path}) => path)).toEqual(['start', 'task/operation/status', 'task/download/files', 'task/download/cleanup'])
    expect(sepal.calls.at(-1).body).toEqual({destination})
    expect(await readFile(join(downloadDir, 'a.tif'), 'utf8')).toBe('aaa')
})

test('an export that fails still cleans up and fails', async () => {
    const sepal = fakeSepal({states: [{state: 'FAILED', errorMessage: 'Quota exceeded'}]})

    await expect(exportTo({sepal})).rejects.toMatchObject({earthEngineMessage: 'Quota exceeded'})

    expect(sepal.calls.map(({path}) => path)).toEqual(['start', 'task/operation/status', 'task/download/cleanup'])
})

test('a cancelled export downloads nothing, cleans up and resolves', async () => {
    const abort = new AbortController()
    const sepal = fakeSepal({states: [{state: 'RUNNING'}]})

    const result = await exportTo({sepal, signal: abort.signal, sleep: async () => abort.abort()})

    expect(result).toEqual({downloaded: false})
    expect(sepal.calls.map(({path}) => path)).not.toContain('task/download/files')
    expect(sepal.calls.at(-1).path).toBe('task/download/cleanup')
})

test('a cancelled download leaves no complete-looking file and cleans up', async () => {
    server = await FileServer.start(holdingOpen)
    const abort = new AbortController()
    const sepal = fakeSepal({states: [{state: 'COMPLETED'}], contents: {'a.tif': 'x'.repeat(1000)}})

    const result = await exportTo({sepal, signal: abort.signal, fetchFn: noticingChunks(() => abort.abort())})

    expect(result).toEqual({downloaded: false})
    expect(await readdir(downloadDir)).toEqual([])
    expect(sepal.calls.at(-1).path).toBe('task/download/cleanup')
})

test('a cleanup that fails does not fail the export', async () => {
    server = await FileServer.start(serving({'a.tif': 'aaa'}))
    const sepal = fakeSepal({states: [{state: 'COMPLETED'}], contents: {'a.tif': 'aaa'}, cleanupFails: true})

    await expect(exportTo({sepal})).resolves.toEqual({downloaded: true})
})

const exportTo = ({sepal, signal = new AbortController().signal, sleep = async () => {}, fetchFn}) =>
    exportToWorkspace({start: sepal.start, downloadDir, sepal, report: () => {}, signal, sleep, fetchFn})

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
