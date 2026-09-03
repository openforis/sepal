// Unit tests for the in-memory locked-users gate (see lockedUsers.js header).
// No database, no message queue — createLockedUsers is driven directly with a fake
// closeUserSessions collaborator.

import {createLockedUsers} from './lockedUsers.js'

test('locks on Exceeded, unlocks on Cleared, isLocked reflects state', () => {
    const closed = []
    const lu = createLockedUsers({closeUserSessions: u => closed.push(u)})
    lu.onExceeded({username: 'a'})
    expect(lu.isLocked('a')).toBe(true)
    expect(closed).toEqual(['a'])       // closing running sessions is triggered on lock
    lu.onCleared({username: 'a'})
    expect(lu.isLocked('a')).toBe(false)
})

test('re-delivered Exceeded RE-triggers closeUserSessions, so a failed close is retried', async () => {
    const closed = []
    const lu = createLockedUsers({closeUserSessions: async u => {closed.push(u)}})
    await lu.onExceeded({username: 'a'})
    await lu.onExceeded({username: 'a'})
    await lu.onExceeded({username: 'a'})
    expect(closed).toEqual(['a', 'a', 'a'])
    expect(lu.isLocked('a')).toBe(true)
})

test('Exceeded delivered while a close is still in flight does not start a second close', async () => {
    let release
    const inFlight = new Promise(resolve => {release = resolve})
    const closed = []
    const lu = createLockedUsers({closeUserSessions: async u => {
        closed.push(u)
        await inFlight
    }})
    const first = lu.onExceeded({username: 'a'})
    await lu.onExceeded({username: 'a'}) // arrives mid-close — must be dropped, not queued
    expect(closed).toEqual(['a'])
    release()
    await first
    // once settled, the next delivery closes again
    await lu.onExceeded({username: 'a'})
    expect(closed).toEqual(['a', 'a'])
})

test('a close that rejects does not block the next delivery from retrying', async () => {
    const attempts = []
    const lu = createLockedUsers({closeUserSessions: async u => {
        attempts.push(u)
        throw new Error('boom')
    }})
    await lu.onExceeded({username: 'a'})
    await lu.onExceeded({username: 'a'})
    expect(attempts).toEqual(['a', 'a'])
})

test('re-delivered Cleared for an already-unlocked (or never-locked) user is a no-op', () => {
    const closed = []
    const lu = createLockedUsers({closeUserSessions: u => closed.push(u)})
    lu.onCleared({username: 'never-locked'})
    expect(lu.isLocked('never-locked')).toBe(false)
    lu.onExceeded({username: 'a'})
    lu.onCleared({username: 'a'})
    lu.onCleared({username: 'a'})
    expect(lu.isLocked('a')).toBe(false)
})

test('isLocked is false for a user that was never mentioned', () => {
    const lu = createLockedUsers({closeUserSessions: () => {}})
    expect(lu.isLocked('nobody')).toBe(false)
})

test('locking/unlocking one user does not affect another', () => {
    const closed = []
    const lu = createLockedUsers({closeUserSessions: u => closed.push(u)})
    lu.onExceeded({username: 'a'})
    lu.onExceeded({username: 'b'})
    expect(lu.isLocked('a')).toBe(true)
    expect(lu.isLocked('b')).toBe(true)
    lu.onCleared({username: 'a'})
    expect(lu.isLocked('a')).toBe(false)
    expect(lu.isLocked('b')).toBe(true)
    expect(closed).toEqual(['a', 'b'])
})

test('a rejecting closeUserSessions does not throw out of onExceeded (fire-and-forget)', async () => {
    const lu = createLockedUsers({closeUserSessions: () => Promise.reject(new Error('boom'))})
    expect(() => lu.onExceeded({username: 'a'})).not.toThrow()
    expect(lu.isLocked('a')).toBe(true)
    // let the rejected promise's .catch settle so it doesn't surface as an unhandled rejection
    await new Promise(r => setImmediate(r))
})

test('a throwing (synchronous) closeUserSessions does not throw out of onExceeded', () => {
    const lu = createLockedUsers({closeUserSessions: () => {throw new Error('boom')}})
    expect(() => lu.onExceeded({username: 'a'})).not.toThrow()
    expect(lu.isLocked('a')).toBe(true)
})
