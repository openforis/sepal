import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {callsOf, inSequence} from './mock.js'

describe('callsOf', () => {
    test('lists the arguments of each call in order', () => {
        const fn = mock.fn()

        fn('a', 1)
        fn()

        assert.deepEqual(callsOf(fn), [['a', 1], []])
    })
})

describe('inSequence', () => {
    test('answers successive calls in turn, then falls back', () => {
        const fn = inSequence([() => 'first', value => `second ${value}`], () => 'otherwise')

        assert.deepEqual([fn(), fn('call'), fn(), fn()], ['first', 'second call', 'otherwise', 'otherwise'])
    })

    test('answers undefined once the sequence runs out without a fallback', () => {
        const fn = inSequence([() => 'only'])

        assert.deepEqual([fn(), fn()], ['only', undefined])
    })
})
