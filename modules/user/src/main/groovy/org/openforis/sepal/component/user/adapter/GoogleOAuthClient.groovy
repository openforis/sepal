package org.openforis.sepal.component.user.adapter

import groovyx.net.http.HttpResponseException
import groovyx.net.http.RESTClient
import org.openforis.sepal.user.GoogleTokens
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.URLENC

interface GoogleOAuthClient {
    URI redirectUrl(String destinationUrl)

    GoogleTokens requestTokens(String authorizationCode)

    GoogleTokens refreshAccessToken(GoogleTokens tokens)

    void revokeTokens(GoogleTokens tokens)
}

class RestBackedGoogleOAuthClient implements GoogleOAuthClient {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    public static final SCOPE = '' +
            'https://www.googleapis.com/auth/earthengine ' +
            'https://www.googleapis.com/auth/devstorage.full_control ' +
            'https://www.googleapis.com/auth/drive'
    private final String sepalHost
    private final String clientId
    private final String clientSecret

    RestBackedGoogleOAuthClient(String sepalHost, String clientId, String clientSecret) {
        this.sepalHost = sepalHost
        this.clientId = clientId
        this.clientSecret = clientSecret
    }

    URI redirectUrl(String destinationUrl) {
        def redirectUrl = "https://$sepalHost/user/google/access-request-callback"
        def baseUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
        def params = [
                scope                 : SCOPE,
                prompt                : 'consent',
                access_type           : 'offline',
                include_granted_scopes: 'true',
                state                 : destinationUrl,
                redirect_uri          : redirectUrl,
                response_type         : 'code',
                client_id             : clientId
        ].collect { name, value ->
            "$name=${URLEncoder.encode(value as String, 'utf-8')}"
        }.join('&')
        return URI.create("$baseUrl?$params")
    }

    GoogleTokens requestTokens(String authorizationCode) {
        def response = http.post(
                uri: 'https://www.googleapis.com/',
                path: 'oauth2/v4/token',
                query: [
                        code         : authorizationCode,
                        client_id    : clientId,
                        client_secret: clientSecret,
                        redirect_uri : "https://$sepalHost/user/google/access-request-callback",
                        grant_type   : 'authorization_code'
                ]
        )
        // TODO: Handle failure
        return new GoogleTokens(
                refreshToken: response.data.refresh_token,
                accessToken: response.data.access_token,
                accessTokenExpiryDate: toTimestamp(response.data.expires_in)
        )
    }

    GoogleTokens refreshAccessToken(GoogleTokens tokens) {
        def response = http.post(
                uri: 'https://www.googleapis.com/',
                path: 'oauth2/v4/token',
                query: [
                        refresh_token: tokens.refreshToken,
                        client_id    : clientId,
                        client_secret: clientSecret,
                        redirect_uri : "https://$sepalHost/user/google/access-request-callback",
                        grant_type   : 'refresh_token'
                ]
        )
        // TODO: Handle failure
        return new GoogleTokens(
                refreshToken: tokens.refreshToken,
                accessToken: response.data.access_token,
                accessTokenExpiryDate: toTimestamp(response.data.expires_in)
        )
    }

    void revokeTokens(GoogleTokens tokens) {
        try {
            http.post(
                    uri: 'https://accounts.google.com/',
                    requestContentType: URLENC,
                    path: 'o/oauth2/revoke',
                    body: [token: tokens.refreshToken]
            )
        } catch (HttpResponseException e) {
            LOG.warn("Failed to revoke tokens $tokens. $e.response.data")
            if (e.response.data?.error != 'invalid_token')
                throw e
        }
    }

    private long toTimestamp(expiresInSeconds) {
        new Date(System.currentTimeMillis() + (1000 * (expiresInSeconds as int))).time
    }

    private RESTClient getHttp() {
        new RESTClient()
    }
}