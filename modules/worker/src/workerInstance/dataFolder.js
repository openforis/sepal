import * as nodeFs from 'node:fs/promises'
import {join} from 'node:path'

import {getLogger} from '#sepal/log'

const log = getLogger('dataFolder')

const DATA = 'data'
const MOVED = 'data.local'

// ~/data is where the user's Data is mounted. Whatever the user kept there before is moved aside, never mounted over.
export class DataFolder {
    #homeRoot
    #fs
    #notify

    constructor({homeRoot = '/data/home', fs = nodeFs, notify = () => {}}) {
        this.#homeRoot = homeRoot
        this.#fs = fs
        this.#notify = notify
    }

    async prepare(username) {
        const home = join(this.#homeRoot, username)
        const {uid, gid} = await this.#fs.stat(home)
        const movedTo = await this.#moveAside(home)
        const data = join(home, DATA)
        await this.#fs.mkdir(data).catch(error => {
            if (error.code !== 'EEXIST') throw error
        })
        if (!(await this.#fs.lstat(data)).isDirectory()) {
            throw new Error(`${data} is not a directory`)
        }
        const chown = this.#fs.lchown ?? this.#fs.chown
        await chown.call(this.#fs, data, uid, gid).catch(error => {
            if (error.code !== 'EPERM') throw error
            log.warn(`Could not change owner of ${data} to ${uid}:${gid}`)
        })
        if (movedTo) {
            log.info(`Moved ${username}'s ${DATA} to ${movedTo}`)
            this.#notify({username, subject: 'Your data folder was renamed', content: movedContent(movedTo)})
        }
        return {uid, gid, movedTo}
    }

    async #moveAside(home) {
        const data = join(home, DATA)
        const existing = await this.#fs.lstat(data).catch(error => {
            if (error.code === 'ENOENT') return null
            throw error
        })
        if (!existing || (existing.isDirectory() && (await this.#fs.readdir(data)).length === 0)) {
            return null
        }
        const name = await this.#freeName(home)
        await this.#fs.rename(data, join(home, name))
        return name
    }

    async #freeName(home) {
        for (let n = 0; ; n++) {
            const name = n === 0 ? MOVED : `${MOVED}.${n}`
            const taken = await this.#fs.lstat(join(home, name)).then(() => true, () => false)
            if (!taken) return name
        }
    }
}

const movedContent = movedTo =>
    '<p>Your home folder had a folder or file named <b>data</b>. SEPAL now uses <b>~/data</b> for your Data, '
    + `so your files were moved to <b>~/${movedTo}</b>. Nothing was deleted.</p>`
