import assert from 'node:assert/strict'
import {beforeEach, describe, test} from 'node:test'

import {GoogleOAuth, InvalidTokenError} from './googleOAuth.js'

// The protocol boundary: what goes to Google, and how its answer becomes stored tokens. Exercised
// through the injected http function, so nothing here reaches the network.

describe('GoogleOAuth', () => {
    let requests

    beforeEach(() => {
        requests = []
    })

    describe('redirectUrl', () => {
        test('sends the user to Google with the consent this module needs', () => {
            const url = new URL(oauth().redirectUrl(USERNAME, DESTINATION))

            const params = url.searchParams
            assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
            assert.equal(params.get('client_id'), CLIENT_ID)
            assert.equal(params.get('response_type'), 'code')
            assert.equal(params.get('access_type'), 'offline')
            assert.equal(params.get('prompt'), 'consent')
            assert.equal(params.get('include_granted_scopes'), 'true')
            assert.equal(params.get('redirect_uri'), REDIRECT_URI)
            assert.equal(params.get('scope'), 'https://www.googleapis.com/auth/earthengine'
            + ' https://www.googleapis.com/auth/drive'
            + ' https://www.googleapis.com/auth/cloudplatformprojects.readonly')
        })
    })

    describe('destinationPath', () => {
        test('sends the user who started the sign-in back to the path they came from', () => {
            const client = oauth()

            const path = client.destinationPath(USERNAME, stateOf(client.redirectUrl(USERNAME, DESTINATION)))

            assert.equal(path, '/app?tab=account')
        })

        test('refuses a state issued to another user', () => {
            const client = oauth()

            const path = client.destinationPath(USERNAME, stateOf(client.redirectUrl('mallory', DESTINATION)))

            assert.equal(path, null)
        })

        test('never sends the user off SEPAL', () => {
            const client = oauth()

            const path = client.destinationPath(USERNAME, stateOf(client.redirectUrl(USERNAME, 'https://evil.example//evil.example/x')))

            assert.equal(path, '/evil.example/x')
        })
    })

    describe('requestTokens', () => {
        test('exchanges the authorization code for tokens', async () => {
            const tokens = await oauth({
                answers: answering({access_token: 'AT', refresh_token: 'RT', expires_in: 3600})
            }).requestTokens('the-code')

            const [request] = requests
            const body = new URLSearchParams(request.options.body)
            assert.equal(request.url, 'https://www.googleapis.com/oauth2/v4/token')
            assert.equal(body.get('grant_type'), 'authorization_code')
            assert.equal(body.get('code'), 'the-code')
            assert.equal(body.get('client_id'), CLIENT_ID)
            assert.equal(body.get('client_secret'), CLIENT_SECRET)
            assert.equal(body.get('redirect_uri'), REDIRECT_URI)
            assert.deepEqual(tokens, {
                refreshToken: 'RT', accessToken: 'AT',
                accessTokenExpiryDate: NOW.getTime() + 3600_000,
                projectId: null, legacyProject: false
            })
        })

        // Google reports a lifetime, not an instant: a token that took a minute to arrive expires a
        // minute earlier than one that arrived at once.
        test('dates the expiry from when it asked, not from when the answer came back', async () => {
            let now = NOW
            const client = oauth({
                clock: () => now,
                answers: async () => {
                    now = new Date(NOW.getTime() + 60_000)
                    return okResponse({access_token: 'AT', refresh_token: 'RT', expires_in: 3600})
                }
            })

            const tokens = await client.requestTokens('the-code')

            assert.equal(tokens.accessTokenExpiryDate, NOW.getTime() + 3600_000)
        })
    })

    describe('refreshAccessToken', () => {
        test('keeps the refresh token and the project the user chose', async () => {
            const previous = {
                refreshToken: 'RT', accessToken: 'old', accessTokenExpiryDate: 0,
                projectId: 'a-project', legacyProject: true
            }

            const tokens = await oauth({
                answers: answering({access_token: 'AT2', expires_in: 3600})
            }).refreshAccessToken(previous)

            assert.deepEqual(tokens, {
                refreshToken: 'RT', accessToken: 'AT2',
                accessTokenExpiryDate: NOW.getTime() + 3600_000,
                projectId: 'a-project', legacyProject: true
            })
        })

        test('reports a refresh token Google has rejected as invalid, so the caller can clear it', async () => {
            const client = oauth({answers: answering({error: 'invalid_grant'}, {ok: false, status: 400})})

            await assert.rejects(client.refreshAccessToken({refreshToken: 'RT'}), InvalidTokenError)
        })

        test('reports any other refusal as a plain failure', async () => {
            const client = oauth({answers: answering({})})

            await assert.rejects(client.refreshAccessToken({refreshToken: 'RT'}), error => !(error instanceof InvalidTokenError))
            await assert.rejects(
                client.refreshAccessToken({refreshToken: 'RT'}),
                /Google OAuth token request failed/
            )
        })
    })

    describe('revokeTokens', () => {
        test('hands the refresh token back to Google', async () => {
            await oauth().revokeTokens({refreshToken: 'RT'})

            const [request] = requests
            assert.equal(request.url, 'https://accounts.google.com/o/oauth2/revoke')
            assert.equal(new URLSearchParams(request.options.body).get('token'), 'RT')
        })
    })

    const oauth = ({answers = answering({}), clock = () => NOW} = {}) => new GoogleOAuth({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        callbackBaseUrl: CALLBACK_BASE_URL,
        fetchFn: (url, options) => {
            requests.push({url, options})
            return answers(url, options)
        },
        clock
    })

    const answering = (body, over = {}) => async () => okResponse(body, over)

    const okResponse = (body, over = {}) => ({ok: true, status: 200, json: async () => body, ...over})

    const NOW = new Date('2026-07-01T12:00:00Z')
    const CLIENT_ID = 'cid'
    const CLIENT_SECRET = 'csecret'
    const CALLBACK_BASE_URL = 'https://sepal.example.org'
    const REDIRECT_URI = 'https://sepal.example.org/api/user/google/access-request-callback'
    const USERNAME = 'alice'
    const DESTINATION = 'https://sepal.example.org/app?tab=account'

    const stateOf = url => new URL(url).searchParams.get('state')
})
