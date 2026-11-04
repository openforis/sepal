import {mkdir, readdir, realpath} from 'node:fs/promises'
import {dirname, join, relative, resolve, sep} from 'node:path'

import {lastValueFrom} from 'rxjs'

import {assertEEObjectExport, eeObjectFilenamePrefix, eeObjectWorkspacePath} from '#sepal/eeObjectExport'
import {ClientException} from '#sepal/exception'
import {createVrt$, getBandNames$, setBandNames$} from '#sepal/gdal'
import {escapeRegExp} from '#sepal/string'

import {followEEExport, shareIfPublic} from '../eeExport.js'
import {exportToWorkspace} from '../workspaceExport.js'

export const eeObjectExport = async (params, context) => {
    const spec = params.export
    assertEEObjectExport(spec)
    const {sepal, report, signal, sleep} = context
    const start = () => sepal.startExport('task/export/ee', params)
    if (spec.destination === 'SEPAL') {
        const workspacePath = eeObjectWorkspacePath(spec, params.description)
        const downloadDir = await workspaceDirectory(workspacePath)
        await requireNoFiles(downloadDir, workspacePath)
        await mkdir(downloadDir, {recursive: true})
        const {downloaded} = await exportToWorkspace({...context, start, downloadDir})
        if (downloaded && spec.kind === 'IMAGE') {
            await mosaicTiles(downloadDir, eeObjectFilenamePrefix(spec, params.description))
        }
    } else {
        const {eeTaskId, assetId} = await start()
        if (!eeTaskId) {
            throw new Error('No Earth Engine export was started; Drive exports require a Google account')
        }
        await followEEExport({eeTaskId, sepal, report, signal, sleep})
        if (spec.destination === 'GEE') {
            await shareIfPublic({sharing: spec.sharing, assetId: assetId || spec.assetId, sepal, report, signal})
        }
    }
}

// As the GUI requires of recipe exports: files already there would mix with this export's.
const requireNoFiles = async (dir, workspacePath) => {
    const entries = await readdir(dir).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))
    if (entries.length) {
        throw new ClientException(`workspacePath ${workspacePath} already holds files`, {userMessage: {
            key: 'tasks.status.workspaceNotEmpty',
            message: `The folder ~/${workspacePath} is not empty. Export to an empty or new folder, or remove its contents.`,
            args: {path: workspacePath}
        }})
    }
}

// Earth Engine splits a large image into <name>-<row>-<column>.tif tiles; the VRT opens them as one raster.
const mosaicTiles = async (dir, name) => {
    const tile = new RegExp(`^${escapeRegExp(name)}-\\d+-\\d+\\.tif$`)
    const tiles = (await readdir(dir)).filter(file => tile.test(file)).sort().map(file => join(dir, file))
    if (tiles.length < 2) {
        return
    }
    const vrtPath = join(dir, `${name}.vrt`)
    const bandNames = await lastValueFrom(getBandNames$(tiles[0]))
    await lastValueFrom(createVrt$({inputPaths: tiles, outputPath: vrtPath}), {defaultValue: null})
    if (bandNames.some(Boolean)) {
        await lastValueFrom(setBandNames$(vrtPath, bandNames), {defaultValue: null})
    }
}

// assertEEObjectExport keeps the path itself inside the home; a symlink on the way can still lead out of it.
const workspaceDirectory = async path => {
    const home = resolve(process.env.HOME)
    const dir = resolve(home, path)
    const actualHome = await realpath(home)
    let ancestor = dir
    while (true) {
        try {
            const actual = await realpath(ancestor)
            if (relative(actualHome, actual).split(sep)[0] === '..') {
                throw new ClientException('workspacePath must resolve inside the SEPAL home directory', {userMessage: {
                    key: 'tasks.status.workspaceOutsideHome',
                    message: `The folder ~/${path} leads outside your home folder. Export to a folder inside it.`,
                    args: {path}
                }})
            }
            break
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error
            }
            ancestor = dirname(ancestor)
        }
    }
    return dir
}
