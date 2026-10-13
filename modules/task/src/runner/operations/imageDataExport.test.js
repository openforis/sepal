import {existsSync} from 'node:fs'
import {lstat, lutimes, mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {jest} from '@jest/globals'
import {from, of} from 'rxjs'

let downloaded = true
let duringExport = async () => {}

jest.unstable_mockModule('../workspaceExport.js', () => ({
    exportToWorkspace: async args => {
        await args.start()
        await duringExport(args)
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

const {imageDataExport, STALE_STAGING_MS} = await import('./imageDataExport.js')

const originalHome = process.env.HOME
const originalTaskId = process.env.TASK_ID
let home

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'image-data-'))
    process.env.HOME = home
    process.env.TASK_ID = 't1'
    downloaded = true
    duringExport = async () => {}
})

afterEach(async () => {
    process.env.HOME = originalHome
    process.env.TASK_ID = originalTaskId
    await rm(home, {recursive: true, force: true})
})

const rw = {mode: 'readWrite'}
const ro = {mode: 'read'}
const params = {image: {recipe: {title: 'r'}, dataPath: 'exports/r', filenamePrefix: 'p', bands: {selection: ['b1']}}}

test('uploads every exported file and the VRT to the Data folder, then removes staging', async () => {
    const {run, sepal, copies} = harness({accesses: [rw, rw, rw]})

    await run(params)

    expect(copies.map(c => c.remotePath)).toEqual(['exports/r/a.tif', 'exports/r/b.tif', 'exports/r/p.vrt'])
    expect(copies.map(c => c.content)).toEqual(['a', 'b', 'vrt'])
    expect(sepal.changed).toBe(1)
    expect(existsSync(join(home, '.data-staging', 't1'))).toBe(false)
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
    expect(existsSync(join(home, '.data-staging', 't1'))).toBe(false)
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
    expect(existsSync(join(home, '.data-staging', 't1'))).toBe(false)
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

test('stops uploading and removes staging when cancelled', async () => {
    const controller = new AbortController()
    const {run} = harness({accesses: [rw, rw, rw], copy: ({signal}) => new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})))
    )})

    const running = run(params, {signal: controller.signal})
    setTimeout(() => controller.abort(), 20)

    await expect(running).rejects.toMatchObject({name: 'AbortError'})
    expect(existsSync(join(home, '.data-staging', 't1'))).toBe(false)
})

test('refuses an unsafe Data folder before exporting', async () => {
    const {run, sepal} = harness({})

    await expect(run({image: {...params.image, dataPath: '../x'}})).rejects.toMatchObject({userMessage: {key: 'tasks.data.invalidFolder'}})
    expect(sepal.startExportParams).toEqual([])
})

test('clears leftovers of an earlier run from staging', async () => {
    const {run, copies} = harness({accesses: [rw, rw, rw]})
    const staging = join(home, '.data-staging', 't1')
    await mkdir(staging, {recursive: true})
    await writeFile(join(staging, 'old.tif'), 'old')

    await run(params)

    expect(copies.map(c => c.remotePath)).not.toContain('exports/r/old.tif')
})

test('removes staging folders of other tasks older than a week, keeps recent ones', async () => {
    const {run} = harness({accesses: [rw, rw, rw]})
    const root = join(home, '.data-staging')
    const hoursAgo = hours => new Date(Date.now() - hours * 3600 * 1000)
    for (const [name, age] of [['old', 8 * 24], ['fresh', 1]]) {
        await mkdir(join(root, name), {recursive: true})
        await utimes(join(root, name), hoursAgo(age), hoursAgo(age))
    }

    await run(params)

    expect(existsSync(join(root, 'old'))).toBe(false)
    expect(existsSync(join(root, 'fresh'))).toBe(true)
})

test('keeps its staging fresh with every progress report, so other tasks never sweep it', async () => {
    const reportedAt = Date.now()
    let stagingAge
    duringExport = async ({downloadDir, report}) => {
        await utimes(downloadDir, new Date(0), new Date(0))
        report({messageKey: 'tasks.ee.export.running'})
        stagingAge = reportedAt - (await stat(downloadDir)).mtimeMs
    }
    const {run, reports} = harness({accesses: [rw, rw, rw]})

    await run(params, {now: () => reportedAt})

    expect(stagingAge).toBeLessThan(STALE_STAGING_MS)
    expect(reports[0]).toEqual({messageKey: 'tasks.ee.export.running'})
})

test('sweeps every stale entry, dangling links included, even after one that cannot be swept', async () => {
    const root = join(home, '.data-staging')
    await mkdir(root, {recursive: true})
    const link = join(root, 'a-link')
    await symlink(join(root, 'gone'), link)
    await lutimes(link, new Date(0), new Date(0))
    const stale = ['b-old', 'c-old', 'd-stuck', 'e-old']
    for (const name of stale) {
        await mkdir(join(root, name))
        await utimes(join(root, name), new Date(0), new Date(0))
    }
    const {run} = harness({accesses: [rw, rw, rw]})

    await run(params, {remove: async (path, options) => {
        if (path.endsWith('d-stuck')) {
            throw new Error('EACCES')
        }
        await rm(path, options)
    }})

    expect(await present(link)).toBe(false)
    expect(await Promise.all(['b-old', 'c-old', 'e-old'].map(name => present(join(root, name))))).toEqual([false, false, false])
})

test('an export succeeds even when sweeping stale staging fails', async () => {
    const {run, copies} = harness({accesses: [rw, rw, rw]})
    const old = join(home, '.data-staging', 'old')
    await mkdir(old, {recursive: true})
    await utimes(old, new Date(0), new Date(0))

    await run(params, {remove: async path => {
        if (path === old) {
            throw new Error('EACCES')
        }
        await rm(path, {recursive: true, force: true})
    }})

    expect(copies).toHaveLength(3)
})

const present = path => lstat(path).then(() => true, () => false)

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
        imageDataExport(p, {...options, sepal, report: r => reports.push(r), signal, sleep: async () => {}, copy: fakeCopy})
    return {run, sepal, copies, reports}
}
