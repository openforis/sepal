import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {assertMatches} from './assert.js'

describe('assertMatches', () => {
    test('accepts an object with more properties than the pattern names', () => {
        assertMatches({a: 1, b: {c: 2, d: 3}}, {b: {c: 2}})
    })

    test('rejects a missing property or a different value', () => {
        assert.throws(() => assertMatches({a: 1}, {b: 1}), assert.AssertionError)
        assert.throws(() => assertMatches({a: 1}, {a: 2}), assert.AssertionError)
    })

    test('requires an array to match the pattern element for element', () => {
        assertMatches({items: [{id: 1, name: 'a'}]}, {items: [{id: 1}]})
        assert.throws(() => assertMatches({ids: [1, 2, 3]}, {ids: [1, 2]}), assert.AssertionError)
        assert.throws(() => assertMatches({ids: [2, 1]}, {ids: [1, 2]}), assert.AssertionError)
    })

    test('compares values that are not plain objects whole', () => {
        assertMatches({at: new Date(0), other: 1}, {at: new Date(0)})
        assert.throws(() => assertMatches({at: new Date(1)}, {at: new Date(0)}), assert.AssertionError)
        assert.throws(() => assertMatches([1], {0: 1}), assert.AssertionError)
    })

    test('matches the properties of an instance against a plain pattern', () => {
        assertMatches(Object.assign(new Error('failed'), {statusCode: 500}), {message: 'failed', statusCode: 500})
    })
})
