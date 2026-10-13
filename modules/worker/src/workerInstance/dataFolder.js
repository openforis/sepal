import * as nodeFs from 'node:fs/promises'
import {join} from 'node:path'

import {DATA_FOLDER, moveDataFolderAside} from '#sepal/dataFolder'
import {getLogger} from '#sepal/log'

const log = getLogger('dataFolder')

// The mount point of the user's Data, prepared before each session: what the user kept at ~/data is moved aside
// first, never mounted over.
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
        const movedTo = await moveDataFolderAside({home, username, notify: this.#notify, fs: this.#fs})
        const data = join(home, DATA_FOLDER)
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
        return {uid, gid, movedTo}
    }
}
