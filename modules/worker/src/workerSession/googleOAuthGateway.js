// GoogleOAuthGateway — createGoogleOAuthGateway(config) → { refreshTokens(username) }.
//
// refreshTokens issues a JSON POST to `${googleOAuthEndpoint}refresh-access-token` (endpoint
// default `http://user/google/`), and the user module re-issues the user's Google access token
// from the stored refresh token.
//
// Auth: the worker has no user with an access token, so it impersonates an admin via the
// gateway-style `sepal-user` header — a JSON user with the application_admin role the user
// module's [ADMIN] guards expect.

import {getLogger} from '#sepal/log'

import {userTag} from '../tag.js'

const log = getLogger('worker/googleOAuthGateway')

const ADMIN_ROLE = 'application_admin'
const DEFAULT_GOOGLE_OAUTH_ENDPOINT = 'http://user/google/'

const createGoogleOAuthGateway = config => {
    const endpoint = config.googleOAuthEndpoint || DEFAULT_GOOGLE_OAUTH_ENDPOINT

    const refreshTokens = async username => {
        const url = `${endpoint}refresh-access-token`
        // Impersonate an admin via the sepal-user header.
        const sepalUser = JSON.stringify({username, roles: [ADMIN_ROLE]})
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'sepal-user': sepalUser,
            },
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Failed to refresh Google tokens for ${username}: ${response.status} ${text}`)
        }
        log.debug(`Refreshed Google tokens for ${userTag(username)}`)
    }

    return {refreshTokens}
}

export {createGoogleOAuthGateway}
