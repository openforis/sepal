import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {publishUserLocked, publishUserUnlocked, publishUserUpdated, userChanged$, userToEventMap, userUpdated$} from './events.js'

const user = {
    id: 10006,
    name: 'Look One',
    username: 'lookap1',
    email: 'l1@example.org',
    organization: 'FAO',
    intendedUse: 'mapping',
    googleTokens: {accessToken: 'a', accessTokenExpiryDate: 123, refreshToken: 'r', projectId: 'p', legacyProject: true},
    emailNotificationsEnabled: true,
    manualMapRenderingEnabled: false,
    privacyPolicyAccepted: true,
    status: 'ACTIVE',
    roles: ['application_admin'],
    systemUser: false,
    admin: true,
    creationTime: '2024-01-02T03:04:05.000Z',
    updateTime: '2024-02-02T03:04:05.000Z'
}

test('userToEventMap matches the Java User.toMap shape (no googleUser/admin; 4-field googleTokens)', () => {
    assert.deepEqual(userToEventMap(user), {
        id: 10006,
        name: 'Look One',
        username: 'lookap1',
        email: 'l1@example.org',
        organization: 'FAO',
        intendedUse: 'mapping',
        googleTokens: {accessToken: 'a', accessTokenExpiryDate: 123, refreshToken: 'r', projectId: 'p'},
        emailNotificationsEnabled: true,
        manualMapRenderingEnabled: false,
        privacyPolicyAccepted: true,
        status: 'ACTIVE',
        roles: ['application_admin'],
        systemUser: false,
        creationTime: '2024-01-02T03:04:05.000Z',
        updateTime: '2024-02-02T03:04:05.000Z'
    })
})

test('userToEventMap nulls googleTokens when absent', () => {
    assert.equal(userToEventMap({...user, googleTokens: null}).googleTokens, null)
})

test('userToEventMap omits googleUser and admin (not in the event payload)', () => {
    const map = userToEventMap(user)
    assert.equal('googleUser' in map, false)
    assert.equal('admin' in map, false)
})

describe('userChanged$', () => {
    test('carries the internal user on every kind of change', () => {
        const changed = []
        const subscription = userChanged$.subscribe(user => changed.push(user))

        publishUserUpdated(user)
        publishUserLocked(user)
        publishUserUnlocked(user)

        subscription.unsubscribe()
        assert.deepEqual(changed, [user, user, user])
    })

    test('an unlock is not published as UserUpdated', () => {
        const updated = []
        const subscription = userUpdated$.subscribe(user => updated.push(user))

        publishUserUnlocked(user)

        subscription.unsubscribe()
        assert.deepEqual(updated, [])
    })
})
