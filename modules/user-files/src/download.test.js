import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {constants, mkdtempSync} from 'node:fs'
import * as fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, mock, test} from 'node:test'
import {promisify} from 'node:util'

import {configureNoLogging} from '#sepal/log'

// A download decides what it streams by what it opened, never by an earlier look at the path, which a FIFO may
// replace in between: opening that would wait for a writer that never comes. Here every look at the path finds a
// regular file, and whatever opens it finds a FIFO.

const homes = mkdtempSync(join(tmpdir(), 'user-files-'))
const home = join(homes, 'alice')
const path = join(home, 'report.csv')
const file = join(homes, 'file')
const fifo = join(homes, 'fifo')

const swapping = {path, fifoInPlace: false}

const lookingAsAFile = lookup => async (lookedUp, ...args) => {
    if (lookedUp !== swapping.path) {
        return lookup(lookedUp, ...args)
    }
    await putInPlace(false)
    try {
        return await lookup(lookedUp, ...args)
    } finally {
        await putInPlace(true)
    }
}

mock.module('node:fs/promises', {
    exports: {...fs, lstat: lookingAsAFile(fs.lstat), stat: lookingAsAFile(fs.stat)}
})

const {download} = await import('./filesystem.js')

configureNoLogging()

after(async () => {
    await releaseFifo()
    await fs.rm(homes, {recursive: true, force: true})
})

// A download waiting on the FIFO fails here rather than holding up the run; releasing the FIFO afterwards lets it end.
test('refuses a regular file replaced by a FIFO before it is opened, without waiting for a writer', {timeout: 5000}, async () => {
    await fs.mkdir(home)
    await fs.writeFile(file, 'a,b')
    await promisify(execFile)('mkfifo', [fifo])
    await putInPlace(true)
    const ctx = {
        request: {headers: {'sepal-user': JSON.stringify({username: 'alice'})}},
        query: {path: 'report.csv'},
        response: {},
        attachment: () => null
    }

    await download(homes, ctx)

    ctx.body?.destroy?.()
    assert.equal(ctx.response.status, 400)
    assert.deepEqual(await openedFrom([path, fifo]), [])
})

// Puts the FIFO or the regular file at the path, keeping the other aside.
const putInPlace = async fifoInPlace => {
    if (swapping.fifoInPlace !== fifoInPlace) {
        swapping.fifoInPlace = fifoInPlace
        const [away, back] = fifoInPlace ? [file, fifo] : [fifo, file]
        await fs.rename(path, away).catch(error => {
            if (error.code !== 'ENOENT') {
                throw error
            }
        })
        await fs.rename(back, path)
    }
}

// Lets a reader still waiting on the FIFO go: opening it to read and write never waits.
const releaseFifo = async () => {
    const at = swapping.fifoInPlace ? path : fifo
    const handle = await fs.open(at, constants.O_RDWR | constants.O_NONBLOCK).catch(() => null)
    await handle?.close()
}

// The paths among these that this process still has open.
const openedFrom = async paths => {
    const descriptors = await fs.readdir('/proc/self/fd')
    const opened = await Promise.all(descriptors.map(fd => fs.readlink(`/proc/self/fd/${fd}`).catch(() => null)))
    return opened.filter(target => paths.includes(target))
}
