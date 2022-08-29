const {toQueryString, post$} = require('sepal/httpClient')
const Path = require('node:path')
const {map} = require('rxjs')
const moment = require('moment')

const SCOPE = [
    'https://www.googleapis.com/auth/earthengine',
    'https://www.googleapis.com/auth/drive'
].join(' ')

const toTimestamp = expiresInSeconds =>
    moment().add(expiresInSeconds, 'seconds').milliseconds()

const GoogleOAuthClient = (googleOAuthCallbackBaseUrl, clientId, clientSecret) => {
    const redirectUri = Path.join(googleOAuthCallbackBaseUrl, '/api/user/google/access-request-callback')

    const redirectUrl = destinationUrl => {
        const baseUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
        const params = {
            scope: SCOPE,
            prompt: 'consent',
            access_type: 'offline',
            include_granted_scopes: 'true',
            state: destinationUrl,
            redirect_uri: redirectUri,
            response_type: 'code',
            client_id: clientId
        }

        return [
            baseUrl,
            toQueryString(params)
        ].join('?')
    }

    const requestTokens$ = (username, authorizationCode) =>
        post$('https://www.googleapis.com/oauth2/v4/token', {
            query: {
                code: authorizationCode,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            }
        }).pipe(
            map(response => ({
                refreshToken: response.data.refresh_token,
                accessToken: response.data.access_token,
                accessTokenExpiryDate: toTimestamp(response.data.expires_in)
            }))
        )

    const refreshAccessToken$ = (username, tokens) =>
        post$('https://www.googleapis.com/oauth2/v4/token', {
            query: {
                refresh_token: tokens.refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'refresh_token'
            }
        }).pipe(
            map(response => ({
                refreshToken: tokens.refreshToken,
                accessToken: response.data.access_token,
                accessTokenExpiryDate: toTimestamp(response.data.expires_in)
            }))
        )

    const revokeTokens$ = (username, tokens) =>
        post$('https://accounts.google.com/o/oauth2/revoke', {
            body: {
                token: tokens.refreshToken
            }
        })

    return {
        redirectUrl,
        requestTokens$,
        refreshAccessToken$,
        revokeTokens$
    }
}

module.exports = {GoogleOAuthClient}
