import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {jest} from '@jest/globals'
import {of} from 'rxjs'

const exportCalls = []
const gdalCalls = []
let downloaded = true
let downloadedFiles = []

jest.unstable_mockModule('../workspaceExport.js', () => ({
    exportToWorkspace: async args => {
        exportCalls.push(args)
        await args.start()
        for (const name of downloadedFiles) {
            await writeFile(join(args.downloadDir, name), '')
        }
        return {downloaded}
    }
}))

jest.unstable_mockModule('#sepal/gdal', () => ({
    createVrt$: options => {
        gdalCalls.push({createVrt: options})
        return of(null)
    },
    setBandNames$: (path, names) => {
        gdalCalls.push({setBandNames: [path, names]})
        return of(null)
    }
}))

const {imageSepalExport} = await import('./imageSepalExport.js')

const originalHome = process.env.HOME
let home

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'image-sepal-'))
    process.env.HOME = home
    exportCalls.length = 0
    gdalCalls.length = 0
    downloaded = true
    downloadedFiles = ['p-2.tif', 'p-1.tif']
})

afterEach(async () => {
    process.env.HOME = originalHome
    await rm(home, {recursive: true, force: true})
})

test('exports into the workspace path, then builds a VRT named for the prefix with the selected band names', async () => {
    const params = {image: {recipe: {title: 'Mosaic'}, workspacePath: 'out', filenamePrefix: 'p', bands: {selection: ['red', 'nir']}}}
    const sepal = fakeSepal()

    await imageSepalExport(params, context(sepal))

    expect(exportCalls[0].downloadDir).toBe(`${home}/out`)
    expect(sepal.started).toEqual([{path: 'task/export/image/sepal', body: params}])
    expect(gdalCalls).toEqual([
        {createVrt: {inputPaths: [`${home}/out/p-1.tif`, `${home}/out/p-2.tif`], outputPath: `${home}/out/p.vrt`}},
        {setBandNames: [`${home}/out/p.vrt`, ['red', 'nir']]}
    ])
})

test('without a workspace path, exports into downloads/<recipe title>', async () => {
    const params = {image: {recipe: {title: 'Mosaic'}, bands: {selection: ['red']}}}

    await imageSepalExport(params, context(fakeSepal()))

    expect(exportCalls[0].downloadDir).toBe(`${home}/downloads/Mosaic`)
    expect(gdalCalls[0].createVrt.outputPath).toBe(`${home}/downloads/Mosaic/Mosaic.vrt`)
})

test('builds the VRT from exactly the downloaded GeoTIFFs, whatever the path and title contain', async () => {
    downloadedFiles = ['a b-2.tif', 'a b-1.tif', 'a b.vrt.aux.xml', 'notes.txt']
    const params = {image: {recipe: {title: 'a b; rm -rf ~'}, workspacePath: 'my exports', filenamePrefix: 'a b', bands: {selection: ['red']}}}

    await imageSepalExport(params, context(fakeSepal()))

    const dir = `${home}/my exports`
    expect(gdalCalls[0].createVrt).toEqual({inputPaths: [`${dir}/a b-1.tif`, `${dir}/a b-2.tif`], outputPath: `${dir}/a b.vrt`})
})

test('an image export cancelled before its download runs no post-processing', async () => {
    downloaded = false
    const params = {image: {recipe: {title: 'Mosaic'}, bands: {selection: ['red']}}}

    await imageSepalExport(params, context(fakeSepal()))

    expect(gdalCalls).toEqual([])
})

const fakeSepal = () => {
    const started = []
    return {
        started,
        startExport: async (path, body) => {
            started.push({path, body})
            return {eeTaskId: 'T', destination: {}}
        }
    }
}

const context = sepal => ({sepal, report: () => {}, signal: new AbortController().signal, sleep: async () => {}})
