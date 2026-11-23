import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {EventEmitter, once} from 'node:events'
import * as nodeFs from 'node:fs'
import * as fs from 'node:fs/promises'
import {request as httpRequest} from 'node:http'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {Readable} from 'node:stream'
import {after, afterEach, describe, mock, test} from 'node:test'
import {setTimeout as delay} from 'node:timers/promises'
import {promisify} from 'node:util'

import _ from 'lodash'

import {configureNoLogging} from '#sepal/log'

// Uploads through the module's server, route and multipart parser. The parser keeps what it receives in the process's
// temporary directory, here one of the test's own, which every upload must leave empty however it ends. What an upload
// publishes in a home must appear whole, or not at all.

const POLL_MS = 20
const WAIT_MS = 5000
const HOLD_MS = 200
const CHUNK_BYTES = 4
const BOUNDARY = 'upload-boundary'
const SOMEONE_ELSE = {uid: 1234, gid: 1234}

const asRoot = process.getuid() === 0

const scratch = nodeFs.realpathSync(nodeFs.mkdtempSync(join(tmpdir(), 'user-files-')))
const homes = join(scratch, 'homes')
const uploads = join(scratch, 'uploads')
nodeFs.mkdirSync(homes)
nodeFs.mkdirSync(uploads)
process.env.TMPDIR = uploads

// Faults armed for what an upload does next:
// - failRemoval: removing the next file in this directory fails, as it might for reasons of its own.
// - holdOpening: opening the next temporary file is held until removing it has been tried, or a moment has passed: a
//   file removed before its opening completes would be created afterwards.
// - checks: the next checks of whether this path exists each wait, once made, until all have been made.
// - reads: each next reading of an uploaded file is interrupted, in turn, after its first chunk.
// - staging: the next file opened in a home cannot be written, or one operation on it fails.
// - publishing: done just before the next file in a home is published, by link or rename.
const faults = {failRemoval: null, holdOpening: null, checks: null, reads: [], staging: null, publishing: null}
const removals = new EventEmitter()

const within = (directory, path) =>
    typeof path === 'string' && path.startsWith(directory)

const inUploads = path =>
    within(uploads, path)

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
    },
    createReadStream: (path, options) => {
        const interruption = inUploads(path) && faults.reads.shift()
        return interruption
            ? Readable.from(
                interruptedAfterFirstChunk(nodeFs.createReadStream(path, {...options, highWaterMark: CHUNK_BYTES}), interruption),
                {objectMode: false}
            )
            : nodeFs.createReadStream(path, options)
    }
}

mock.module('node:fs', {
    exports: {...fakeFs, default: fakeFs}
})

mock.module('node:fs/promises', {
    exports: {
        ...fs,
        open: async (path, flags, mode) => {
            const failing = within(homes, path) && faults.staging
            if (!failing) {
                return fs.open(path, flags, mode)
            }
            faults.staging = null
            return failing === 'write'
                ? openedUnwritable(path, flags, mode)
                : failingAt(await fs.open(path, flags, mode), failing)
        },
        lstat: async (path, options) => {
            const outcome = fs.lstat(path, options).then(stats => () => stats, error => () => {
                throw error
            })
            if (faults.checks?.path === path) {
                await faults.checks.made()
            }
            return (await outcome)()
        },
        link: async (existingPath, path) => {
            await beforePublishing(path)
            return fs.link(existingPath, path)
        },
        rename: async (oldPath, path) => {
            await beforePublishing(path)
            return fs.rename(oldPath, path)
        },
        unlink: async path => {
            try {
                if (faults.failRemoval && within(faults.failRemoval, path)) {
                    faults.failRemoval = null
                    throw simulatedFailure('removal')
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
    Object.assign(faults, {failRemoval: null, holdOpening: null, checks: null, reads: [], staging: null, publishing: null})
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
        faults.failRemoval = uploads

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart('a'), aFilePart('b')))

        assert.equal(response.status, 400)
        assert.deepEqual(response.body, {error: 'Only a single file is supported'})
        assert.equal(faults.failRemoval, null)
        assert.equal((await fs.readdir(uploads)).length, 1)
    })
})

describe('publishing an upload', () => {
    test('creates the file whole, owned like the home and readable by all, leaving nothing staged', async () => {
        const alice = await aHome('alice')
        const owner = await ownedLikeDeployedHomes(alice)

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart('a,b')))

        assert.equal(response.status, 200)
        assert.deepEqual(response.body, {message: 'File created successfully', path: 'project/data.csv', overwritten: false})
        assert.equal(await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'a,b')
        assert.deepEqual(await ownership(join(alice, 'project', 'data.csv')), {...owner, mode: 0o644})
        assert.deepEqual(await fs.readdir(join(alice, 'project')), ['data.csv'])
        await temporaryStorageCleared()
    })

    test('replaces a file with a new one, owned like the home and readable by all, leaving links to the old one alone', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'old')
        await fs.link(join(alice, 'project', 'data.csv'), join(alice, 'project', 'linked.csv'))
        const owner = await ownedLikeDeployedHomes(alice)

        const response = await upload({path: 'project/data.csv', overwrite: 'true'}, multipart(aFilePart('new')))

        assert.equal(response.status, 200)
        assert.deepEqual(response.body, {message: 'File overwritten successfully', path: 'project/data.csv', overwritten: true})
        assert.equal(await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'new')
        assert.deepEqual(await ownership(join(alice, 'project', 'data.csv')), {...owner, mode: 0o644})
        assert.equal(await fs.readFile(join(alice, 'project', 'linked.csv'), 'utf8'), 'old')
        assert.deepEqual(await listed(join(alice, 'project')), ['data.csv', 'linked.csv'])
        await temporaryStorageCleared()
    })

    test('keeps the file it would replace when reading the upload fails', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'old')
        faults.reads.push(failingRead)

        const response = await upload({path: 'project/data.csv', overwrite: 'true'}, multipart(aFilePart('new content')))

        assert.equal(response.status, 500)
        assert.deepEqual(response.body, {error: 'Failed to write file'})
        assert.equal(await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'old')
        assert.deepEqual(await fs.readdir(join(alice, 'project')), ['data.csv'])
        await temporaryStorageCleared()
    })

    test('keeps the file it would replace, and what else is there, when writing its staged copy fails', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'old')
        await aFile(alice, 'project/data.csv.part', 'another upload')
        await aFile(alice, 'project/.upload-other', 'another upload')
        faults.staging = 'write'

        const response = await upload({path: 'project/data.csv', overwrite: 'true'}, multipart(aFilePart('new content')))

        assert.equal(response.status, 500)
        assert.deepEqual(response.body, {error: 'Failed to write file'})
        assert.deepEqual(await contents(join(alice, 'project')), {
            '.upload-other': 'another upload',
            'data.csv': 'old',
            'data.csv.part': 'another upload'
        })
        await temporaryStorageCleared()
    })

    test('keeps the file it would replace when syncing its staged copy or setting its owner or permissions fails', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'old')

        for (const operation of ['sync', 'chown', 'chmod']) {
            faults.staging = operation

            const response = await upload({path: 'project/data.csv', overwrite: 'true'}, multipart(aFilePart('new content')))

            assert.equal(response.status, 500, operation)
            assert.deepEqual(response.body, {error: 'Failed to write file'}, operation)
            assert.deepEqual(await contents(join(alice, 'project')), {'data.csv': 'old'}, operation)
            await temporaryStorageCleared()
        }
    })

    // Created after every check an upload could make, refusing it takes publishing that refuses an existing file.
    test('refuses to replace a file created just before the upload is published, keeping it', async () => {
        const alice = await aHome('alice')
        faults.publishing = () => fs.writeFile(join(alice, 'project', 'data.csv'), 'created meanwhile', {flag: 'wx'})

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart('uploaded')))

        assert.equal(faults.publishing, null)
        assert.equal(response.status, 409)
        assert.deepEqual(response.body, {error: 'Cannot overwrite existing files'})
        assert.deepEqual(await contents(join(alice, 'project')), {'data.csv': 'created meanwhile'})
        await temporaryStorageCleared()
    })

    test('lets one of several uploads creating a file at once win, refusing the others', async () => {
        const alice = await aHome('alice')
        const uploaded = ['first upload', 'the second upload', 'third']
        holdChecks(join(alice, 'project', 'data.csv'), uploaded.length)

        const responses = await Promise.all(uploaded.map(content =>
            upload({path: 'project/data.csv'}, multipart(aFilePart(content)))
        ))

        const won = uploaded.filter((_content, index) => responses[index].status === 200)
        assert.equal(won.length, 1)
        assert.deepEqual(
            responses.filter(({status}) => status !== 200),
            [409, 409].map(status => ({status, body: {error: 'Cannot overwrite existing files'}}))
        )
        assert.deepEqual(await contents(join(alice, 'project')), {'data.csv': won[0]})
        await temporaryStorageCleared()
    })

    test('shows readers each version whole, and the old one to readers that opened it before', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'old version')
        const openedBefore = await fs.open(join(alice, 'project', 'data.csv'))
        const uploaded = ['first overwrite', 'the second overwrite']
        const reads = holdNextReads(uploaded.length)
        const responding = uploaded.map(content =>
            upload({path: 'project/data.csv', overwrite: 'true'}, multipart(aFilePart(content)))
        )
        await reads.held

        const readWhileUploading = await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8')
        reads.release()
        const responses = await Promise.all(responding)
        const readThroughOpened = await openedBefore.readFile('utf8')
        await openedBefore.close()

        assert.equal(readWhileUploading, 'old version')
        assert.deepEqual(responses.map(({status}) => status), [200, 200])
        assert.ok(uploaded.includes(await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8')))
        assert.equal(readThroughOpened, 'old version')
        assert.deepEqual(await fs.readdir(join(alice, 'project')), ['data.csv'])
        await temporaryStorageCleared()
    })

    test('refuses to replace anything but a regular file, leaving it as it is', {timeout: 2 * WAIT_MS}, async t => {
        const alice = await aHome('alice')
        await aSocket(join(alice, 'project', 'socket'), t)
        await aFifo(join(alice, 'project', 'fifo'))
        if (asRoot) {
            await aDevice(join(alice, 'project', 'device'))
        }
        const before = await kinds(join(alice, 'project'))

        for (const name of Object.keys(before)) {
            const response = await upload({path: `project/${name}`, overwrite: 'true'}, multipart(aFilePart('new')))

            assert.equal(response.status, 400, name)
            assert.deepEqual(response.body, {error: 'Target exists and is not a regular file'}, name)
        }
        assert.deepEqual(await kinds(join(alice, 'project')), before)
        await temporaryStorageCleared()
    })

    test('answers an upload it published as such, though its staged name cannot be removed', async () => {
        const alice = await aHome('alice')
        faults.failRemoval = join(alice, 'project')

        const response = await upload({path: 'project/data.csv'}, multipart(aFilePart('a,b')))

        assert.equal(response.status, 200)
        assert.deepEqual(response.body, {message: 'File created successfully', path: 'project/data.csv', overwritten: false})
        assert.equal(await fs.readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'a,b')
        assert.equal(faults.failRemoval, null)
        await temporaryStorageCleared()
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

// Holds each next check of whether a path exists, once made, until this many have been made: none of them sees what
// another does after its check.
const holdChecks = (path, count) => {
    const all = Promise.withResolvers()
    const made = []
    faults.checks = {
        path,
        made: () => {
            made.push(path)
            if (made.length === count) {
                all.resolve()
            }
            return all.promise
        }
    }
}

// Holds the next readings of uploaded files after their first chunk, telling when all are held, until released.
const holdNextReads = count => {
    const release = Promise.withResolvers()
    const holds = Array.from({length: count}, () => Promise.withResolvers())
    faults.reads.push(...holds.map(hold => () => {
        hold.resolve()
        return release.promise
    }))
    return {held: Promise.all(holds.map(({promise}) => promise)), release: () => release.resolve()}
}

const beforePublishing = async path => {
    const action = within(homes, path) && faults.publishing
    if (action) {
        faults.publishing = null
        await action()
    }
}

const failingRead = () =>
    Promise.reject(simulatedFailure('read'))

async function* interruptedAfterFirstChunk(stream, interruption) {
    const chunks = stream[Symbol.asyncIterator]()
    try {
        const first = await chunks.next()
        if (!first.done) {
            yield first.value
        }
        await interruption()
        yield* chunks
    } finally {
        await chunks.return()
    }
}

// The file is created as asked, but the handle answered cannot write to it.
const openedUnwritable = async (path, flags, mode) => {
    await (await fs.open(path, flags, mode)).close()
    return fs.open(path, 'r')
}

const failingAt = (handle, operation) =>
    new Proxy(handle, {
        get: (target, property) => {
            if (property === operation) {
                return () => Promise.reject(simulatedFailure(operation))
            }
            const value = Reflect.get(target, property, target)
            return typeof value === 'function' ? value.bind(target) : value
        }
    })

const simulatedFailure = operation =>
    Object.assign(new Error(`Simulated ${operation} failure`), {code: 'EIO'})

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

// Waits until nothing an upload received remains in temporary storage, and no file of the fixture is held open.
const temporaryStorageCleared = async (waited = 0) => {
    const left = await leftBehind()
    if (left.length && waited < WAIT_MS) {
        await delay(POLL_MS)
        return temporaryStorageCleared(waited + POLL_MS)
    }
    assert.deepEqual(left, [])
}

const leftBehind = async () => [
    ...await fs.readdir(uploads),
    ...(await openFiles()).filter(path => path.startsWith(scratch))
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

// As root, the home and all in it belong to someone other than this service, as deployed homes do. Answers its owner.
const ownedLikeDeployedHomes = async home => {
    if (asRoot) {
        const entries = await fs.readdir(home, {recursive: true})
        for (const path of [home, ...entries.map(entry => join(home, entry))]) {
            await fs.lchown(path, SOMEONE_ELSE.uid, SOMEONE_ELSE.gid)
        }
    }
    const {uid, gid} = await fs.stat(home)
    return {uid, gid}
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

// A FIFO where a file is expected: opening it for writing waits for a reader.
const aFifo = path =>
    promisify(execFile)('mkfifo', [path])

// The null device where a file is expected: writing to it discards what is written.
const aDevice = path =>
    promisify(execFile)('mknod', [path, 'c', '1', '3'])

const ownership = async path => {
    const {uid, gid, mode} = await fs.stat(path)
    return {uid, gid, mode: mode & 0o777}
}

const listed = async directory =>
    (await fs.readdir(directory)).sort()

const contents = async directory =>
    Object.fromEntries(await Promise.all((await listed(directory)).map(async name =>
        [name, await fs.readFile(join(directory, name), 'utf8')]
    )))

const kinds = async directory =>
    Object.fromEntries(await Promise.all((await listed(directory)).map(async name =>
        [name, kind(await fs.lstat(join(directory, name)))]
    )))

const kind = stats =>
    ['isFile', 'isDirectory', 'isSymbolicLink', 'isSocket', 'isFIFO', 'isCharacterDevice', 'isBlockDevice']
        .find(is => stats[is]())

const emptied = async directory => {
    await fs.rm(directory, {recursive: true, force: true})
    await fs.mkdir(directory)
}

const exists = path =>
    fs.lstat(path).then(() => true, () => false)
