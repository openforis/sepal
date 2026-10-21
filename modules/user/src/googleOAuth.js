import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto'

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
    // shortcut: the state key lives per process, so a restart mid sign-in fails that sign-in; persist it if user ever runs replicas.
    #stateKey = randomBytes(32)

    constructor({clientId, clientSecret, callbackBaseUrl, fetchFn, clock}) {
        this.#clientId = clientId
        this.#clientSecret = clientSecret
        this.#redirectUri = `${callbackBaseUrl}/api/user/google/access-request-callback`
        this.#fetchFn = fetchFn
        this.#clock = clock
    }

    // The state is bound to the user, so a callback carrying someone else's code links nothing (login CSRF),
    // and holds only a local path, so the final redirect cannot leave SEPAL.
    redirectUrl(username, destinationUrl) {
        const path = localPath(destinationUrl)
        const params = new URLSearchParams({
            scope: SCOPE,
            prompt: 'consent',
            access_type: 'offline',
            include_granted_scopes: 'true',
            state: `${this.#sign(username, path)}.${path}`,
            redirect_uri: this.#redirectUri,
            response_type: 'code',
            client_id: this.#clientId
        })
        return `${AUTH_BASE_URL}?${params}`
    }

    // The local path a state sends the user back to, or null when it was not issued to this user.
    destinationPath(username, state) {
        const separator = typeof state === 'string' ? state.indexOf('.') : -1
        if (separator < 0) {
            return null
        }
        const signature = Buffer.from(state.slice(0, separator))
        const path = state.slice(separator + 1)
        const expected = Buffer.from(this.#sign(username, path))
        return signature.length === expected.length && timingSafeEqual(signature, expected) ? path : null
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

    #sign(username, path) {
        return createHmac('sha256', this.#stateKey).update(`${username}\n${path}`).digest('base64url')
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

const localPath = destinationUrl => {
    const {pathname, search, hash} = URL.parse(destinationUrl ?? '/', 'http://local') ?? new URL('http://local/')
    return `/${pathname.replace(/^\/+/, '')}${search}${hash}`
}
