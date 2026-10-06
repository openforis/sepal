import {createWriteStream} from 'fs'
import {mkdir, rename, rm} from 'fs/promises'
import {dirname, relative, resolve, sep} from 'path'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import {setTimeout} from 'timers/promises'

import {getLogger} from '#sepal/log'
import {fileSize} from '#task/format'

import {forEachInParallel} from './parallel.js'

const log = getLogger('download')

const CONCURRENT_FILES = 3
const MAX_ATTEMPTS = 5
const RELIST_BEFORE_EXPIRY_MS = 60 * 1000
const REPORT_INTERVAL_MS = 5 * 1000
const UNAUTHORIZED = [401, 403]

const sleepUnlessAborted = (ms, signal) => setTimeout(ms, undefined, {signal}).catch(() => {})

// The files of an export's intermediate store, into dir. A listing carries credentials that expire (the
// user's Drive token, signed URLs), so it is renewed before expiry and on any refusal.
export const downloadFiles = async ({destination, dir, sepal, report, signal, fetchFn = fetch, sleep = sleepUnlessAborted, now = Date.now}) => {
    const listing = new Listing({destination, sepal, now})
    const files = await listing.files()
    const targets = targetsOf(dir, files)
    const progress = new Progress({files, report, now})
    await forEachInParallel(files, CONCURRENT_FILES, signal, ({name}, fileSignal) =>
        downloadFile({name, path: targets.get(name), listing, progress, fetchFn, sleep, signal: fileSignal})
    )
    if (!signal.aborted) {
        progress.done()
    }
}

class Listing {
    #destination
    #sepal
    #now
    #listing = null

    constructor({destination, sepal, now}) {
        this.#destination = destination
        this.#sepal = sepal
        this.#now = now
    }

    async files() {
        await this.#current()
        return this.#listing.files
    }

    async file(name) {
        await this.#current()
        const file = this.#listing.files.find(file => file.name === name)
        if (!file) {
            throw new Error(`${name} is no longer in the export`)
        }
        return file
    }

    async relist() {
        this.#listing = await this.#sepal.gee('task/download/files', {destination: this.#destination})
    }

    async #current() {
        if (!this.#listing || this.#now() > this.#listing.expiresAt - RELIST_BEFORE_EXPIRY_MS) {
            await this.relist()
        }
    }
}

const downloadFile = async ({name, path, listing, progress, fetchFn, sleep, signal}) => {
    const partial = `${path}.part`
    await mkdir(dirname(path), {recursive: true})
    let refusals = 0
    for (let attempt = 1; !signal.aborted; attempt++) {
        const {url, headers, size} = await listing.file(name)
        try {
            const response = await fetchFn(url, {headers, signal})
            if (UNAUTHORIZED.includes(response.status) && attempt < MAX_ATTEMPTS) {
                await response.body?.cancel()
                if (++refusals > 1) {
                    await sleep(backoff(attempt), signal)
                }
                if (!signal.aborted) {
                    await listing.relist()
                }
                continue
            }
            if (!response.ok) {
                await response.body?.cancel()
                throw Object.assign(new Error(`Download of ${name} failed: ${response.status}`), {statusCode: response.status})
            }
            const bytes = await write(response.body, partial, bytes => progress.received(name, bytes), signal)
            if (bytes !== size) {
                throw new Error(`Download of ${name} has ${bytes} bytes, not the ${size} listed`)
            }
            await rename(partial, path)
            return
        } catch (error) {
            await rm(partial, {force: true})
            progress.restarted(name)
            if (signal.aborted) {
                return
            }
            if (attempt >= MAX_ATTEMPTS) {
                throw error
            }
            log.warn(`Download of ${name} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${error.message}`)
            await sleep(backoff(attempt), signal)
        }
    }
}

const backoff = attempt => 500 * 2 ** (attempt - 1)

const write = async (body, path, onReceived, signal) => {
    let bytes = 0
    await pipeline(
        Readable.fromWeb(body),
        async function* (chunks) {
            for await (const chunk of chunks) {
                bytes += chunk.length
                onReceived(chunk.length)
                yield chunk
            }
        },
        createWriteStream(path),
        {signal}
    )
    return bytes
}

// What is left to download, reported at most every REPORT_INTERVAL_MS while files stream.
class Progress {
    #files
    #totalBytes
    #received = new Map()
    #report
    #now
    #lastReported

    constructor({files, report, now}) {
        this.#files = files.length
        this.#totalBytes = files.reduce((total, {size}) => total + size, 0)
        this.#report = report
        this.#now = now
        this.#send(this.#totalBytes)
    }

    received(name, bytes) {
        this.#received.set(name, (this.#received.get(name) ?? 0) + bytes)
        if (this.#now() - this.#lastReported >= REPORT_INTERVAL_MS) {
            const receivedBytes = [...this.#received.values()].reduce((total, bytes) => total + bytes, 0)
            this.#send(Math.max(0, this.#totalBytes - receivedBytes))
        }
    }

    restarted(name) {
        this.#received.delete(name)
    }

    done() {
        this.#send(0)
    }

    #send(bytesLeft) {
        this.#lastReported = this.#now()
        const bytes = fileSize(bytesLeft)
        this.#report({
            defaultMessage: `Downloading - ${this.#files} ${this.#files === 1 ? 'file' : 'files'} / ${bytes} left`,
            messageKey: 'tasks.download.progress',
            messageArgs: {bytes, files: this.#files}
        })
    }
}

// Two names for one path would have two downloads write the same file.
const targetsOf = (dir, files) => {
    const targets = new Map()
    const paths = new Set()
    for (const {name} of files) {
        const path = target(dir, name)
        if (paths.has(path)) {
            throw new Error(`The export names '${name}' more than once`)
        }
        paths.add(path)
        targets.set(name, path)
    }
    return targets
}

const target = (dir, name) => {
    const path = resolve(dir, name)
    const inside = relative(resolve(dir), path)
    if (!inside || inside.split(sep)[0] === '..') {
        throw new Error(`Not a file name inside the export: '${name}'`)
    }
    return path
}
