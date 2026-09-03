import {googleOauthCallbackBaseUrl, googleOauthClientId, googleOauthClientSecret} from './config.js'

const AUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://www.googleapis.com/oauth2/v4/token'
const REVOKE_URL = 'https://accounts.google.com/o/oauth2/revoke'
const SCOPE = [
    'https://www.googleapis.com/auth/earthengine',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/cloudplatformprojects.readonly'
].join(' ')
const REFRESH_IF_EXPIRES_IN_MS = 10 * 60 * 1000

// Thrown when Google reports invalid_token/invalid_grant — the caller clears the stored tokens.
class InvalidTokenError extends Error {}

// Refresh when the access token expires within 10 minutes (matches Java GoogleTokens.shouldBeRefreshed).
const shouldBeRefreshed = (tokens, nowMs = Date.now()) =>
    (tokens.accessTokenExpiryDate - nowMs) <= REFRESH_IF_EXPIRES_IN_MS

const createGoogleOAuth = ({clientId, clientSecret, callbackBaseUrl, fetchFn = fetch}) => {
    const redirectUri = `${callbackBaseUrl}/api/user/google/access-request-callback`

    const redirectUrl = destinationUrl => {
        const params = new URLSearchParams({
            scope: SCOPE,
            prompt: 'consent',
            access_type: 'offline',
            include_granted_scopes: 'true',
            state: destinationUrl,
            redirect_uri: redirectUri,
            response_type: 'code',
            client_id: clientId
        })
        return `${AUTH_BASE_URL}?${params}`
    }

    // POST application/x-www-form-urlencoded to Google; classify invalid_token/invalid_grant.
    const postToken = async params => {
        const response = await fetchFn(TOKEN_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams(params).toString()
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.access_token) {
            if (data.error === 'invalid_token' || data.error === 'invalid_grant') {
                throw new InvalidTokenError(JSON.stringify(data))
            }
            throw new Error(`Google OAuth token request failed: ${JSON.stringify(data)}`)
        }
        return data
    }

    const requestTokens = async (authorizationCode, nowMs = Date.now()) => {
        const data = await postToken({
            code: authorizationCode,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        })
        return {
            refreshToken: data.refresh_token,
            accessToken: data.access_token,
            accessTokenExpiryDate: nowMs + 1000 * data.expires_in,
            projectId: null,
            legacyProject: false
        }
    }

    const refreshAccessToken = async (tokens, nowMs = Date.now()) => {
        const data = await postToken({
            refresh_token: tokens.refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'refresh_token'
        })
        return {
            refreshToken: tokens.refreshToken,
            accessToken: data.access_token,
            accessTokenExpiryDate: nowMs + 1000 * data.expires_in,
            projectId: tokens.projectId ?? null,
            legacyProject: tokens.legacyProject ?? false
        }
    }

    const revokeTokens = async tokens => {
        await fetchFn(REVOKE_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({token: tokens.refreshToken}).toString()
        })
    }

    return {redirectUrl, requestTokens, refreshAccessToken, revokeTokens}
}

const googleOAuth = createGoogleOAuth({
    clientId: googleOauthClientId,
    clientSecret: googleOauthClientSecret,
    callbackBaseUrl: googleOauthCallbackBaseUrl
})

export {createGoogleOAuth, googleOAuth, InvalidTokenError, shouldBeRefreshed}
