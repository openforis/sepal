import {LocalProcessing} from './localProcessing.js'
import {ProgressReporter} from './progressReporter.js'

const EXPORTING = {messageKey: 'tasks.ee.export.running', defaultMessage: 'Exporting'}
const WAITING = {messageKey: 'tasks.status.waitingForLocalProcessing', defaultMessage: 'Waiting for other exports to finish downloading...'}

test('steps running at once share one slot, given back after the last', async () => {
    const {localProcessing, sepal} = setup()
    let finishFirst
    const first = localProcessing.run(() => new Promise(resolve => finishFirst = resolve), aSignal())
    await settle()

    await localProcessing.run(async () => {}, aSignal())
    expect(sepal.calls).toEqual([['request']])
    finishFirst()
    await first

    expect(sepal.calls).toEqual([['request'], ['release', 'slot-1']])
})

test('a refused step waits, says so, then shows again what it showed before', async () => {
    const {localProcessing, sepal, reporter, sent, sleeps} = setup({answers: [false, true]})
    reporter.report(EXPORTING)
    let ran = false

    await localProcessing.run(async () => ran = true, aSignal())

    expect(ran).toBe(true)
    expect(sleeps).toEqual([10_000])
    expect(sent).toEqual([EXPORTING, WAITING, EXPORTING])
    expect(sepal.calls).toEqual([['request'], ['request'], ['release', 'slot-1']])
})

test('a step cancelled while waiting does not run and asks no more', async () => {
    const abort = new AbortController()
    const {localProcessing, sepal} = setup({answers: [false], sleep: async () => abort.abort()})
    let ran = false

    await localProcessing.run(async () => ran = true, abort.signal)

    expect(ran).toBe(false)
    expect(sepal.calls).toEqual([['request']])
})

test('a request that fails counts as a refusal', async () => {
    const {localProcessing} = setup({answers: [new Error('gateway unavailable'), true]})
    let ran = false

    await localProcessing.run(async () => ran = true, aSignal())

    expect(ran).toBe(true)
})

test('a failing step still gives the slot back', async () => {
    const {localProcessing, sepal} = setup()

    await expect(localProcessing.run(async () => {
        throw new Error('disk full')
    }, aSignal())).rejects.toThrow('disk full')

    expect(sepal.calls.at(-1)).toEqual(['release', 'slot-1'])
})

test('the slot last given back is kept for the progress reports, even when its release fails', async () => {
    const {localProcessing, sepal} = setup()
    sepal.releaseLocalProcessing = async () => {
        throw new Error('connect ECONNREFUSED')
    }
    expect(localProcessing.releasedSlot).toBeNull()

    await localProcessing.run(async () => {}, aSignal())
    await settle()

    expect(localProcessing.releasedSlot).toBe('slot-1')
})

test('a step starting while the last release is on its way asks at once, for a new grant', async () => {
    const {localProcessing, sepal} = setup()
    sepal.releaseLocalProcessing = (_taskId, slot) => {
        sepal.calls.push(['release', slot])
        return slot === 'slot-1' ? new Promise(() => {}) : Promise.resolve()
    }
    await localProcessing.run(async () => {}, aSignal())

    await localProcessing.run(async () => {}, aSignal())

    expect(sepal.calls).toEqual([['request'], ['release', 'slot-1'], ['request'], ['release', 'slot-2']])
})

const setup = ({answers = [], sleep} = {}) => {
    const sepal = fakeSepal(answers)
    const sent = []
    const reporter = new ProgressReporter({send: description => sent.push(description)})
    const sleeps = []
    const localProcessing = new LocalProcessing({
        sepal,
        taskId: 't-1',
        reporter,
        sleep: sleep ?? (async ms => sleeps.push(ms))
    })
    return {localProcessing, sepal, reporter, sent, sleeps}
}

const fakeSepal = answers => {
    const calls = []
    let grants = 0
    return {
        calls,
        requestLocalProcessing: async () => {
            calls.push(['request'])
            const answer = answers.length ? answers.shift() : true
            if (answer instanceof Error) {
                throw answer
            }
            return answer ? {granted: true, slot: `slot-${++grants}`} : {granted: false}
        },
        releaseLocalProcessing: async (_taskId, slot) => {
            calls.push(['release', slot])
        }
    }
}

const aSignal = () => new AbortController().signal

const settle = () => new Promise(resolve => setImmediate(resolve))
