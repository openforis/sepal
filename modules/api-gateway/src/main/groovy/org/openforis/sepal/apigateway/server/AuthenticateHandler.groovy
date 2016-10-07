package org.openforis.sepal.apigateway.server

import groovy.json.JsonOutput
import groovyx.net.http.ContentType
import groovyx.net.http.RESTClient
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.session.Session
import io.undertow.server.session.SessionConfig
import io.undertow.server.session.SessionManager
import io.undertow.util.Headers
import org.openforis.sepal.user.User
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class AuthenticateHandler implements HttpHandler {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    static final String USER_SESSION_ATTRIBUTE = 'user'
    private final String endpoint

    AuthenticateHandler(String endpoint) {
        this.endpoint = endpoint
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        def user = authenticate(exchange)
        exchange.responseHeaders.put(Headers.CONTENT_TYPE, 'application/json')
        exchange.responseHeaders.put(Headers.CONTENT_ENCODING, 'utf-8')
        if (user) {
            def session = getOrCreateSession(exchange)
            session.setAttribute(USER_SESSION_ATTRIBUTE, user)
            exchange.statusCode = 200
            exchange.responseSender.send(JsonOutput.toJson(user))
        } else {
            exchange.statusCode = 401
            exchange.responseSender.send(JsonOutput.toJson([message: 'Invalid credentials']))
        }
    }

    private User authenticate(HttpServerExchange exchange) {
        def requestAttributes = exchange.getAttachment(HttpServerExchange.REQUEST_ATTRIBUTES)
        def username = requestAttributes.get('user')
        def password = requestAttributes.get('password')
        def http = new RESTClient(endpoint)
        http.handler.failure = { return it }
        LOG.info("Authenticating " + username)
        def response = http.post(
                requestContentType: ContentType.URLENC,
                contentType: ContentType.JSON,
                body: [
                        username: username,
                        password: password
                ])

        if (response.status == 200 && response.data instanceof Map)
            return response.data
        if (response.status != 401)
            throw new AuthenticationFailed(response.status, response.data)
        return null
    }


    private Session getOrCreateSession(HttpServerExchange exchange) {
        def sessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
        def sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
        sessionConfig.secure = true
        def session = sessionManager.getSession(exchange, sessionConfig)
        if (!session)
            session = sessionManager.createSession(exchange, sessionConfig)
        return session
    }

}
