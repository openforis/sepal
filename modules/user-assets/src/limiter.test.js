import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {Subject} from 'rxjs'

import {Limiter} from './limiter.js'

describe('Limiter', () => {
    it('runs at most the concurrency for one key', () => {
        const limiter$ = Limiter({name: 'test', concurrency: 2})
        const started = []

        startTasks(limiter$, started, ['a1', 'a2', 'a3'], 'alice')

        assert.deepEqual(started, ['a1', 'a2'])
    })

    it('does not let one key hold back another', () => {
        const limiter$ = Limiter({name: 'test', concurrency: 2})
        const started = []

        startTasks(limiter$, started, ['a1', 'a2', 'a3'], 'alice')
        startTasks(limiter$, started, ['b1'], 'bob')

        assert.deepEqual(started, ['a1', 'a2', 'b1'])
    })

    it('starts a queued task when one for the same key completes', () => {
        const limiter$ = Limiter({name: 'test', concurrency: 1})
        const started = []
        const [first] = startTasks(limiter$, started, ['a1', 'a2'], 'alice')

        first.next('done')
        first.complete()

        assert.deepEqual(started, ['a1', 'a2'])
    })
})

const startTasks = (limiter$, started, ids, key) =>
    ids.map(id => {
        const task$ = new Subject()
        limiter$(() => {
            started.push(id)
            return task$
        }, key).subscribe()
        return task$
    })
