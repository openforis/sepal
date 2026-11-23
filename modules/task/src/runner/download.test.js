import assert from 'node:assert/strict'
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, beforeEach, test} from 'node:test'
import {setImmediate} from 'node:timers/promises'

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

    const downloadedPaths = await download({sepal})

    assert.deepEqual(downloadedPaths, [join(dir, 'a.tif'), join(dir, 'b.tif')])
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

    const downloadedPaths = await download({sepal: listing(() => filesOf(contents))})

    assert.deepEqual(downloadedPaths, [join(dir, 'sub/x.tif')])
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
    assert.deepEqual(await readdir(dir), [])
})

test('a retry after a failed attempt publishes only the complete file', async () => {
    const answers = ['aa', 'aaa']
    server = await FileServer.start((_request, response) => response.end(answers.shift()))

    await download({sepal: listedAs('a.tif', {path: '/a.tif', size: 3})})

    assert.equal(server.requests.length, 2)
    assert.deepEqual(await readdir(dir), ['a.tif'])
    assert.deepEqual(await filesIn(dir), {'a.tif': 'aaa'})
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

// Tasks of one user share the home they download into, so two downloads can write the same file at once.
test('a download still writing cannot alter the file another download of the same name has published', {timeout: 10_000}, async t => {
    const first = inTwoParts('aaa', 'ccc')
    server = await FileServer.start(routes({'/first/a.tif': first.handle, '/second/a.tif': (_request, response) => response.end('bbb')}))
    const cancelFirst = new AbortController()
    const firstDownload = download({
        sepal: listedAs('a.tif', {path: '/first/a.tif', size: 7}),
        signal: cancelFirst.signal,
        sleep: async () => cancelFirst.abort()
    })
    await written(dir, 'aaa', t.signal)

    await download({sepal: listedAs('a.tif', {path: '/second/a.tif', size: 3})})
    first.firstPartRead()
    await firstDownload

    assert.deepEqual(await filesIn(dir), {'a.tif': 'bbb'})
    assert.deepEqual(await readdir(dir), ['a.tif'])
})

test('cancelling a download leaves another download of the same name to complete undisturbed', {timeout: 10_000}, async t => {
    const second = inTwoParts('bb', 'b')
    server = await FileServer.start(routes({'/first/a.tif': holdingOpen, '/second/a.tif': second.handle}))
    const cancelFirst = new AbortController()
    const firstDownload = download({sepal: listedAs('a.tif', {path: '/first/a.tif', size: 1000}), signal: cancelFirst.signal})
    await written(dir, 'partial', t.signal)
    const secondDownload = download({sepal: listedAs('a.tif', {path: '/second/a.tif', size: 3})})
    await written(dir, 'bb', t.signal)

    cancelFirst.abort()
    await firstDownload
    second.firstPartRead()
    await secondDownload

    assert.deepEqual(server.requests.map(({path}) => path), ['/first/a.tif', '/second/a.tif'])
    assert.deepEqual(await readdir(dir), ['a.tif'])
    assert.deepEqual(await filesIn(dir), {'a.tif': 'bbb'})
})

test('cancelling a download keeps what another download published into the folder it was writing in', {timeout: 10_000}, async t => {
    server = await FileServer.start(routes({'/first/a.tif': holdingOpen, '/second/b.tif': (_request, response) => response.end('bbb')}))
    const cancelFirst = new AbortController()
    const firstDownload = download({sepal: listedAs('a.tif', {path: '/first/a.tif', size: 1000}), signal: cancelFirst.signal})
    const folder = dirname(await written(dir, 'partial', t.signal))
    await download({sepal: listedAs('b.tif', {path: '/second/b.tif', size: 3}), into: folder})

    cancelFirst.abort()
    await firstDownload

    assert.equal(await readFile(join(folder, 'b.tif'), 'utf8'), 'bbb')
})

test('a download replaces a file already at its destination', async () => {
    await mkdir(dir, {recursive: true})
    await writeFile(join(dir, 'a.tif'), 'old')
    server = await FileServer.start(serving({'a.tif': 'aaa'}))

    await download({sepal: listing(() => filesOf({'a.tif': 'aaa'}))})

    assert.deepEqual(await filesIn(dir), {'a.tif': 'aaa'})
})

test('a file already beside the destination, such as an earlier download\'s .part, is left alone', async () => {
    await mkdir(dir, {recursive: true})
    await writeFile(join(dir, 'a.tif.part'), 'left behind')
    server = await FileServer.start(serving({'a.tif': 'aaa'}))

    await download({sepal: listing(() => filesOf({'a.tif': 'aaa'}))})

    assert.deepEqual(await filesIn(dir), {'a.tif': 'aaa', 'a.tif.part': 'left behind'})
})

test('a file name as long as the file system allows is downloaded', async () => {
    const name = `${'x'.repeat(251)}.tif`
    server = await FileServer.start(serving({[name]: 'aaa'}))

    await download({sepal: listing(() => filesOf({[name]: 'aaa'}))})

    assert.deepEqual(await filesIn(dir), {[name]: 'aaa'})
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
    into = dir,
    report = () => {},
    signal = new AbortController().signal,
    sleep = async () => {},
    fetchFn,
    now = () => NOW
}) => downloadFiles({destination, dir: into, sepal, report, signal, fetchFn, sleep, now})

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

// A gee listing one file, served at path, as size bytes.
const listedAs = (name, {path, size}) => listing(() => ({
    files: [{name, size, url: server.url(path), headers: {Authorization: 'Bearer token'}}],
    expiresAt: NOW + HOUR
}))

// Answers each request with the handler for its path.
const routes = handlers => (request, response) => handlers[request.url](request, response)

// The path of a file under directory holding content, once a download has written that much to disk. Polling stops
// when the test's signal aborts, so a download that never writes there times its test out instead of hanging the run.
const written = async (directory, content, signal) => {
    for (;;) {
        const found = Object.entries(await filesIn(directory)).find(([, fileContent]) => fileContent === content)
        if (found) {
            return join(directory, found[0])
        }
        await setImmediate(undefined, {signal})
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
