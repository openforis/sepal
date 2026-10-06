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
const UNAUTHORIZED = [401, 403]

const sleepUnlessAborted = (ms, signal) => setTimeout(ms, undefined, {signal}).catch(() => {})

// The files of an export's intermediate store, into dir. A listing carries credentials that expire (the
// user's Drive token, signed URLs), so it is renewed before expiry and on any refusal.
export const downloadFiles = async ({destination, dir, sepal, report, signal, fetchFn = fetch, sleep = sleepUnlessAborted, now = Date.now}) => {
    const listing = new Listing({destination, sepal, now})
    const files = await listing.files()
    const targets = new Map(files.map(({name}) => [name, target(dir, name)]))
    const totalBytes = files.reduce((total, {size}) => total + size, 0)
    let downloadedBytes = 0
    const progress = () => report({
        defaultMessage: `Downloading - ${files.length} ${files.length === 1 ? 'file' : 'files'} / ${fileSize(totalBytes - downloadedBytes)} left`,
        messageKey: 'tasks.download.progress',
        messageArgs: {bytes: fileSize(totalBytes - downloadedBytes), files: files.length}
    })
    progress()
    await forEachInParallel(files, CONCURRENT_FILES, signal, async ({name, size}, fileSignal) => {
        await downloadFile({name, path: targets.get(name), listing, fetchFn, sleep, signal: fileSignal})
        if (!fileSignal.aborted) {
            downloadedBytes += size
            progress()
        }
    })
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

const downloadFile = async ({name, path, listing, fetchFn, sleep, signal}) => {
    const partial = `${path}.part`
    await mkdir(dirname(path), {recursive: true})
    for (let attempt = 1; !signal.aborted; attempt++) {
        const {url, headers} = await listing.file(name)
        try {
            const response = await fetchFn(url, {headers, signal})
            if (UNAUTHORIZED.includes(response.status) && attempt < MAX_ATTEMPTS) {
                await response.body?.cancel()
                await listing.relist()
                continue
            }
            if (!response.ok) {
                await response.body?.cancel()
                throw Object.assign(new Error(`Download of ${name} failed: ${response.status}`), {statusCode: response.status})
            }
            await pipeline(Readable.fromWeb(response.body), createWriteStream(partial), {signal})
            await rename(partial, path)
            return
        } catch (error) {
            await rm(partial, {force: true})
            if (signal.aborted) {
                return
            }
            if (attempt >= MAX_ATTEMPTS) {
                throw error
            }
            log.warn(`Download of ${name} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${error.message}`)
            await sleep(500 * 2 ** (attempt - 1), signal)
        }
    }
}

const target = (dir, name) => {
    const path = resolve(dir, name)
    const inside = relative(resolve(dir), path)
    if (!inside || inside.split(sep)[0] === '..') {
        throw new Error(`Not a file name inside the export: '${name}'`)
    }
    return path
}
