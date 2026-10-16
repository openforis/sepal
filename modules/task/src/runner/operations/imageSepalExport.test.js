import assert from 'node:assert/strict'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, mock, test} from 'node:test'

import {of} from 'rxjs'

const exportCalls = []
const gdalCalls = []
let downloaded = true
let downloadedFiles = []

mock.module('../workspaceExport.js', {
    exports: {
        exportToWorkspace: async args => {
            exportCalls.push(args)
            await args.start()
            for (const name of downloadedFiles) {
                await writeFile(join(args.downloadDir, name), '')
            }
            return {downloaded}
        }
    }
})

mock.module('#sepal/gdal', {
    exports: {
        createVrt$: options => {
            gdalCalls.push({createVrt: options})
            return of(null)
        },

        setBandNames$: (path, names) => {
            gdalCalls.push({setBandNames: [path, names]})
            return of(null)
        }
    }
})

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

    assert.equal(exportCalls[0].downloadDir, `${home}/out`)
    assert.equal(exportCalls[0].localProcessing, LOCAL_PROCESSING)
    assert.deepEqual(sepal.started, [{path: 'task/export/image/sepal', body: params}])
    assert.deepEqual(gdalCalls, [
        {createVrt: {inputPaths: [`${home}/out/p-1.tif`, `${home}/out/p-2.tif`], outputPath: `${home}/out/p.vrt`}},
        {setBandNames: [`${home}/out/p.vrt`, ['red', 'nir']]}
    ])
})

test('without a workspace path, exports into downloads/<recipe title>', async () => {
    const params = {image: {recipe: {title: 'Mosaic'}, bands: {selection: ['red']}}}

    await imageSepalExport(params, context(fakeSepal()))

    assert.equal(exportCalls[0].downloadDir, `${home}/downloads/Mosaic`)
    assert.equal(gdalCalls[0].createVrt.outputPath, `${home}/downloads/Mosaic/Mosaic.vrt`)
})

test('builds the VRT from exactly the downloaded GeoTIFFs, whatever the path and title contain', async () => {
    downloadedFiles = ['a b-2.tif', 'a b-1.tif', 'a b.vrt.aux.xml', 'notes.txt']
    const params = {image: {recipe: {title: 'a b; rm -rf ~'}, workspacePath: 'my exports', filenamePrefix: 'a b', bands: {selection: ['red']}}}

    await imageSepalExport(params, context(fakeSepal()))

    const dir = `${home}/my exports`
    assert.deepEqual(
        gdalCalls[0].createVrt,
        {inputPaths: [`${dir}/a b-1.tif`, `${dir}/a b-2.tif`], outputPath: `${dir}/a b.vrt`}
    )
})

test('an image export cancelled before its download runs no post-processing', async () => {
    downloaded = false
    const params = {image: {recipe: {title: 'Mosaic'}, bands: {selection: ['red']}}}

    await imageSepalExport(params, context(fakeSepal()))

    assert.deepEqual(gdalCalls, [])
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

const LOCAL_PROCESSING = {run: work => work()}

const context = sepal => ({sepal, report: () => {}, signal: new AbortController().signal, sleep: async () => {}, localProcessing: LOCAL_PROCESSING})
