import * as nodeFs from 'node:fs/promises'
import {join} from 'node:path'

import {getLogger} from '#sepal/log'

const log = getLogger('dataFolder')

export const DATA_FOLDER = 'data'

const MOVED = 'data.local'
const ATTEMPTS = 3
// What a check or rename fails with when another process moved data, or took the chosen name, in between.
const RACED = ['ENOENT', 'EEXIST', 'ENOTEMPTY', 'ENOTDIR', 'EISDIR']

// ~/data is where the user's Data is mounted. Whatever the user kept there before is moved aside, never mounted
// over or hidden: an absent or empty data folder stays, anything else is renamed to the first free
// data.local[.n] and the user is told. The worker and user-files may both do this at once.
// Returns the name it was moved to, or null.
export async function moveDataFolderAside({home, username, notify, fs = nodeFs}) {
    for (let attempt = 1; ; attempt++) {
        try {
            const movedTo = await moveOnce(home, fs)
            if (movedTo) {
                log.info(`Moved ${username}'s ${DATA_FOLDER} to ${movedTo}`)
                notify({username, subject: 'Your data folder was renamed', content: movedContent(movedTo)})
            }
            return movedTo
        } catch (error) {
            if (!RACED.includes(error.code) || attempt === ATTEMPTS) {
                throw error
            }
        }
    }
}

async function moveOnce(home, fs) {
    const data = join(home, DATA_FOLDER)
    const existing = await fs.lstat(data).catch(error => {
        if (error.code === 'ENOENT') return null
        throw error
    })
    if (!existing || (existing.isDirectory() && (await fs.readdir(data)).length === 0)) {
        return null
    }
    const name = await freeName(home, fs)
    await fs.rename(data, join(home, name))
    return name
}

async function freeName(home, fs) {
    for (let n = 0; ; n++) {
        const name = n === 0 ? MOVED : `${MOVED}.${n}`
        const taken = await fs.lstat(join(home, name)).then(() => true, () => false)
        if (!taken) return name
    }
}

const movedContent = movedTo =>
    '<p>Your home folder had a folder or file named <b>data</b>. SEPAL now uses <b>~/data</b> for your Data, '
    + `so your files were moved to <b>~/${movedTo}</b>. Nothing was deleted.</p>`
