import {userToEventMap} from './events.js'

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
    expect(userToEventMap(user)).toEqual({
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
    expect(userToEventMap({...user, googleTokens: null}).googleTokens).toBeNull()
})

test('userToEventMap omits googleUser and admin (not in the event payload)', () => {
    const map = userToEventMap(user)
    expect('googleUser' in map).toBe(false)
    expect('admin' in map).toBe(false)
})
