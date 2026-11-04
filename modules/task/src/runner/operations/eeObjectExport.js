import {mkdir, readdir, realpath} from 'node:fs/promises'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'

import {lastValueFrom} from 'rxjs'

import {assertEEObjectExport, eeObjectImageName, eeObjectWorkspacePath} from '#sepal/eeObjectExport'
import {createVrt$, getBandNames$, setBandNames$} from '#sepal/gdal'
import {escapeRegExp} from '#sepal/string'

import {followEEExport} from '../eeExport.js'
import {exportToWorkspace} from '../workspaceExport.js'

export const eeObjectExport = async (params, context) => {
    const spec = params.export
    assertEEObjectExport(spec)
    const {sepal, report, signal, sleep} = context
    const start = () => sepal.startExport('task/export/ee', params)
    if (spec.destination === 'SEPAL') {
        const downloadDir = await workspaceDirectory(eeObjectWorkspacePath(spec, params.description))
        await mkdir(downloadDir, {recursive: true})
        const {downloaded} = await exportToWorkspace({...context, start, downloadDir})
        if (downloaded && spec.kind === 'IMAGE') {
            await mosaicTiles(downloadDir, eeObjectImageName(spec, params.description))
        }
    } else {
        const {eeTaskId, assetId} = await start()
        if (!eeTaskId) {
            throw new Error('No Earth Engine export was started; Drive exports require a Google account')
        }
        await followEEExport({eeTaskId, sepal, report, signal, sleep})
        if (!signal.aborted && spec.destination === 'GEE' && spec.sharing === 'PUBLIC') {
            await sepal.gee('task/asset/share', {assetId: assetId || spec.assetId})
        }
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

const workspaceDirectory = async path => {
    const home = resolve(process.env.HOME)
    const dir = resolve(home, path)
    if (isAbsolute(path) || relative(home, dir).split(sep)[0] === '..') {
        throw new Error('workspacePath must be relative to the SEPAL home directory')
    }
    const actualHome = await realpath(home)
    let ancestor = dir
    while (true) {
        try {
            const actual = await realpath(ancestor)
            if (relative(actualHome, actual).split(sep)[0] === '..') {
                throw new Error('workspacePath must resolve inside the SEPAL home directory')
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
