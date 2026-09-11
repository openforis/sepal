const AUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://www.googleapis.com/oauth2/v4/token'
const REVOKE_URL = 'https://accounts.google.com/o/oauth2/revoke'
const SCOPE = [
    'https://www.googleapis.com/auth/earthengine',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/cloudplatformprojects.readonly'
].join(' ')

// Thrown when Google reports invalid_token/invalid_grant — the caller clears the stored tokens.
export class InvalidTokenError extends Error {}

export class GoogleOAuth {
    #clientId
    #clientSecret
    #redirectUri
    #fetchFn
    #clock

    constructor({clientId, clientSecret, callbackBaseUrl, fetchFn, clock}) {
        this.#clientId = clientId
        this.#clientSecret = clientSecret
        this.#redirectUri = `${callbackBaseUrl}/api/user/google/access-request-callback`
        this.#fetchFn = fetchFn
        this.#clock = clock
    }

    redirectUrl(destinationUrl) {
        const params = new URLSearchParams({
            scope: SCOPE,
            prompt: 'consent',
            access_type: 'offline',
            include_granted_scopes: 'true',
            state: destinationUrl,
            redirect_uri: this.#redirectUri,
            response_type: 'code',
            client_id: this.#clientId
        })
        return `${AUTH_BASE_URL}?${params}`
    }

    // Google reports the lifetime as a duration, so the expiry is anchored on the moment the request
    // was made rather than the moment the answer came back: a slow round trip must not extend a token.
    async requestTokens(authorizationCode) {
        const requestedAt = this.#clock().getTime()
        const data = await this.#postToken({
            code: authorizationCode,
            client_id: this.#clientId,
            client_secret: this.#clientSecret,
            redirect_uri: this.#redirectUri,
            grant_type: 'authorization_code'
        })
        return {
            refreshToken: data.refresh_token,
            accessToken: data.access_token,
            accessTokenExpiryDate: requestedAt + 1000 * data.expires_in,
            projectId: null,
            legacyProject: false
        }
    }

    async refreshAccessToken(tokens) {
        const requestedAt = this.#clock().getTime()
        const data = await this.#postToken({
            refresh_token: tokens.refreshToken,
            client_id: this.#clientId,
            client_secret: this.#clientSecret,
            redirect_uri: this.#redirectUri,
            grant_type: 'refresh_token'
        })
        return {
            refreshToken: tokens.refreshToken,
            accessToken: data.access_token,
            accessTokenExpiryDate: requestedAt + 1000 * data.expires_in,
            projectId: tokens.projectId ?? null,
            legacyProject: tokens.legacyProject ?? false
        }
    }

    async revokeTokens(tokens) {
        await this.#fetchFn(REVOKE_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({token: tokens.refreshToken}).toString()
        })
    }

    async #postToken(params) {
        const response = await this.#fetchFn(TOKEN_URL, {
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
}
