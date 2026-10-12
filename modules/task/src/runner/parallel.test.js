import {forEachInParallel} from './parallel.js'

test('runs at most the given number at once', async () => {
    let running = 0
    let maxRunning = 0
    await forEachInParallel([1, 2, 3, 4, 5], 2, new AbortController().signal, async () => {
        maxRunning = Math.max(maxRunning, ++running)
        await new Promise(resolve => setImmediate(resolve))
        running--
    })
    expect(maxRunning).toBe(2)
})

test('one failure stops the others and is what it rejects with', async () => {
    const aborted = []
    const work = (item, signal) => item === 1
        ? Promise.reject(new Error('boom'))
        : new Promise(resolve => signal.addEventListener('abort', () => (aborted.push(item), resolve())))

    await expect(forEachInParallel([1, 2, 3], 3, new AbortController().signal, work)).rejects.toThrow('boom')
    expect(aborted.sort()).toEqual([2, 3])
})

test('the failure is rejected only once the others have settled', async () => {
    let settled = false
    const work = async (item, signal) => {
        if (item === 1) {
            throw new Error('boom')
        }
        await new Promise(resolve => signal.addEventListener('abort', resolve))
        await new Promise(resolve => setImmediate(resolve))
        settled = true
    }

    await expect(forEachInParallel([1, 2], 2, new AbortController().signal, work)).rejects.toThrow('boom')
    expect(settled).toBe(true)
})

test('an aborted task starts nothing more', async () => {
    const abort = new AbortController()
    const started = []
    await forEachInParallel([1, 2, 3], 1, abort.signal, async item => {
        started.push(item)
        abort.abort()
    })
    expect(started).toEqual([1])
})

test('a task aborted before it starts starts nothing', async () => {
    const abort = new AbortController()
    abort.abort()
    const started = []
    await forEachInParallel([1, 2], 2, abort.signal, async item => started.push(item))
    expect(started).toEqual([])
})
