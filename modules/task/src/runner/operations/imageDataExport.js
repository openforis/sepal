import {mkdir, readdir, rm} from 'node:fs/promises'
import {join} from 'node:path'

import {requireDataPath} from '../dataPath.js'
import {copyFile} from '../rclone.js'
import {exportToWorkspace} from '../workspaceExport.js'
import {buildVrt} from './imageVrt.js'

export const imageDataExport = async (params, {sepal, report, signal, sleep, copy = copyFile}) => {
    const {recipe, filenamePrefix, bands} = params.image
    const dataPath = requireDataPath(params.image.dataPath)
    const staging = join(process.env.HOME, '.data-staging', process.env.TASK_ID)
    await rm(staging, {recursive: true, force: true})
    await mkdir(staging, {recursive: true})
    try {
        const {downloaded} = await exportToWorkspace({
            start: () => sepal.startExport('task/export/image/sepal', withoutDataPath(params)),
            downloadDir: staging, sepal, report, signal, sleep
        })
        if (downloaded) {
            await buildVrt({dir: staging, name: filenamePrefix || recipe.title || recipe.placeholder, bands})
            await upload({staging, dataPath, sepal, report, signal, copy})
        }
    } finally {
        await rm(staging, {recursive: true, force: true})
    }
}

const withoutDataPath = params => {
    const {dataPath: _dataPath, ...image} = params.image
    return {...params, image}
}

const upload = async ({staging, dataPath, sepal, report, signal, copy}) => {
    const names = (await readdir(staging))
        .filter(name => name.endsWith('.tif') || name.endsWith('.vrt'))
        .sort()
    for (const [uploaded, name] of names.entries()) {
        reportUpload(report, uploaded, names.length)
        const access = await sepal.dataAccess()
        if (access.mode !== 'readWrite') {
            throw Object.assign(new Error('Data is over its quota'), {
                userMessage: {
                    key: 'tasks.data.quotaExceeded',
                    message: 'Your Data is over its quota. Delete files from Data, or ask for a larger quota, then export again.'
                }
            })
        }
        await copy({access, localPath: join(staging, name), remotePath: `${dataPath}/${name}`, signal})
    }
    reportUpload(report, names.length, names.length)
    if (names.length) {
        await sepal.dataChanged().catch(() => {})
    }
}

const reportUpload = (report, uploaded, total) =>
    report({
        messageKey: 'tasks.data.upload.progress',
        defaultMessage: `Saving to Data - ${uploaded} of ${total} files`,
        messageArgs: {uploaded, total}
    })
