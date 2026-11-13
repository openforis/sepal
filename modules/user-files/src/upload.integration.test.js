import assert from 'node:assert/strict'
import {EventEmitter, once} from 'node:events'
import * as nodeFs from 'node:fs'
import * as fs from 'node:fs/promises'
import {request as httpRequest} from 'node:http'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {after, afterEach, describe, mock, test} from 'node:test'
import {setTimeout as delay} from 'node:timers/promises'

import _ from 'lodash'

import {configureNoLogging} from '#sepal/log'

// Uploads through the module's server, route and multipart parser. The parser keeps what it receives in the process's
// temporary directory, here one of the test's own, which every upload must leave empty however it ends.

const POLL_MS = 20
const WAIT_MS = 5000
const HOLD_MS = 200
const BOUNDARY = 'upload-boundary'

const scratch = nodeFs.mkdtempSync(join(tmpdir(), 'user-files-'))
const homes = join(scratch, 'homes')
const uploads = join(scratch, 'uploads')
nodeFs.mkdirSync(homes)
nodeFs.mkdirSync(uploads)
process.env.TMPDIR = uploads

// Faults armed for the next temporary file. Its removal fails, as one might for reasons of its own. Or its opening is
// held until removing it has been tried, or a moment has passed: a file removed before its opening completes would be
// created afterwards.
const faults = {failRemoval: false, holdOpening: null}
const removals = new EventEmitter()

const inUploads = path =>
    typeof path === 'string' && path.startsWith(uploads)

// Also its own default export, which is what modules requiring it get: the mock defines the fake's properties on it,
// which the real module does not allow.
const fakeFs = {
    ..._.omit(nodeFs, 'default'),
    createWriteStream: (path, options) => {
        const hold = faults.holdOpening
        if (!hold || !inUploads(path)) {
            return nodeFs.createWriteStream(path, options)
        }
        faults.holdOpening = null
        return nodeFs.createWriteStream(path, {...options, fs: {...nodeFs, open: heldOpen(hold)}})
    }
}

mock.module('node:fs', {
    exports: {...fakeFs, default: fakeFs}
})

mock.module('node:fs/promises', {
    exports: {
        ...fs,
        unlink: async path => {
            try {
                if (faults.failRemoval && inUploads(path)) {
                    faults.failRemoval = false
                    throw Object.assign(new Error('Simulated removal failure'), {code: 'EIO'})
                }
                return await fs.unlink(path)
            } finally {
                if (inUploads(path)) {
                    removals.emit('tried')
                }
            }
        }
    }
})

mock.module('./config.js', {
    exports: {homeDir: homes, pollIntervalMilliseconds: 1000}
})

const {start} = await import('#sepal/httpServer')
const {routes} = await import('./routes.js')

configureNoLogging()

const server = await start({port: 0, routes, metricsMiddleware: (_ctx, next) => next()})

afterEach(() => {
    Object.assign(faults, {failRemoval: false, holdOpening: null})
    return Promise.all([homes, uploads].map(emptied))
})

after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await fs.rm(scratch, {recursive: true, force: true})
})

describe('an upload leaves nothing in temporary storage', () => {
    test('once written, with the bytes uploaded', async () => {
        const alice = await aHome('alice')

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart('a,b')))

        assert.equal(response.status, 200)
        assert.equal(await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'a,b')
        await temporaryStorageCleared()
    })

    test('when unauthenticated, keeping the destination', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'old')

        const response = await upload({path: 'project/data.csv', overwrite: 'true'}, multipart(aFilePart('new')), {user: null})

        assert.equal(response.status, 401)
        assert.equal(await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'old')
        await temporaryStorageCleared()
    })

    test('when missing its path', async () => {
        await aHome('alice')

        const response = await upload({}, multipart(aFilePart('a,b')))

        assert.equal(response.status, 400)
        assert.deepEqual(response.body, {error: 'No path specified'})
        await temporaryStorageCleared()
    })

    test('when its path leaves the home, keeping what is there', async () => {
        await aHome('alice')
        const bob = await aHome('bob')
        await aFile(bob, 'project/data.csv', 'old')

        const response = await upload({path: '../bob/project/data.csv', overwrite: 'true'}, multipart(aFilePart('new')))

        assert.equal(response.status, 403)
        assert.equal(await fs.readFile(join(bob, 'project', 'data.csv'), 'utf8'), 'old')
        await temporaryStorageCleared()
    })

    test('when refusing to replace a file, keeping its bytes', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'old')

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart('new')))

        assert.equal(response.status, 409)
        assert.deepEqual(response.body, {error: 'Cannot overwrite existing files'})
        assert.equal(await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'old')
        await temporaryStorageCleared()
    })

    test('when refusing several files', async () => {
        const alice = await aHome('alice')

        for (const parts of [
            [aFilePart('a'), aFilePart('b')],
            [aFilePart('a'), aFilePart('b', {name: 'other'})]
        ]) {
            const response = await upload({path: 'project/data.csv'}, multipart(...parts))

            assert.equal(response.status, 400)
            assert.deepEqual(response.body, {error: 'Only a single file is supported'})
        }
        assert.equal(await exists(join(alice, 'project', 'data.csv')), false)
        await temporaryStorageCleared()
    })

    test('when refusing a file under another name', async () => {
        const alice = await aHome('alice')

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart('a,b', {name: 'other'})))

        assert.equal(response.status, 400)
        assert.deepEqual(response.body, {error: 'No file content provided'})
        assert.equal(await exists(join(alice, 'project', 'data.csv')), false)
        await temporaryStorageCleared()
    })

    test('when writing it fails', async t => {
        const alice = await aHome('alice')
        await aSocket(join(alice, 'project', 'data.csv'), t)

        const response = await upload({path: 'project/data.csv', overwrite: 'true'}, multipart(aFilePart('a,b')))

        assert.equal(response.status, 500)
        assert.deepEqual(response.body, {error: 'Failed to write file'})
        await temporaryStorageCleared()
    })

    test('when the parser rejects it part-way', async () => {
        const alice = await aHome('alice')

        const response = await upload({path: 'project/data.csv'}, aFilePart('a,b'))

        assert.notEqual(response.status, 200)
        assert.equal(await exists(join(alice, 'project', 'data.csv')), false)
        await temporaryStorageCleared()
    })

    // The parser refuses an empty file, then goes on reading the parts it already holds.
    test('when the parser rejects a part, then reads on through later ones', async () => {
        const alice = await aHome('alice')
        const later = Array.from({length: 10}, (_, index) => aFilePart(`later ${index}`, {name: `later${index}`}))

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart(''), ...later))

        assert.notEqual(response.status, 200)
        assert.equal(await exists(join(alice, 'project', 'data.csv')), false)
        await temporaryStorageCleared()
    })

    // How far the parser has read when the request is done decides whether it opens the unfinished part's file before
    // the request's files are discarded or after; each body here leads to one of these.
    test('when the parser rejects a part, then reads on into one never finished, leaving no file open', {timeout: 2 * WAIT_MS}, async () => {
        const alice = await aHome('alice')

        for (const parts of [
            [aFilePart(''), aFilePart('c,d', {name: 'unfinished'})],
            [aFilePart(''), aFilePart('a,b', {name: 'finished'}), aFilePart('c,d', {name: 'unfinished'})]
        ]) {
            const response = await upload({path: 'project/data.csv'}, parts.join(''))

            assert.notEqual(response.status, 200)
            await temporaryStorageCleared()
        }
        assert.equal(await exists(join(alice, 'project', 'data.csv')), false)
    })

    test('when the client abandons it part-way, leaving no file open', async () => {
        const alice = await aHome('alice')
        const request = anUnfinishedUpload({path: 'project/data.csv'}, aFilePart('a,b'))
        await until(async () => (await fs.readdir(uploads)).length > 0)

        request.destroy()

        await temporaryStorageCleared()
        assert.equal(await exists(join(alice, 'project', 'data.csv')), false)
    })

    test('when the client abandons it while its file is still being opened', async () => {
        const alice = await aHome('alice')
        const opening = holdNextOpening()
        const request = anUnfinishedUpload({path: 'project/data.csv'}, aFilePart('a,b'))
        await opening.held

        request.destroy()

        await opening.done
        await temporaryStorageCleared()
        assert.equal(await exists(join(alice, 'project', 'data.csv')), false)
    })

    test('of every other file when one cannot be removed, answering as it would have', async () => {
        await aHome('alice')
        faults.failRemoval = true

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart('a'), aFilePart('b')))

        assert.equal(response.status, 400)
        assert.deepEqual(response.body, {error: 'Only a single file is supported'})
        assert.equal(faults.failRemoval, false)
        assert.equal((await fs.readdir(uploads)).length, 1)
    })
})

// Holds the opening of the next temporary file, telling when it is held and when the opening is done.
const holdNextOpening = () => {
    const hold = {held: Promise.withResolvers(), done: Promise.withResolvers()}
    faults.holdOpening = hold
    return {held: hold.held.promise, done: hold.done.promise}
}

const heldOpen = hold => (path, flags, mode, callback) => {
    hold.held.resolve()
    once(removals, 'tried', {signal: AbortSignal.timeout(HOLD_MS)}).catch(() => {}).then(() =>
        nodeFs.open(path, flags, mode, (error, fd) => {
            callback(error, fd)
            hold.done.resolve()
        })
    )
}

const url = query =>
    `http://127.0.0.1:${server.address().port}/setFile?${new URLSearchParams(query)}`

const headers = user => ({
    'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    ...(user ? {'sepal-user': JSON.stringify({username: user})} : {})
})

const upload = async (query, body, {user = 'alice'} = {}) => {
    const response = await fetch(url(query), {method: 'POST', headers: headers(user), body})
    return {
        status: response.status,
        body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text()
    }
}

// An upload whose body never completes: it announces more than it sends.
const anUnfinishedUpload = (query, body) => {
    const request = httpRequest(url(query), {
        method: 'POST',
        headers: {...headers('alice'), 'content-length': Buffer.byteLength(body) + 1000}
    })
    request.on('error', () => {})
    request.write(body)
    return request
}

const aFilePart = (content, {name = 'file', filename = 'data.csv'} = {}) =>
    `--${BOUNDARY}\r\n`
    + `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n`
    + 'Content-Type: text/csv\r\n\r\n'
    + `${content}\r\n`

const multipart = (...parts) =>
    `${parts.join('')}--${BOUNDARY}--\r\n`

// Waits until nothing an upload received remains in temporary storage: no file, and none the service holds open.
const temporaryStorageCleared = async (waited = 0) => {
    const left = await leftInTemporaryStorage()
    if (left.length && waited < WAIT_MS) {
        await delay(POLL_MS)
        return temporaryStorageCleared(waited + POLL_MS)
    }
    assert.deepEqual(left, [])
}

const leftInTemporaryStorage = async () => [
    ...await fs.readdir(uploads),
    ...(await openFiles()).filter(path => path.startsWith(uploads))
]

// Where this process's open file descriptors lead; a removed file still open is named as removed.
const openFiles = async () =>
    Promise.all((await fs.readdir('/proc/self/fd')).map(fd =>
        fs.readlink(join('/proc/self/fd', fd)).catch(() => '')
    ))

const until = async (condition, waited = 0) => {
    if (await condition()) {
        return
    }
    assert.ok(waited < WAIT_MS, 'the condition never held')
    await delay(POLL_MS)
    return until(condition, waited + POLL_MS)
}

const aHome = async username => {
    const home = join(homes, username)
    await fs.mkdir(join(home, 'project'), {recursive: true})
    return home
}

const aFile = async (home, path, content) => {
    await fs.mkdir(dirname(join(home, path)), {recursive: true})
    await fs.writeFile(join(home, path), content)
}

// A socket where a file is expected: opening it for writing fails.
const aSocket = async (path, t) => {
    const socket = createServer()
    await new Promise(resolve => socket.listen(path, resolve))
    t.after(() => new Promise(resolve => socket.close(resolve)))
}

const emptied = async directory => {
    await fs.rm(directory, {recursive: true, force: true})
    await fs.mkdir(directory)
}

const exists = path =>
    fs.lstat(path).then(() => true, () => false)
