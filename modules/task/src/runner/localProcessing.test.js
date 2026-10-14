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
    expect(sepal.calls).toEqual([['request', 't-1']])
    finishFirst()
    await first

    expect(sepal.calls).toEqual([['request', 't-1'], ['release', 't-1']])
})

test('a refused step waits, says so, then shows again what it showed before', async () => {
    const {localProcessing, sepal, reporter, sent, sleeps} = setup({answers: [false, true]})
    reporter.report(EXPORTING)
    let ran = false

    await localProcessing.run(async () => ran = true, aSignal())

    expect(ran).toBe(true)
    expect(sleeps).toEqual([10_000])
    expect(sent).toEqual([EXPORTING, WAITING, EXPORTING])
    expect(sepal.calls).toEqual([['request', 't-1'], ['request', 't-1'], ['release', 't-1']])
})

test('a step cancelled while waiting does not run and asks no more', async () => {
    const abort = new AbortController()
    const {localProcessing, sepal} = setup({answers: [false], sleep: async () => abort.abort()})
    let ran = false

    await localProcessing.run(async () => ran = true, abort.signal)

    expect(ran).toBe(false)
    expect(sepal.calls).toEqual([['request', 't-1']])
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

    expect(sepal.calls.at(-1)).toEqual(['release', 't-1'])
})

test('a step starting while the slot is being given back asks again only after it is', async () => {
    const {localProcessing, sepal} = setup()
    let finishFirstRelease
    let releases = 0
    sepal.releaseLocalProcessing = async taskId => {
        sepal.calls.push(['release', taskId])
        if (++releases === 1) {
            await new Promise(resolve => finishFirstRelease = resolve)
        }
    }
    const first = localProcessing.run(async () => {}, aSignal())
    await settle()

    const second = localProcessing.run(async () => {}, aSignal())
    await settle()
    expect(sepal.calls).toEqual([['request', 't-1'], ['release', 't-1']])
    finishFirstRelease()
    await Promise.all([first, second])

    expect(sepal.calls).toEqual([['request', 't-1'], ['release', 't-1'], ['request', 't-1'], ['release', 't-1']])
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
    return {
        calls,
        requestLocalProcessing: async taskId => {
            calls.push(['request', taskId])
            const answer = answers.length ? answers.shift() : true
            if (answer instanceof Error) {
                throw answer
            }
            return {granted: answer}
        },
        releaseLocalProcessing: async taskId => {
            calls.push(['release', taskId])
        }
    }
}

const aSignal = () => new AbortController().signal

const settle = () => new Promise(resolve => setImmediate(resolve))
