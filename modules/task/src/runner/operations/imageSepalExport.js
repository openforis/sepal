import {mkdir, readdir} from 'node:fs/promises'
import {join} from 'node:path'

import {lastValueFrom} from 'rxjs'

import {createVrt$, setBandNames$} from '#sepal/gdal'

import {exportToWorkspace} from '../workspaceExport.js'

export const imageSepalExport = async (params, {sepal, report, signal, sleep}) => {
    const {recipe, workspacePath, filenamePrefix, bands} = params.image
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
        const vrtPath = join(downloadDir, `${filenamePrefix || description}.vrt`)
        const inputPaths = await geoTiffs(downloadDir)
        await lastValueFrom(createVrt$({inputPaths, outputPath: vrtPath}), {defaultValue: null})
        await lastValueFrom(setBandNames$(vrtPath, bands.selection), {defaultValue: null})
    }
}

const geoTiffs = async dir =>
    (await readdir(dir))
        .filter(name => name.endsWith('.tif'))
        .sort()
        .map(name => join(dir, name))
