import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {isSkipped, isStratificationSkipped} from './stratificationSkip.js'

// The skip flag exists as a boolean model field and as the old form-toggle array shape. Both must be read the
// same way everywhere: a disagreement silently routes a design down the wrong sampling path - a stratified
// recipe skipping stratified-only validation, or an unstratified export failing a rule that never applied.
describe('isSkipped', () => {
    it('treats boolean true and a non-empty legacy array as skipped', () => {
        assert.equal(isSkipped(true), true)
        assert.equal(isSkipped([true]), true)
    })

    it('treats false, an empty legacy array and an absent value as not skipped', () => {
        assert.equal(isSkipped(false), false)
        assert.equal(isSkipped([]), false)
        assert.equal(isSkipped(undefined), false)
        assert.equal(isSkipped(null), false)
    })
})

describe('isStratificationSkipped', () => {
    it('reads the skip flag off the stratification, in both representations', () => {
        assert.equal(isStratificationSkipped({skip: true}), true)
        assert.equal(isStratificationSkipped({skip: [true]}), true)
        assert.equal(isStratificationSkipped({skip: false}), false)
        assert.equal(isStratificationSkipped({skip: []}), false)
        assert.equal(isStratificationSkipped({skip: undefined}), false)
    })

    it('is false for an absent stratification', () => {
        assert.equal(isStratificationSkipped(undefined), false)
        assert.equal(isStratificationSkipped({}), false)
    })
})
