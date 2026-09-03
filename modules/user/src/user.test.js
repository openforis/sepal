import {rowToUser, userToMap} from './user.js'

const baseRow = {
    id: 10006,
    username: 'lookap1',
    name: 'Look One',
    email: 'l1@example.org',
    organization: 'FAO',
    intended_use: 'mapping',
    token: null,
    admin: 0,
    system_user: 0,
    status: 'ACTIVE',
    google_refresh_token: null,
    google_access_token: null,
    google_access_token_expiration: null,
    google_project_id: null,
    google_legacy_project: 0,
    email_notifications_enabled: 1,
    manual_map_rendering_enabled: 0,
    privacy_policy_accepted: 1,
    creation_time: new Date('2024-01-02T03:04:05.000Z'),
    update_time: new Date('2024-02-02T03:04:05.000Z'),
    last_login_time: new Date('2024-03-02T03:04:05.000Z'),
    password_hash: '{SSHA}x6nFosdz0ToEJu8p72NWae7QdCWhssPU'
}

test('rowToUser maps columns and exposes credentials internally', () => {
    const user = rowToUser(baseRow)
    expect(user.id).toBe(10006)
    expect(user.username).toBe('lookap1')
    expect(user.intendedUse).toBe('mapping')
    expect(user.admin).toBe(false)
    expect(user.roles).toEqual([])
    expect(user.googleTokens).toBeNull()
    expect(user.emailNotificationsEnabled).toBe(true)
    expect(user.passwordHash).toBe('{SSHA}x6nFosdz0ToEJu8p72NWae7QdCWhssPU')
})

test('rowToUser returns null for a missing row', () => {
    expect(rowToUser(undefined)).toBeNull()
})

test('admin row gets the application_admin role', () => {
    const user = rowToUser({...baseRow, admin: 1})
    expect(user.admin).toBe(true)
    expect(user.roles).toEqual(['application_admin'])
})

test('rowToUser builds googleTokens when a refresh token is present', () => {
    const user = rowToUser({
        ...baseRow,
        google_refresh_token: 'r',
        google_access_token: 'a',
        google_access_token_expiration: new Date('2024-04-02T03:04:05.000Z'),
        google_project_id: 'proj',
        google_legacy_project: 1
    })
    expect(user.googleTokens).toEqual({
        accessToken: 'a',
        accessTokenExpiryDate: new Date('2024-04-02T03:04:05.000Z').getTime(),
        refreshToken: 'r',
        projectId: 'proj',
        legacyProject: true
    })
})

test('userToMap reproduces the public API contract (dates as ISO-8601 strings, no credentials)', () => {
    const map = userToMap(rowToUser(baseRow))
    expect(map).toEqual({
        id: 10006,
        name: 'Look One',
        username: 'lookap1',
        email: 'l1@example.org',
        organization: 'FAO',
        intendedUse: 'mapping',
        googleUser: false,
        googleTokens: null,
        emailNotificationsEnabled: true,
        manualMapRenderingEnabled: false,
        privacyPolicyAccepted: true,
        status: 'ACTIVE',
        roles: [],
        systemUser: false,
        creationTime: '2024-01-02T03:04:05.000Z',
        updateTime: '2024-02-02T03:04:05.000Z',
        admin: false
    })
    expect('passwordHash' in map).toBe(false)
    expect('token' in map).toBe(false)
})

test('userToMap with withGoogleTokens=false nulls the tokens field', () => {
    const user = rowToUser({...baseRow, google_refresh_token: 'r', google_access_token: 'a'})
    expect(userToMap(user, false).googleTokens).toBeNull()
    expect(userToMap(user, false).googleUser).toBe(true)
})
