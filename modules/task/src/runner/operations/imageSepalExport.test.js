import {jest} from '@jest/globals'
import {mkdtemp, rm} from 'fs/promises'
import {tmpdir} from 'os'
import {join} from 'path'
import {of} from 'rxjs'

const exportCalls = []
const gdalCalls = []
let downloaded = true

jest.unstable_mockModule('../workspaceExport.js', () => ({
    exportToWorkspace: async args => {
        exportCalls.push(args)
        await args.start()
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
        {createVrt: {inputPaths: `${home}/out/*.tif`, outputPath: `${home}/out/p.vrt`}},
        {setBandNames: [`${home}/out/p.vrt`, ['red', 'nir']]}
    ])
})

test('without a workspace path, exports into downloads/<recipe title>', async () => {
    const params = {image: {recipe: {title: 'Mosaic'}, bands: {selection: ['red']}}}

    await imageSepalExport(params, context(fakeSepal()))

    expect(exportCalls[0].downloadDir).toBe(`${home}/downloads/Mosaic`)
    expect(gdalCalls[0].createVrt.outputPath).toBe(`${home}/downloads/Mosaic/Mosaic.vrt`)
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
