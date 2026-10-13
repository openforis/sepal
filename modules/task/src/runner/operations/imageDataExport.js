import {utimesSync} from 'node:fs'
import {lstat, mkdir, readdir, rm} from 'node:fs/promises'
import {join} from 'node:path'

import {getLogger} from '#sepal/log'

import {requireDataPath} from '../dataPath.js'
import {copyFile} from '../rclone.js'
import {exportToWorkspace} from '../workspaceExport.js'
import {buildVrt} from './imageVrt.js'

const log = getLogger('imageDataExport')

// A running task touches its staging on every progress report, so staging this old belongs to a task that has
// reported nothing for a week. Only an Earth Engine export can be that quiet, before any file is staged, and the
// download recreates the folder.
export const STALE_STAGING_MS = 7 * 24 * 60 * 60 * 1000

export const imageDataExport = async (params, {sepal, report, signal, sleep, copy = copyFile, now = () => Date.now(), remove = rm}) => {
    const {recipe, filenamePrefix, bands} = params.image
    const dataPath = requireDataPath(params.image.dataPath)
    const stagingRoot = join(process.env.HOME, '.data-staging')
    const staging = join(stagingRoot, process.env.TASK_ID)
    await sweepStaleStaging({stagingRoot, own: process.env.TASK_ID, now, remove})
    await rm(staging, {recursive: true, force: true})
    await mkdir(staging, {recursive: true})
    const reportFresh = touchingStaging({report, staging, now})
    try {
        const {downloaded} = await exportToWorkspace({
            start: () => sepal.startExport('task/export/image/sepal', withoutDataPath(params)),
            downloadDir: staging, sepal, report: reportFresh, signal, sleep
        })
        if (downloaded) {
            await buildVrt({dir: staging, name: filenamePrefix || recipe.title || recipe.placeholder, bands})
            await upload({staging, dataPath, sepal, report: reportFresh, signal, copy})
        }
    } finally {
        await rm(staging, {recursive: true, force: true})
    }
}

// A killed task never reaches its cleanup, and its id is never reused. An entry's own age counts (lstat), so a
// dangling link is swept too, and an entry that cannot be swept holds up no other.
const sweepStaleStaging = async ({stagingRoot, own, now, remove}) => {
    for (const name of await stagingEntries(stagingRoot)) {
        if (name !== own) {
            const path = join(stagingRoot, name)
            try {
                const {mtimeMs} = await lstat(path)
                if (now() - mtimeMs > STALE_STAGING_MS) {
                    await remove(path, {recursive: true, force: true})
                }
            } catch (error) {
                log.warn(`Could not sweep stale Data staging ${path}`, error)
            }
        }
    }
}

const stagingEntries = async stagingRoot => {
    try {
        return await readdir(stagingRoot)
    } catch (error) {
        if (error.code !== 'ENOENT') {
            log.warn('Could not list Data staging folders', error)
        }
        return []
    }
}

// The folder's mtime moves only when its entries change, and Earth Engine can export for long before any file is
// written to it.
const touchingStaging = ({report, staging, now}) => statusDescription => {
    try {
        const time = new Date(now())
        utimesSync(staging, time, time)
    } catch (error) {
        log.warn(`Could not touch Data staging ${staging}`, error)
    }
    report(statusDescription)
}

const withoutDataPath = params => {
    const {dataPath: _dataPath, ...image} = params.image
    return {...params, image}
}

// Whatever ends the upload, Data is measured again once a file landed in it, unless the user cancelled.
const upload = async ({staging, dataPath, sepal, report, signal, copy}) => {
    const names = (await readdir(staging))
        .filter(name => name.endsWith('.tif') || name.endsWith('.vrt'))
        .sort()
    const total = names.length
    let uploaded = 0
    try {
        for (const name of names) {
            reportUpload(report, uploaded, total)
            const access = await sepal.dataAccess()
            if (access.mode !== 'readWrite') {
                throw quotaExceeded()
            }
            await copyOne({copy, access, localPath: join(staging, name), remotePath: `${dataPath}/${name}`, signal, uploaded, total})
            uploaded++
        }
        reportUpload(report, uploaded, total)
    } finally {
        if (uploaded && !signal.aborted) {
            await sepal.dataChanged().catch(() => {})
        }
    }
}

const copyOne = async ({copy, access, localPath, remotePath, signal, uploaded, total}) => {
    try {
        await copy({access, localPath, remotePath, signal})
    } catch (error) {
        throw signal.aborted || error.name === 'AbortError'
            ? error
            : uploadFailed(error, {uploaded, total})
    }
}

const quotaExceeded = () =>
    Object.assign(new Error('Data is over its quota'), {
        userMessage: {
            key: 'tasks.data.quotaExceeded',
            message: 'Your Data is over its quota. Delete files from Data, or ask for a larger quota, then export again.'
        }
    })

const uploadFailed = (cause, {uploaded, total}) =>
    Object.assign(new Error(`Saving to Data failed: ${cause.message}`, {cause}), {
        userMessage: {
            key: 'tasks.data.uploadFailed',
            message: `Saving to Data failed after ${uploaded} of ${total} files. Delete the folder in Data, or choose another folder, and export again.`,
            args: {uploaded, total}
        }
    })

const reportUpload = (report, uploaded, total) =>
    report({
        messageKey: 'tasks.data.upload.progress',
        defaultMessage: `Saving to Data - ${uploaded} of ${total} files`,
        messageArgs: {uploaded, total}
    })
