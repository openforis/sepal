import assert from 'node:assert/strict'
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, test} from 'node:test'

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

    assert.deepEqual(await filesIn(dir), contents)
    assert.deepEqual(
        server.requests.map(({authorization}) => authorization),
        ['Bearer token', 'Bearer token']
    )
    assert.deepEqual(sepal.requests[0], {path: 'task/download/files', body: {destination}})
})

test('downloads a file in a subdirectory into that subdirectory', async () => {
    const contents = {'sub/x.tif': 'xx'}
    server = await FileServer.start(serving(contents))

    await download({sepal: listing(() => filesOf(contents))})

    assert.deepEqual(await filesIn(dir), contents)
})

test('reports what is left to download', async () => {
    const contents = {'a.tif': 'aaa', 'b.tif': 'bbbb'}
    server = await FileServer.start(serving(contents))
    const reported = []

    await download({sepal: listing(() => filesOf(contents)), report: progress => reported.push(progress)})

    assert.ok(reported.length > 0)
    reported.forEach(({messageKey, messageArgs}) => {
        assert.equal(messageKey, 'tasks.download.progress')
        assert.equal(messageArgs.files, 2)
    })
    assert.equal(reported[0].messageArgs.bytes, fileSize('aaa'.length + 'bbbb'.length))
    assert.equal(reported.at(-1).messageArgs.bytes, fileSize(0))
})

test('a download answered 401 lists again and completes', async () => {
    server = await FileServer.start((request, response) => request.url === '/1/a.tif'
        ? response.writeHead(401).end()
        : response.end('aaa'))
    const sepal = listing(n => filesOf({'a.tif': 'aaa'}, {path: name => `/${n}/${name}`}))

    await download({sepal})

    assert.deepEqual(await filesIn(dir), {'a.tif': 'aaa'})
    assert.equal(sepal.requests.length, 2)
})

test('a file gone from a new listing fails the download', async () => {
    server = await FileServer.start((_request, response) => response.writeHead(401).end())
    const sepal = listing(n => filesOf(n === 1 ? {'a.tif': 'aaa'} : {}))

    await assert.rejects(download({sepal}), /a\.tif is no longer in the export/)
})

test('lists again before the listing expires', async () => {
    server = await FileServer.start(serving({'2/a.tif': 'aaa'}))
    const sepal = listing(n => filesOf({'a.tif': 'aaa'}, {
        path: name => `/${n}/${name}`,
        expiresAt: n === 1 ? NOW + 30 * 1000 : NOW + HOUR
    }))

    await download({sepal})

    assert.deepEqual(server.requests.map(({path}) => path), ['/2/a.tif'])
    assert.deepEqual(await filesIn(dir), {'a.tif': 'aaa'})
})

test('a server error is retried, then fails the download', async () => {
    server = await FileServer.start((_request, response) => response.writeHead(500).end())
    const sleeps = []

    await assert.rejects(download({
        sepal: listing(() => filesOf({'a.tif': 'aaa'})),
        sleep: async ms => sleeps.push(ms)
    }), {statusCode: 500})

    assert.equal(server.requests.length, 5)
    assert.equal(sleeps.length, 4)
    assert.deepEqual(await filesIn(dir), {})
})

test('repeated refusals back off before listing again, then fail the download', async () => {
    server = await FileServer.start((_request, response) => response.writeHead(403).end())
    const sepal = listing(() => filesOf({'a.tif': 'aaa'}))
    const sleeps = []

    await assert.rejects(download({sepal, sleep: async ms => sleeps.push(ms)}), {statusCode: 403})

    assert.equal(server.requests.length, 5)
    assert.equal(sepal.requests.length, 5)
    assert.deepEqual(sleeps, [1000, 2000, 4000])
})

test('a file shorter than listed is a failed attempt, and leaves nothing behind', async () => {
    server = await FileServer.start(serving({'a.tif': 'aa'}))
    const sleeps = []

    await assert.rejects(download({
        sepal: listing(() => ({...filesOf({'a.tif': 'aa'}), files: [{...filesOf({'a.tif': 'aa'}).files[0], size: 3}]})),
        sleep: async ms => sleeps.push(ms)
    }), /a\.tif/)

    assert.equal(server.requests.length, 5)
    assert.equal(sleeps.length, 4)
    assert.deepEqual(await readdir(dir), [])
})

test('a listing naming a file twice is refused before anything is downloaded', async () => {
    server = await FileServer.start(serving({'a.tif': 'aaa'}))
    const [file] = filesOf({'a.tif': 'aaa'}).files

    await assert.rejects(
        download({sepal: listing(() => ({files: [file, file], expiresAt: NOW + HOUR}))}),
        /a\.tif/
    )

    assert.deepEqual(server.requests, [])
})

test('reports progress while a file streams, at most once every 5 seconds', async () => {
    const clock = fakeClock()
    const {handle, firstPartRead} = inTwoParts('x'.repeat(400), 'y'.repeat(600))
    server = await FileServer.start(handle)
    const reported = []

    await download({
        sepal: listing(() => filesOf({'a.tif': 'x'.repeat(1000)})),
        report: progress => reported.push(progress.messageArgs.bytes),
        fetchFn: noticingChunks(() => {
            clock.advance(6000)
            firstPartRead()
        }),
        now: clock.now
    })

    assert.equal(reported[0], fileSize(1000))
    assert.ok(reported.includes(fileSize(600)))
    assert.equal(reported.at(-1), fileSize(0))
})

test('progress within 5 seconds of the last report is not reported', async () => {
    const {handle, firstPartRead} = inTwoParts('x'.repeat(400), 'y'.repeat(600))
    server = await FileServer.start(handle)
    const reported = []

    await download({
        sepal: listing(() => filesOf({'a.tif': 'x'.repeat(1000)})),
        report: progress => reported.push(progress.messageArgs.bytes),
        fetchFn: noticingChunks(firstPartRead)
    })

    assert.deepEqual(reported, [fileSize(1000), fileSize(0)])
})

test('a cancelled download leaves no complete-looking file', async () => {
    server = await FileServer.start(holdingOpen)
    const abort = new AbortController()

    await download({
        sepal: listing(() => filesOf({'a.tif': 'x'.repeat(1000)})),
        signal: abort.signal,
        fetchFn: noticingChunks(() => abort.abort())
    })

    assert.deepEqual(await readdir(dir), [])
})

test('a file name that leaves the directory is refused', async () => {
    const contents = {'a.tif': 'aaa', '../x.tif': 'xxx'}
    server = await FileServer.start(serving(contents))

    await assert.rejects(download({sepal: listing(() => filesOf(contents))}), /\.\.\/x\.tif/)

    assert.deepEqual(await readdir(root), [])
    assert.deepEqual(server.requests, [])
})

test('an empty file name is refused', async () => {
    server = await FileServer.start(serving({}))

    await assert.rejects(download({sepal: listing(() => filesOf({'': 'aaa'}))}), /file name/)

    assert.deepEqual(server.requests, [])
})

const download = ({
    sepal,
    report = () => {},
    signal = new AbortController().signal,
    sleep = async () => {},
    fetchFn,
    now = () => NOW
}) => downloadFiles({destination, dir, sepal, report, signal, fetchFn, sleep, now})

const fakeClock = () => {
    let time = NOW
    return {now: () => time, advance: ms => time += ms}
}

// Answers with the first part of a body, and the rest only once the client has read the first.
const inTwoParts = (first, rest) => {
    let firstPartRead
    const read = new Promise(resolve => firstPartRead = resolve)
    const handle = async (_request, response) => {
        response.writeHead(200, {'Content-Length': first.length + rest.length})
        response.write(first)
        await read
        response.end(rest)
    }
    return {handle, firstPartRead}
}

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
