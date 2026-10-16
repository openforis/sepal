import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {cacheVenvArg} from './apps.js'

describe('cacheVenvArg', () => {
    test('a real boolean true enables caching', () => {
        assert.equal(cacheVenvArg({cacheVenv: true}), 'true')
    })
    test('an absent field disables caching', () => {
        assert.equal(cacheVenvArg({}), 'false')
    })
    test('a boolean false disables caching', () => {
        assert.equal(cacheVenvArg({cacheVenv: false}), 'false')
    })
    // The catalog is external input: a JSON string is not a boolean and must not opt an app in.
    test('the string "true" does not enable caching', () => {
        assert.equal(cacheVenvArg({cacheVenv: 'true'}), 'false')
    })
    test('the number 1 does not enable caching', () => {
        assert.equal(cacheVenvArg({cacheVenv: 1}), 'false')
    })
    test('null does not enable caching', () => {
        assert.equal(cacheVenvArg({cacheVenv: null}), 'false')
    })
})
