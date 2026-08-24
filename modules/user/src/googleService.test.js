import {jest} from '@jest/globals'

// googleService -> googleOAuth -> config.js (commander). Mock config before importing the chain.
jest.unstable_mockModule('./config.js', () => ({
    googleOauthClientId: 'cid',
    googleOauthClientSecret: 'csecret',
    googleOauthCallbackBaseUrl: 'https://sepal.example.org'
}))

const {createGoogleService} = await import('./googleService.js')
const {InvalidTokenError} = await import('./googleOAuth.js')

const baseDeps = over => ({
    findByUsername: jest.fn(async () => ({username: 'u', id: 1, googleTokens: null})),
    updateGoogleTokens: jest.fn(async () => {}),
    saveCredentials: jest.fn(async () => {}),
    refreshAccessToken: jest.fn(async () => ({refreshToken: 'RT', accessToken: 'NEW', accessTokenExpiryDate: 9, projectId: null, legacyProject: false})),
    shouldBeRefreshed: jest.fn(() => true),
    publishUserUpdated: jest.fn(),
    ...over
})

test('returns null when the user has no tokens', async () => {
    const deps = baseDeps()
    const svc = createGoogleService(deps)
    expect(await svc.refreshGoogleTokens('u', null)).toBe(null)
    expect(deps.refreshAccessToken).not.toHaveBeenCalled()
    expect(deps.updateGoogleTokens).not.toHaveBeenCalled()
})

test('returns tokens unchanged when not due for refresh', async () => {
    const tokens = {refreshToken: 'RT', accessToken: 'AT', accessTokenExpiryDate: 9}
    const deps = baseDeps({shouldBeRefreshed: jest.fn(() => false)})
    const svc = createGoogleService(deps)
    expect(await svc.refreshGoogleTokens('u', tokens)).toBe(tokens)
    expect(deps.refreshAccessToken).not.toHaveBeenCalled()
})

test('refreshes, persists, saves credentials, and publishes when due', async () => {
    const tokens = {refreshToken: 'RT', accessToken: 'AT', accessTokenExpiryDate: 0}
    const deps = baseDeps({findByUsername: jest.fn(async () => ({username: 'u', id: 1, googleTokens: tokens}))})
    const svc = createGoogleService(deps)
    const result = await svc.refreshGoogleTokens('u', tokens)
    expect(result.accessToken).toBe('NEW')
    expect(deps.updateGoogleTokens).toHaveBeenCalledWith('u', expect.objectContaining({accessToken: 'NEW'}))
    expect(deps.saveCredentials).toHaveBeenCalledWith('u', expect.objectContaining({accessToken: 'NEW'}))
    expect(deps.publishUserUpdated).toHaveBeenCalled()
})

test('on InvalidTokenError clears tokens, deletes credentials, publishes, returns null', async () => {
    const tokens = {refreshToken: 'RT', accessToken: 'AT', accessTokenExpiryDate: 0}
    const deps = baseDeps({
        findByUsername: jest.fn(async () => ({username: 'u', id: 1, googleTokens: tokens})),
        refreshAccessToken: jest.fn(async () => { throw new InvalidTokenError('bad') })
    })
    const svc = createGoogleService(deps)
    expect(await svc.refreshGoogleTokens('u', tokens)).toBe(null)
    expect(deps.updateGoogleTokens).toHaveBeenCalledWith('u', null)
    expect(deps.saveCredentials).toHaveBeenCalledWith('u', null)
    expect(deps.publishUserUpdated).toHaveBeenCalled()
})

test('falls back to the user\'s stored tokens when none are passed', async () => {
    const tokens = {refreshToken: 'RT', accessToken: 'AT', accessTokenExpiryDate: 0}
    const deps = baseDeps({findByUsername: jest.fn(async () => ({username: 'u', id: 1, googleTokens: tokens}))})
    const svc = createGoogleService(deps)
    await svc.refreshGoogleTokens('u')
    expect(deps.refreshAccessToken).toHaveBeenCalled()
})

test('saveTokens persists, writes credentials, reloads, and publishes', async () => {
    const reloaded = {username: 'u', id: 1, googleTokens: {accessToken: 'AT'}}
    const deps = baseDeps({findByUsername: jest.fn(async () => reloaded)})
    const svc = createGoogleService(deps)
    const tokens = {refreshToken: 'RT', accessToken: 'AT', accessTokenExpiryDate: 5, projectId: null, legacyProject: false}
    const user = await svc.saveTokens('u', tokens)
    expect(deps.updateGoogleTokens).toHaveBeenCalledWith('u', tokens)
    expect(deps.saveCredentials).toHaveBeenCalledWith('u', tokens)
    expect(deps.publishUserUpdated).toHaveBeenCalledWith(reloaded)
    expect(user).toBe(reloaded)
})
