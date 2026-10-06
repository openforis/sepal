import {mkdtemp, readdir, readFile, rm} from 'fs/promises'
import {tmpdir} from 'os'
import {join} from 'path'

import {fileSize} from '#task/format'

import {FileServer, holdingOpen, noticingChunks, serving} from '../testSupport/fileServer.js'
import {downloadFiles} from './download.js'

const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000
const destination = {type: 'gcs', prefix: 'exports/t-1/'}

let root
let dir
let server

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'download-'))
    dir = join(root, 'downloads')
})

afterEach(async () => {
    await server?.close()
    server = null
    await rm(root, {recursive: true, force: true})
})

test('downloads every file of the destination into the directory', async () => {
    const contents = {'a.tif': 'aaa', 'b.tif': 'bbbb'}
    server = await FileServer.start(serving(contents))
    const sepal = listing(() => filesOf(contents))

    await download({sepal})

    expect(await filesIn(dir)).toEqual(contents)
    expect(server.requests.map(({authorization}) => authorization)).toEqual(['Bearer token', 'Bearer token'])
    expect(sepal.requests[0]).toEqual({path: 'task/download/files', body: {destination}})
})

test('downloads a file in a subdirectory into that subdirectory', async () => {
    const contents = {'sub/x.tif': 'xx'}
    server = await FileServer.start(serving(contents))

    await download({sepal: listing(() => filesOf(contents))})

    expect(await filesIn(dir)).toEqual(contents)
})

test('reports what is left to download', async () => {
    const contents = {'a.tif': 'aaa', 'b.tif': 'bbbb'}
    server = await FileServer.start(serving(contents))
    const reported = []

    await download({sepal: listing(() => filesOf(contents)), report: progress => reported.push(progress)})

    expect(reported.length).toBeGreaterThan(0)
    reported.forEach(({messageKey, messageArgs}) => {
        expect(messageKey).toBe('tasks.download.progress')
        expect(messageArgs.files).toBe(2)
    })
    expect(reported[0].messageArgs.bytes).toBe(fileSize('aaa'.length + 'bbbb'.length))
    expect(reported.at(-1).messageArgs.bytes).toBe(fileSize(0))
})

test('a download answered 401 lists again and completes', async () => {
    server = await FileServer.start((request, response) => request.url === '/1/a.tif'
        ? response.writeHead(401).end()
        : response.end('aaa'))
    const sepal = listing(n => filesOf({'a.tif': 'aaa'}, {path: name => `/${n}/${name}`}))

    await download({sepal})

    expect(await filesIn(dir)).toEqual({'a.tif': 'aaa'})
    expect(sepal.requests).toHaveLength(2)
})

test('a file gone from a new listing fails the download', async () => {
    server = await FileServer.start((_request, response) => response.writeHead(401).end())
    const sepal = listing(n => filesOf(n === 1 ? {'a.tif': 'aaa'} : {}))

    await expect(download({sepal})).rejects.toThrow('a.tif is no longer in the export')
})

test('lists again before the listing expires', async () => {
    server = await FileServer.start(serving({'2/a.tif': 'aaa'}))
    const sepal = listing(n => filesOf({'a.tif': 'aaa'}, {
        path: name => `/${n}/${name}`,
        expiresAt: n === 1 ? NOW + 30 * 1000 : NOW + HOUR
    }))

    await download({sepal})

    expect(server.requests.map(({path}) => path)).toEqual(['/2/a.tif'])
    expect(await filesIn(dir)).toEqual({'a.tif': 'aaa'})
})

test('a server error is retried, then fails the download', async () => {
    server = await FileServer.start((_request, response) => response.writeHead(500).end())
    const sleeps = []

    await expect(download({
        sepal: listing(() => filesOf({'a.tif': 'aaa'})),
        sleep: async ms => sleeps.push(ms)
    })).rejects.toMatchObject({statusCode: 500})

    expect(server.requests).toHaveLength(5)
    expect(sleeps).toHaveLength(4)
    expect(await filesIn(dir)).toEqual({})
})

test('a cancelled download leaves no complete-looking file', async () => {
    server = await FileServer.start(holdingOpen)
    const abort = new AbortController()

    await download({
        sepal: listing(() => filesOf({'a.tif': 'x'.repeat(1000)})),
        signal: abort.signal,
        fetchFn: noticingChunks(() => abort.abort())
    })

    expect(await readdir(dir)).toEqual([])
})

test('a file name that leaves the directory is refused', async () => {
    const contents = {'a.tif': 'aaa', '../x.tif': 'xxx'}
    server = await FileServer.start(serving(contents))

    await expect(download({sepal: listing(() => filesOf(contents))})).rejects.toThrow('../x.tif')

    expect(await readdir(root)).toEqual([])
    expect(server.requests).toEqual([])
})

test('an empty file name is refused', async () => {
    server = await FileServer.start(serving({}))

    await expect(download({sepal: listing(() => filesOf({'': 'aaa'}))})).rejects.toThrow('file name')

    expect(server.requests).toEqual([])
})

const download = ({
    sepal,
    report = () => {},
    signal = new AbortController().signal,
    sleep = async () => {},
    fetchFn
}) => downloadFiles({destination, dir, sepal, report, signal, fetchFn, sleep, now: () => NOW})

// A gee answering each listing request with list(n), n counting listings from 1.
const listing = list => {
    const requests = []
    return {
        requests,
        gee: async (path, body) => {
            requests.push({path, body})
            return list(requests.length)
        }
    }
}

const filesOf = (contents, {path = name => `/${name}`, expiresAt = NOW + HOUR} = {}) => ({
    files: Object.entries(contents).map(([name, content]) => ({
        name,
        size: content.length,
        url: server.url(path(name)),
        headers: {Authorization: 'Bearer token'}
    })),
    expiresAt
})

const filesIn = async directory => {
    const entries = await readdir(directory, {recursive: true, withFileTypes: true}).catch(() => [])
    const files = entries.filter(entry => entry.isFile())
    return Object.fromEntries(await Promise.all(files.map(async entry => {
        const path = join(entry.parentPath, entry.name)
        return [path.slice(directory.length + 1), await readFile(path, 'utf8')]
    })))
}
