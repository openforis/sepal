import {followEEExport} from './eeExport.js'

const states = (...answers) => {
    const calls = []
    const sepal = {
        gee: async (path, body) => {
            calls.push({path, body})
            return path === 'task/operation/status' ? answers.shift() : {}
        }
    }
    return {sepal, calls}
}

const follow = ({sepal, signal = new AbortController().signal, sleep = async () => {}}) => {
    const reported = []
    return followEEExport({eeTaskId: 'T1', sepal, report: d => reported.push(d), signal, sleep}).then(() => reported)
}

test('reports each Earth Engine state once, and resolves when the export completes', async () => {
    const {sepal} = states({state: 'READY'}, {state: 'READY'}, {state: 'RUNNING'}, {state: 'COMPLETED'})

    const reported = await follow({sepal})

    expect(reported.map(({messageKey}) => messageKey)).toEqual(['tasks.ee.export.ready', 'tasks.ee.export.running'])
})

test('an export that fails fails the task with Earth Engine\'s reason', async () => {
    const {sepal} = states({state: 'FAILED', errorMessage: 'Quota exceeded'})

    await expect(follow({sepal})).rejects.toMatchObject({earthEngineMessage: 'Quota exceeded'})
})

test('an export cancelled on Google\'s side fails the task', async () => {
    const {sepal} = states({state: 'CANCELLED', errorMessage: null})

    await expect(follow({sepal})).rejects.toMatchObject({earthEngineMessage: expect.stringMatching(/cancel/i)})
})

test('stopping the task cancels the export it follows', async () => {
    const abort = new AbortController()
    const {sepal, calls} = states({state: 'RUNNING'})

    await follow({sepal, signal: abort.signal, sleep: async () => abort.abort()})

    expect(calls.at(-1)).toEqual({path: 'task/operation/cancel', body: {eeTaskId: 'T1'}})
})
