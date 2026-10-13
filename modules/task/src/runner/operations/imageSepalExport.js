import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'

import {isWorkspaceDataPath} from '../dataPath.js'
import {exportToWorkspace} from '../workspaceExport.js'
import {buildVrt} from './imageVrt.js'

export const imageSepalExport = async (params, {sepal, report, signal, sleep}) => {
    const {recipe, workspacePath, filenamePrefix, bands} = params.image
    if (isWorkspaceDataPath(workspacePath)) {
        throw Object.assign(new Error(`Workspace folder is reserved for Data: ${workspacePath}`), {
            userMessage: {
                key: 'tasks.workspace.dataReserved',
                message: 'Folder "data" in your workspace is your Data. Export to the Data destination instead.'
            }
        })
    }
    const description = recipe.title || recipe.placeholder
    const downloadDir = workspacePath
        ? join(process.env.HOME, workspacePath)
        : join(process.env.HOME, 'downloads', description)
    await mkdir(downloadDir, {recursive: true})
    const {downloaded} = await exportToWorkspace({
        start: () => sepal.startExport('task/export/image/sepal', params),
        downloadDir, sepal, report, signal, sleep
    })
    if (downloaded) {
        await buildVrt({dir: downloadDir, name: filenamePrefix || description, bands})
    }
}
