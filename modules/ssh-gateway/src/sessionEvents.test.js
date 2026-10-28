import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {isRelevantEvent} from './sessionEvents.js'

describe('isRelevantEvent', () => {
    it('matches an event for the logged-in user', () => {
        assert.equal(isRelevantEvent('admin', {username: 'admin', sessionId: 'abc'}), true)
    })

    it('matches case-insensitively', () => {
        assert.equal(isRelevantEvent('Admin', {username: 'admin'}), true)
        assert.equal(isRelevantEvent('admin', {username: 'ADMIN'}), true)
    })

    it('ignores an event for another user', () => {
        assert.equal(isRelevantEvent('admin', {username: 'someoneElse'}), false)
    })

    it('ignores a payload without a username', () => {
        assert.equal(isRelevantEvent('admin', {}), false)
        assert.equal(isRelevantEvent('admin', {username: 42}), false)
        assert.equal(isRelevantEvent('admin', null), false)
    })
})
