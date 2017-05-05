package org.openforis.sepal.apigateway.server

import groovyx.net.http.ContentType
import groovyx.net.http.HttpResponseException
import groovyx.net.http.RESTClient
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.ResponseCommitListener
import io.undertow.server.session.Session
import io.undertow.server.session.SessionConfig
import io.undertow.server.session.SessionManager
import io.undertow.util.Headers
import io.undertow.util.HttpString
import io.undertow.util.StatusCodes
import org.slf4j.LoggerFactory

import static groovy.json.JsonOutput.toJson

class AuthenticatingHandler implements HttpHandler {
    private static final LOG = LoggerFactory.getLogger(this)
    private static final int REFRESH_IF_EXPIRES_IN_MINUTES = 5
    private static final NO_CHALLENGE_HEADER = 'No-auth-challenge'
    public static final USER_SESSION_ATTRIBUTE = 'user'

    private final String authenticationUrl
    private final String currentUserUrl
    private final String refreshGoogleAccessTokenUrl
    private final HttpHandler next
    private final userRefreshListener = new UserRefreshListener()

    AuthenticatingHandler(String authenticationUrl, String currentUserUrl, String refreshGoogleAccessTokenUrl, HttpHandler next) {
        this.authenticationUrl = authenticationUrl
        this.currentUserUrl = currentUserUrl
        this.refreshGoogleAccessTokenUrl = refreshGoogleAccessTokenUrl
        this.next = next
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        def user = userFromSession(exchange) ?: authenticate(exchange)
        if (user) {
            user = refreshGoogleAccessTokenIfNeeded(user)
            exchange.requestHeaders.add(HttpString.tryFromString('sepal-user'), toJson(user))
            next.handleRequest(exchange)
        } else
            challenge(exchange)
        exchange.addResponseCommitListener(userRefreshListener)
    }

    Map refreshGoogleAccessTokenIfNeeded(Map user) {
        if (!user?.googleTokens?.accessTokenExpiryDate)
            return user
        try {
            def expiresInMinutes = (user.googleTokens.accessTokenExpiryDate - System.currentTimeMillis()) / 60 / 1000 as int
            if (expiresInMinutes < REFRESH_IF_EXPIRES_IN_MINUTES) {
                def http = new RESTClient(refreshGoogleAccessTokenUrl)
                def response = http.post(
                        contentType: ContentType.JSON,
                        headers: ['sepal-user': toJson(user)]
                )
                user.googleTokens = response.data
            }
        } catch (HttpResponseException e) {
            LOG.warn('Failed to refresh user token. user: $user', e)
        }
        return user
    }

    private Map userFromSession(HttpServerExchange exchange) {
        def user = getOrCreateSession(exchange, false)?.getAttribute(USER_SESSION_ATTRIBUTE) as Map
        if (LOG.isTraceEnabled()) LOG.trace("User from session: $user:, Exchange: " + exchange)
        return user
    }

    private Session getOrCreateSession(HttpServerExchange exchange, boolean create = true) {
        def sessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
        def sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
        def session = sessionManager.getSession(exchange, sessionConfig)
        if (!session && create) {
            if (LOG.isTraceEnabled()) LOG.trace("Creating new session: " + exchange)
            session = sessionManager.createSession(exchange, sessionConfig)
        } else if (!session) {
            LOG.trace("No existing session, and will not create one: " + exchange)
        } else if (LOG.isTraceEnabled()) LOG.trace("Existing session: " + exchange)
        return session
    }

    private void challenge(HttpServerExchange exchange) {
        if (!exchange.requestHeaders.contains(NO_CHALLENGE_HEADER)) {
            exchange.responseHeaders.add(Headers.WWW_AUTHENTICATE, $/$Headers.BASIC realm="Sepal"/$)
            LOG.info("Sending authentication challenge: " + exchange)
        } else
            LOG.info("Unauthorized, but no challenge sent: " + exchange)
        exchange.statusCode = StatusCodes.UNAUTHORIZED
    }

    private Map authenticate(HttpServerExchange exchange) {
        def hasAuthenticationHeader = exchange.requestHeaders.getFirst(Headers.AUTHORIZATION)?.toLowerCase()?.startsWith('basic ')
        if (!hasAuthenticationHeader)
            return null
        String[] usernamePassword = basicAuthUsernamePassword(exchange)
        if (usernamePassword.length != 2) {
            LOG.info("Malformed authentication request")
            return null
        }

        def http = new RESTClient(authenticationUrl)
        http.handler.failure = { return it }
        def username = usernamePassword[0]
        if (LOG.isTraceEnabled()) LOG.trace("Authenticating " + username)
        def response = http.post(
                requestContentType: ContentType.URLENC,
                contentType: ContentType.JSON,
                body: [
                        username: username,
                        password: usernamePassword[1]
                ])

        if (response.status == 200 && response.data instanceof Map) {
            def session = getOrCreateSession(exchange)
            session.setAttribute(USER_SESSION_ATTRIBUTE, response.data)
            return response.data
        }
        if (response.status != 401)
            throw new AuthenticationFailed(response.status, response.data)
        LOG.info("Invalid credentials " + username)
        return null
    }

    private String[] basicAuthUsernamePassword(HttpServerExchange exchange) {
        def authorization = exchange.requestHeaders.getFirst(Headers.AUTHORIZATION)
        new String(authorization.substring('basic '.length()).decodeBase64()).split(':')
    }

    private class UserRefreshListener implements ResponseCommitListener {
        void beforeCommit(HttpServerExchange exchange) {
            if (exchange.responseHeaders.contains('sepal-user-updated'))
                updateUserInSession(exchange)
        }

        private void updateUserInSession(HttpServerExchange exchange) {
            def user = userFromSession(exchange)
            def http = new RESTClient(currentUserUrl)
            def response = http.get(
                    contentType: ContentType.JSON,
                    headers: ['sepal-user': toJson(user)]
            )
            def session = getOrCreateSession(exchange)
            session.setAttribute(USER_SESSION_ATTRIBUTE, response.data)
        }
    }
}

