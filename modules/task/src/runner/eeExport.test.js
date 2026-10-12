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

const failingPolls = (...answers) => {
    const calls = []
    const sepal = {
        gee: async (path, body) => {
            calls.push({path, body})
            if (path !== 'task/operation/status') {
                return {}
            }
            const answer = answers.length ? answers.shift() : new Error('gee unavailable')
            if (answer instanceof Error) {
                throw answer
            }
            return answer
        }
    }
    return {sepal, calls}
}

test('an export is still followed after a status poll fails once', async () => {
    const {sepal} = failingPolls(new Error('gee restarting'), {state: 'COMPLETED'})

    await expect(follow({sepal})).resolves.toEqual([])
})

test('60 consecutive failed polls fail the task with the last error', async () => {
    const {sepal, calls} = failingPolls()

    await expect(follow({sepal})).rejects.toThrow('gee unavailable')
    expect(calls).toHaveLength(60)
})

test('a successful poll resets the count of failed polls', async () => {
    const failures = Array.from({length: 59}, () => new Error('gee unavailable'))
    const {sepal} = failingPolls(...failures, {state: 'RUNNING'}, ...failures, {state: 'COMPLETED'})

    await expect(follow({sepal})).resolves.toHaveLength(1)
})

test('stopping the task during a failing poll still cancels the export', async () => {
    const abort = new AbortController()
    const {sepal, calls} = failingPolls()
    const gee = sepal.gee
    sepal.gee = async (path, body) => {
        if (path === 'task/operation/status') {
            abort.abort()
        }
        return gee(path, body)
    }

    await follow({sepal, signal: abort.signal})

    expect(calls.at(-1)).toEqual({path: 'task/operation/cancel', body: {eeTaskId: 'T1'}})
})

test('an export Earth Engine no longer knows fails the task', async () => {
    const {sepal} = states({state: 'UNKNOWN', errorMessage: null})

    await expect(follow({sepal})).rejects.toMatchObject({earthEngineMessage: expect.stringMatching(/UNKNOWN/)})
})
