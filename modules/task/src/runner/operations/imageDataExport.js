import {readdir} from 'node:fs/promises'
import {join} from 'node:path'

import {requireDataPath} from '../dataPath.js'
import {copyFile} from '../rclone.js'
import {exportToWorkspace} from '../workspaceExport.js'
import {buildVrt} from './imageVrt.js'

// A folder outside the user's home, created empty for this task by task-manager, which removes it once the task
// has ended, however it ended.
const STAGING_DIR = '/staging'

export const imageDataExport = async (params, {sepal, report, signal, sleep, copy = copyFile, staging = STAGING_DIR}) => {
    const {recipe, filenamePrefix, bands} = params.image
    const dataPath = requireDataPath(params.image.dataPath)
    const {downloaded} = await exportToWorkspace({
        start: () => sepal.startExport('task/export/image/sepal', withoutDataPath(params)),
        downloadDir: staging, sepal, report, signal, sleep
    })
    if (downloaded) {
        await buildVrt({dir: staging, name: filenamePrefix || recipe.title || recipe.placeholder, bands})
        await upload({staging, dataPath, sepal, report, signal, copy})
    }
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
