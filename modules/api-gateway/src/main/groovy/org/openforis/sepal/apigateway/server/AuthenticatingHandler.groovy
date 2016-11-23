package org.openforis.sepal.apigateway.server

import groovyx.net.http.ContentType
import groovyx.net.http.RESTClient
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
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
    private static final NO_CHALLENGE_HEADER = 'No-auth-challenge'
    public static final USER_SESSION_ATTRIBUTE = 'user'

    private final String authenticationUrl
    private final HttpHandler next

    AuthenticatingHandler(String authenticationUrl, HttpHandler next) {
        this.authenticationUrl = authenticationUrl
        this.next = next
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        def user = userFromSession(exchange) ?: authenticate(exchange)
        if (user) {
            exchange.requestHeaders.add(HttpString.tryFromString('sepal-user'), toJson(user))
            next.handleRequest(exchange)
        } else
            challenge(exchange)
    }

    private Map userFromSession(HttpServerExchange exchange) {
        def user = getOrCreateSession(exchange, false)?.getAttribute(USER_SESSION_ATTRIBUTE) as Map
        LOG.debug("User from session: $user:, Exchange: " + exchange)
        return user
    }

    private Session getOrCreateSession(HttpServerExchange exchange, boolean create = true) {
        def sessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
        def sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
        def session = sessionManager.getSession(exchange, sessionConfig)
        if (!session && create) {
            LOG.debug("Creating new session: " + exchange)
            session = sessionManager.createSession(exchange, sessionConfig)
        } else if (!session)
            LOG.debug("No existing session, and will not create one: " + exchange)
        else
            LOG.debug("Existing session: " + exchange)
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
        LOG.info("Authenticating " + username)
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
}

