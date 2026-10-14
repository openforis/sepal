import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {jest} from '@jest/globals'
import {from, of} from 'rxjs'

let downloaded = true

jest.unstable_mockModule('../workspaceExport.js', () => ({
    exportToWorkspace: async args => {
        await args.start()
        if (downloaded) {
            await writeFile(join(args.downloadDir, 'b.tif'), 'b')
            await writeFile(join(args.downloadDir, 'a.tif'), 'a')
            await writeFile(join(args.downloadDir, 'c.tif.part'), 'c')
        }
        return {downloaded}
    }
}))

jest.unstable_mockModule('#sepal/gdal', () => ({
    createVrt$: ({outputPath}) => {
        return from(writeFile(outputPath, 'vrt'))
    },
    setBandNames$: () => of(null)
}))

const {imageDataExport} = await import('./imageDataExport.js')

let staging

beforeEach(async () => {
    staging = await mkdtemp(join(tmpdir(), 'image-data-staging-'))
    downloaded = true
})

afterEach(() => rm(staging, {recursive: true, force: true}))

const rw = {mode: 'readWrite'}
const ro = {mode: 'read'}
const params = {image: {recipe: {title: 'r'}, dataPath: 'exports/r', filenamePrefix: 'p', bands: {selection: ['b1']}}}

test('uploads every exported file and the VRT from staging to the Data folder', async () => {
    const {run, sepal, copies} = harness({accesses: [rw, rw, rw]})

    await run(params)

    expect(copies.map(c => c.remotePath)).toEqual(['exports/r/a.tif', 'exports/r/b.tif', 'exports/r/p.vrt'])
    expect(copies.map(c => c.localPath)).toEqual(['a.tif', 'b.tif', 'p.vrt'].map(name => join(staging, name)))
    expect(copies.map(c => c.content)).toEqual(['a', 'b', 'vrt'])
    expect(sepal.changed).toBe(1)
})

test('reports how many files are saved', async () => {
    const {run, reports} = harness({accesses: [rw, rw, rw]})

    await run(params)

    expect(reports.map(r => r.messageArgs)).toEqual([
        {uploaded: 0, total: 3}, {uploaded: 1, total: 3}, {uploaded: 2, total: 3}, {uploaded: 3, total: 3}
    ])
    expect(reports[0].messageKey).toBe('tasks.data.upload.progress')
})

test('does not pass the Data folder on to the Earth Engine export', async () => {
    const {run, sepal} = harness({accesses: [rw, rw, rw]})

    await run(params)

    expect(sepal.startExportParams[0].image).not.toHaveProperty('dataPath')
})

test('fails with the quota message when the user goes over the quota between files, keeping what was uploaded', async () => {
    const {run, copies, sepal} = harness({accesses: [rw, ro]})

    await expect(run(params)).rejects.toMatchObject({userMessage: {key: 'tasks.data.quotaExceeded'}})
    expect(copies.map(c => c.remotePath)).toEqual(['exports/r/a.tif'])
    expect(sepal.changed).toBe(1)
})

test('fails saying how many files were saved when an upload fails, keeping the cause for the log', async () => {
    const failure = new Error('rclone: connection reset')
    const {run, sepal} = harness({accesses: [rw, rw, rw], copy: async ({remotePath}) => {
        if (remotePath === 'exports/r/b.tif') {
            throw failure
        }
    }})

    const error = await run(params).catch(error => error)

    expect(error).toMatchObject({userMessage: {key: 'tasks.data.uploadFailed', args: {uploaded: 1, total: 3}}})
    expect(error.cause).toBe(failure)
    expect(sepal.changed).toBe(1)
})

test('does not have Data measured when no file was saved', async () => {
    const {run, sepal} = harness({accesses: [rw], copy: async () => {
        throw new Error('rclone: access denied')
    }})

    await expect(run(params)).rejects.toMatchObject({userMessage: {key: 'tasks.data.uploadFailed', args: {uploaded: 0, total: 3}}})
    expect(sepal.changed).toBe(0)
})

test('uploads nothing and succeeds when the export produced no files', async () => {
    downloaded = false
    const {run, copies, sepal} = harness({})

    await run(params)

    expect(copies).toEqual([])
    expect(sepal.changed).toBe(0)
})

test('stops uploading when cancelled', async () => {
    const controller = new AbortController()
    const {run} = harness({accesses: [rw, rw, rw], copy: ({signal}) => new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})))
    )})

    const running = run(params, {signal: controller.signal})
    setTimeout(() => controller.abort(), 20)

    await expect(running).rejects.toMatchObject({name: 'AbortError'})
})

test('refuses an unsafe Data folder before exporting', async () => {
    const {run, sepal} = harness({})

    await expect(run({image: {...params.image, dataPath: '../x'}})).rejects.toMatchObject({userMessage: {key: 'tasks.data.invalidFolder'}})
    expect(sepal.startExportParams).toEqual([])
})

const harness = ({accesses = [], copy}) => {
    const copies = []
    const reports = []
    const queue = [...accesses]
    const sepal = {
        changed: 0,
        startExportParams: [],
        startExport: async (_path, body) => {
            sepal.startExportParams.push(body)
            return {eeTaskId: 'T', destination: {}}
        },
        dataAccess: async () => queue.shift(),
        dataChanged: async () => { sepal.changed++ }
    }
    const fakeCopy = copy ?? (async ({localPath, remotePath}) => {
        copies.push({remotePath, localPath, content: await readFile(localPath, 'utf8')})
    })
    const run = (p, {signal = new AbortController().signal, ...options} = {}) =>
        imageDataExport(p, {...options, sepal, report: r => reports.push(r), signal, sleep: async () => {}, copy: fakeCopy, staging})
    return {run, sepal, copies, reports}
}
