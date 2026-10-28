import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import tasks from './tasks'

vi.mock('./ws.js', () => ({moduleWebSocket$: () => null}))

let requests

describe('submitting a task', () => {
    beforeEach(() => {
        requests = []
        vi.useFakeTimers()
        vi.stubGlobal('XMLHttpRequest', FakeXHR)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it('repeats a failed submission under the same task id, so the task-manager creates the task once', () => {
        const task = {operation: 'image.GEE', params: {title: 'Mosaic'}}
        tasks.submit$(task).subscribe({error: () => {}})

        requests[0].respond(502)
        vi.advanceTimersByTime(1000)

        const [first, repeated] = requests.map(({body}) => JSON.parse(body))
        expect(first).toEqual({id: expect.any(String), ...task})
        expect(repeated).toEqual(first)
    })

    it('names each submission with its own task id', () => {
        const task = {operation: 'image.GEE'}
        tasks.submit$(task).subscribe()
        tasks.submit$(task).subscribe()

        const [first, second] = requests.map(({body}) => JSON.parse(body))
        expect(second.id).not.toEqual(first.id)
    })
})

class FakeXHR {
    #listeners = {}

    constructor() {
        requests.push(this)
    }

    open() {}
    setRequestHeader() {}
    abort() {}

    send(body) {
        this.body = body
    }

    addEventListener(type, listener) {
        this.#listeners[type] = listener
    }

    removeEventListener() {}

    respond(status) {
        this.status = status
        this.readyState = 4
        this.response = null
        this.#listeners.load({type: 'load'})
    }
}
