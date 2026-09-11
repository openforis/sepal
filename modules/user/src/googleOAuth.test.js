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
            const url = new URL(oauth().redirectUrl(DESTINATION))

            const params = url.searchParams
            expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
            expect(params.get('client_id')).toBe(CLIENT_ID)
            expect(params.get('response_type')).toBe('code')
            expect(params.get('access_type')).toBe('offline')
            expect(params.get('prompt')).toBe('consent')
            expect(params.get('include_granted_scopes')).toBe('true')
            expect(params.get('state')).toBe(DESTINATION)
            expect(params.get('redirect_uri')).toBe(REDIRECT_URI)
            expect(params.get('scope')).toBe(
                'https://www.googleapis.com/auth/earthengine'
                + ' https://www.googleapis.com/auth/drive'
                + ' https://www.googleapis.com/auth/cloudplatformprojects.readonly'
            )
        })
    })

    describe('requestTokens', () => {
        test('exchanges the authorization code for tokens', async () => {
            const tokens = await oauth({
                answers: answering({access_token: 'AT', refresh_token: 'RT', expires_in: 3600})
            }).requestTokens('the-code')

            const [request] = requests
            const body = new URLSearchParams(request.options.body)
            expect(request.url).toBe('https://www.googleapis.com/oauth2/v4/token')
            expect(body.get('grant_type')).toBe('authorization_code')
            expect(body.get('code')).toBe('the-code')
            expect(body.get('client_id')).toBe(CLIENT_ID)
            expect(body.get('client_secret')).toBe(CLIENT_SECRET)
            expect(body.get('redirect_uri')).toBe(REDIRECT_URI)
            expect(tokens).toEqual({
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

            expect(tokens.accessTokenExpiryDate).toBe(NOW.getTime() + 3600_000)
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

            expect(tokens).toEqual({
                refreshToken: 'RT', accessToken: 'AT2',
                accessTokenExpiryDate: NOW.getTime() + 3600_000,
                projectId: 'a-project', legacyProject: true
            })
        })

        test('reports a refresh token Google has rejected as invalid, so the caller can clear it', async () => {
            const client = oauth({answers: answering({error: 'invalid_grant'}, {ok: false, status: 400})})

            await expect(client.refreshAccessToken({refreshToken: 'RT'})).rejects.toBeInstanceOf(InvalidTokenError)
        })

        test('reports any other refusal as a plain failure', async () => {
            const client = oauth({answers: answering({})})

            await expect(client.refreshAccessToken({refreshToken: 'RT'})).rejects.not.toBeInstanceOf(InvalidTokenError)
            await expect(client.refreshAccessToken({refreshToken: 'RT'})).rejects.toThrow(/Google OAuth token request failed/)
        })
    })

    describe('revokeTokens', () => {
        test('hands the refresh token back to Google', async () => {
            await oauth().revokeTokens({refreshToken: 'RT'})

            const [request] = requests
            expect(request.url).toBe('https://accounts.google.com/o/oauth2/revoke')
            expect(new URLSearchParams(request.options.body).get('token')).toBe('RT')
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
    const DESTINATION = 'https://sepal.example.org/app'
})
