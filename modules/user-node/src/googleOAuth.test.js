import {jest} from '@jest/globals'

jest.unstable_mockModule('./config.js', () => ({
    googleOauthClientId: 'cid',
    googleOauthClientSecret: 'csecret',
    googleOauthCallbackBaseUrl: 'https://sepal.example.org'
}))

const {createGoogleOAuth, shouldBeRefreshed, InvalidTokenError} = await import('./googleOAuth.js')

const REDIRECT = 'https://sepal.example.org/api/user/google/access-request-callback'

const okFetch = body => async () => ({ok: true, status: 200, json: async () => body})

test('redirectUrl builds the consent URL with all required params', () => {
    const oauth = createGoogleOAuth({clientId: 'cid', clientSecret: 'x', callbackBaseUrl: 'https://sepal.example.org'})
    const url = new URL(oauth.redirectUrl('https://sepal.example.org/app'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const p = url.searchParams
    expect(p.get('client_id')).toBe('cid')
    expect(p.get('response_type')).toBe('code')
    expect(p.get('access_type')).toBe('offline')
    expect(p.get('prompt')).toBe('consent')
    expect(p.get('include_granted_scopes')).toBe('true')
    expect(p.get('state')).toBe('https://sepal.example.org/app')
    expect(p.get('redirect_uri')).toBe(REDIRECT)
    expect(p.get('scope')).toBe('https://www.googleapis.com/auth/earthengine https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/cloudplatformprojects.readonly')
})

test('requestTokens exchanges the code and maps the response', async () => {
    const calls = []
    const fetchFn = async (url, opts) => { calls.push([url, opts]); return {ok: true, status: 200, json: async () => ({access_token: 'AT', refresh_token: 'RT', expires_in: 3600})} }
    const oauth = createGoogleOAuth({clientId: 'cid', clientSecret: 'csecret', callbackBaseUrl: 'https://sepal.example.org', fetchFn})
    const tokens = await oauth.requestTokens('the-code', 1_000_000)
    expect(calls[0][0]).toBe('https://www.googleapis.com/oauth2/v4/token')
    const body = new URLSearchParams(calls[0][1].body)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('the-code')
    expect(body.get('client_id')).toBe('cid')
    expect(body.get('client_secret')).toBe('csecret')
    expect(body.get('redirect_uri')).toBe(REDIRECT)
    expect(tokens).toEqual({refreshToken: 'RT', accessToken: 'AT', accessTokenExpiryDate: 1_000_000 + 3600_000, projectId: null, legacyProject: false})
})

test('refreshAccessToken keeps the existing refresh token + project fields', async () => {
    const fetchFn = okFetch({access_token: 'AT2', expires_in: 3600})
    const oauth = createGoogleOAuth({clientId: 'cid', clientSecret: 'csecret', callbackBaseUrl: 'https://sepal.example.org', fetchFn})
    const prev = {refreshToken: 'RT', accessToken: 'old', accessTokenExpiryDate: 0, projectId: 'proj', legacyProject: true}
    const tokens = await oauth.refreshAccessToken(prev, 2_000_000)
    expect(tokens).toEqual({refreshToken: 'RT', accessToken: 'AT2', accessTokenExpiryDate: 2_000_000 + 3600_000, projectId: 'proj', legacyProject: true})
})

test('refreshAccessToken throws InvalidTokenError on invalid_grant', async () => {
    const fetchFn = async () => ({ok: false, status: 400, json: async () => ({error: 'invalid_grant'})})
    const oauth = createGoogleOAuth({clientId: 'cid', clientSecret: 'x', callbackBaseUrl: 'https://sepal.example.org', fetchFn})
    await expect(oauth.refreshAccessToken({refreshToken: 'RT'}, 0)).rejects.toBeInstanceOf(InvalidTokenError)
})

test('refreshAccessToken throws (generic) when response has no access_token', async () => {
    const fetchFn = okFetch({})
    const oauth = createGoogleOAuth({clientId: 'cid', clientSecret: 'x', callbackBaseUrl: 'https://sepal.example.org', fetchFn})
    await expect(oauth.refreshAccessToken({refreshToken: 'RT'}, 0)).rejects.toThrow()
})

test('revokeTokens posts the refresh token to the revoke endpoint', async () => {
    const calls = []
    const fetchFn = async (url, opts) => { calls.push([url, opts]); return {ok: true, status: 200, json: async () => ({})} }
    const oauth = createGoogleOAuth({clientId: 'cid', clientSecret: 'x', callbackBaseUrl: 'https://sepal.example.org', fetchFn})
    await oauth.revokeTokens({refreshToken: 'RT'})
    expect(calls[0][0]).toBe('https://accounts.google.com/o/oauth2/revoke')
    expect(new URLSearchParams(calls[0][1].body).get('token')).toBe('RT')
})

test('shouldBeRefreshed is true within 10 minutes of expiry, false otherwise', () => {
    const now = 1_000_000_000_000
    expect(shouldBeRefreshed({accessTokenExpiryDate: now + 9 * 60_000}, now)).toBe(true)
    expect(shouldBeRefreshed({accessTokenExpiryDate: now + 11 * 60_000}, now)).toBe(false)
    expect(shouldBeRefreshed({accessTokenExpiryDate: now + 10 * 60_000}, now)).toBe(true)
})
