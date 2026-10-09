import {mkdtemp, rm, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {jest} from '@jest/globals'

const workspaceCalls = []

jest.unstable_mockModule('../workspaceExport.js', () => ({
    exportToWorkspace: async args => {
        workspaceCalls.push({downloadDir: args.downloadDir, started: await args.start()})
        return {downloaded: true}
    }
}))

const {samplingDesignExport} = await import('./samplingDesignExport.js')

const originalHome = process.env.HOME
let home

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'sampling-design-'))
    process.env.HOME = home
    workspaceCalls.length = 0
})

afterEach(async () => {
    process.env.HOME = originalHome
    await rm(home, {recursive: true, force: true})
})

test('drives the steps until done, following each export, then cleans up the temp assets', async () => {
    const state1 = {tempAssetIds: ['a_tmp_1'], stage: 1}
    const state2 = {tempAssetIds: ['a_tmp_1'], stage: 2}
    const state3 = {tempAssetIds: ['a_tmp_1'], stage: 3}
    const progress = {messageKey: 'k', defaultMessage: 'm'}
    const next = {messageKey: 'n', defaultMessage: 'next'}
    const params = {description: 'Design'}
    const sepal = fakeSepal([
        {state: state1, progress: [progress], next, action: 'export', eeTaskId: 'T1'},
        {state: state2, progress: [], action: 'export', eeTaskId: 'T2'},
        {state: state3, progress: [], action: 'done'}
    ])
    const reports = []

    await samplingDesignExport('ASSET')(params, context(sepal, {report: r => reports.push(r)}))

    expect(sepal.started.map(({body}) => body)).toEqual([
        {...params, destination: 'ASSET', state: null},
        {...params, destination: 'ASSET', state: state1},
        {...params, destination: 'ASSET', state: state2}
    ])
    expect(sepal.statusPolls).toEqual(['T1', 'T2'])
    expect(sepal.cleanups).toEqual([{state: state3}])
})

test('reports the preparing message, then each step\'s progress, the export progress and the next stage message in order', async () => {
    const progress = {messageKey: 'p', defaultMessage: 'progress'}
    const next = {messageKey: 'n', defaultMessage: 'next'}
    const sepal = fakeSepal([
        {state: {}, progress: [progress], next, action: 'export', eeTaskId: 'T1'},
        {state: {}, progress: [], action: 'done'}
    ], {exportStates: ['RUNNING', 'COMPLETED']})
    const events = []

    await samplingDesignExport('ASSET')({description: 'd'}, context(sepal, {report: r => events.push(r)}))

    expect(events).toEqual([PREPARE, progress, EXPORTING, next])
})

test('does not report the next stage message when the export was cancelled', async () => {
    const next = {messageKey: 'n', defaultMessage: 'next'}
    const controller = new AbortController()
    const sepal = fakeSepal([
        {state: {}, next, action: 'export', eeTaskId: 'T1'}
    ], {onStep: () => controller.abort()})
    const reports = []

    await samplingDesignExport('ASSET')({description: 'd'}, context(sepal, {signal: controller.signal, report: r => reports.push(r)}))

    expect(reports).not.toContainEqual(next)
})

test('an unknown step action fails the export and still cleans up', async () => {
    const state = {tempAssetIds: ['a_tmp_1']}
    const sepal = fakeSepal([{state, action: 'bogus'}])

    await expect(samplingDesignExport('ASSET')({description: 'd'}, context(sepal))).rejects.toThrow('Unknown sampling design step action: bogus')

    expect(sepal.cleanups).toEqual([{state}])
})

test('a step without an action fails the export', async () => {
    const sepal = fakeSepal([{state: {}}])

    await expect(samplingDesignExport('ASSET')({description: 'd'}, context(sepal))).rejects.toThrow('Unknown sampling design step action: undefined')
})

test('starts no step when already cancelled, but still cleans up', async () => {
    const controller = new AbortController()
    controller.abort()
    const sepal = fakeSepal([{state: {}, action: 'done'}])

    await samplingDesignExport('ASSET')({description: 'd'}, context(sepal, {signal: controller.signal}))

    expect(sepal.started).toEqual([])
})

test('a workspace step downloads into the workspace path', async () => {
    const destination = {bucket: 'b'}
    const sepal = fakeSepal([
        {state: {}, action: 'workspace', eeTaskId: 'T', destination},
        {state: {}, action: 'done'}
    ])

    await samplingDesignExport('SEPAL')({description: 'Design', workspacePath: 'out'}, context(sepal))

    expect(workspaceCalls).toEqual([{downloadDir: `${home}/out`, started: {eeTaskId: 'T', destination}}])
    expect((await stat(`${home}/out`)).isDirectory()).toBe(true)
})

test('a workspace step without a workspace path downloads into downloads/<description>', async () => {
    const sepal = fakeSepal([
        {state: {}, action: 'workspace', eeTaskId: 'T', destination: {}},
        {state: {}, action: 'done'}
    ])

    await samplingDesignExport('SEPAL')({description: 'My design'}, context(sepal))

    expect(workspaceCalls[0].downloadDir).toBe(`${home}/downloads/My_design`)
})

test('a cancel during a step cancels the export it started, cleans up and runs no further step', async () => {
    const state = {tempAssetIds: ['a_tmp_1']}
    const controller = new AbortController()
    const sepal = fakeSepal([
        {state, action: 'export', eeTaskId: 'T'},
        {state: {}, action: 'done'}
    ], {onStep: () => controller.abort()})

    await samplingDesignExport('ASSET')({description: 'd'}, context(sepal, {signal: controller.signal}))

    expect(sepal.cancelled).toEqual(['T'])
    expect(sepal.started).toHaveLength(1)
    expect(sepal.cleanups).toEqual([{state}])
})

test('a cancel while following a temp export cleans up the temp assets', async () => {
    const state = {tempAssetIds: ['a_tmp_1']}
    const controller = new AbortController()
    const sepal = fakeSepal([
        {state, action: 'export', eeTaskId: 'T'},
        {state: {}, action: 'done'}
    ], {exportState: 'RUNNING'})

    await samplingDesignExport('ASSET')({description: 'd'}, context(sepal, {
        signal: controller.signal,
        sleep: async () => controller.abort()
    }))

    expect(sepal.cancelled).toEqual(['T'])
    expect(sepal.started).toHaveLength(1)
    expect(sepal.cleanups).toEqual([{state}])
})

test('a failing step fails the export and still cleans up with the last known state', async () => {
    const state = {tempAssetIds: ['a_tmp_1']}
    const failure = Object.assign(new Error('boom'), {userMessage: {message: 'too few samples'}})
    const sepal = fakeSepal([
        {state, action: 'export', eeTaskId: 'T'},
        failure
    ])

    await expect(samplingDesignExport('ASSET')({description: 'd'}, context(sepal))).rejects.toBe(failure)

    expect(sepal.cleanups).toEqual([{state}])
})

test('a cleanup failure does not replace the step error', async () => {
    const state = {tempAssetIds: ['a_tmp_1']}
    const failure = Object.assign(new Error('underproduction'), {userMessage: {message: 'too few samples'}})
    const sepal = fakeSepal([
        {state, action: 'export', eeTaskId: 'T'},
        failure
    ], {cleanupError: new Error('cleanup failed')})

    await expect(samplingDesignExport('ASSET')({description: 'd'}, context(sepal))).rejects.toBe(failure)
})

test('makes no cleanup call when no temp asset was created', async () => {
    const sepal = fakeSepal([
        {state: {tempAssetIds: []}, action: 'export', eeTaskId: 'T'},
        {state: {}, action: 'done'}
    ])

    await samplingDesignExport('ASSET')({description: 'd'}, context(sepal))

    expect(sepal.cleanups).toEqual([])
})

test('steps go through the no-retry path', async () => {
    const sepal = fakeSepal([{state: {}, action: 'done'}])

    await samplingDesignExport('ASSET')({description: 'd'}, context(sepal))

    expect(sepal.started.map(({path}) => path)).toEqual(['task/samplingDesign/step'])
    expect(sepal.geeCalls.map(({path}) => path)).not.toContain('task/samplingDesign/step')
})

const EXPORTING = {messageKey: 'tasks.ee.export.running', defaultMessage: 'Google Earth Engine is exporting'}
const PREPARE = {messageKey: 'tasks.samplingDesign.progress.prepare', defaultMessage: 'Preparing samples'}

const fakeSepal = (answers, {onStep, cleanupError, exportState = 'COMPLETED', exportStates = [exportState]} = {}) => {
    const queue = [...answers]
    const sepal = {
        started: [], geeCalls: [], statusPolls: [], cancelled: [], cleanups: [],
        startExport: async (path, body) => {
            sepal.started.push({path, body})
            onStep?.()
            const answer = queue.shift()
            if (answer instanceof Error) {
                throw answer
            }
            return answer
        },
        gee: async (path, body) => {
            sepal.geeCalls.push({path, body})
            if (path === 'task/operation/status') {
                sepal.statusPolls.push(body.eeTaskId)
                return {state: exportStates.length > 1 ? exportStates.shift() : exportStates[0]}
            }
            if (path === 'task/operation/cancel') {
                sepal.cancelled.push(body.eeTaskId)
            }
            if (path === 'task/samplingDesign/cleanup') {
                sepal.cleanups.push(body)
                if (cleanupError) {
                    throw cleanupError
                }
            }
        }
    }
    return sepal
}

const context = (sepal, overrides = {}) => ({
    sepal,
    report: () => {},
    signal: new AbortController().signal,
    sleep: async () => {},
    ...overrides
})
