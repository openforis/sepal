import {isRelevantEvent} from './sessionEvents.js'

describe('isRelevantEvent', () => {
    it('matches an event for the logged-in user', () => {
        expect(isRelevantEvent('admin', {username: 'admin', sessionId: 'abc'})).toBe(true)
    })

    it('matches case-insensitively', () => {
        expect(isRelevantEvent('Admin', {username: 'admin'})).toBe(true)
        expect(isRelevantEvent('admin', {username: 'ADMIN'})).toBe(true)
    })

    it('ignores an event for another user', () => {
        expect(isRelevantEvent('admin', {username: 'someoneElse'})).toBe(false)
    })

    it('ignores a payload without a username', () => {
        expect(isRelevantEvent('admin', {})).toBe(false)
        expect(isRelevantEvent('admin', {username: 42})).toBe(false)
        expect(isRelevantEvent('admin', null)).toBe(false)
    })
})
