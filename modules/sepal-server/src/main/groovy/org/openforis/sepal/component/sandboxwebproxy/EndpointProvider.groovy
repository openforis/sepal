package org.openforis.sepal.component.sandboxwebproxy

import groovy.json.JsonParserType
import groovy.json.JsonSlurper
import io.undertow.server.HttpServerExchange
import io.undertow.server.session.Session
import io.undertow.server.session.SessionConfig
import io.undertow.server.session.SessionListener
import io.undertow.server.session.SessionManager
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSession
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSessionManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.ConcurrentHashMap

class EndpointProvider {
    private final static Logger LOG = LoggerFactory.getLogger(this)
    private static final String USER_HEADER_KEY = "sepal-user"
    static final String USERNAME_KEY = "username"
    static final String SANDBOX_SESSION_ID_KEY = "sandbox-session-id"
    private final SessionManager httpSessionManager
    private final SandboxSessionManager sandboxSessionManager
    private final Map<String, Integer> portByEndpointName

    private final endpointByNameByUsername =
            new ConcurrentHashMap<String, ConcurrentHashMap<String, Endpoint>>()
    private final endpointsBySandboxHost = new ConcurrentHashMap<String, Set<Endpoint>>()
    private final sandboxSessionIdByhttpSessionId = new ConcurrentHashMap<String, String>()

    EndpointProvider(
            SessionManager httpSessionManager,
            SandboxSessionManager sandboxSessionManager,
            Map<String, Integer> portByEndpointName) {
        this.httpSessionManager = httpSessionManager
        this.sandboxSessionManager = sandboxSessionManager
        this.portByEndpointName = portByEndpointName

        sandboxSessionManager.onSessionClosed {
            def sandboxSession = sandboxSessionManager.findSession(it)
            if (sandboxSession)
                sandboxSessionClosed(sandboxSession)
        }

        httpSessionManager.registerSessionListener(new SessionListener() {
            void sessionCreated(Session session, HttpServerExchange exchange) {}

            void sessionDestroyed(Session session, HttpServerExchange exchange, SessionListener.SessionDestroyedReason reason) {
                def sandboxSessionId = sandboxSessionIdByhttpSessionId.remove(session.id)
                LOG.debug("HTTP Session destroyed. httpSessionId: $session.id, sandboxSessionId: $sandboxSessionId")
            }

            void attributeAdded(Session session, String name, Object value) {}

            void attributeUpdated(Session session, String name, Object newValue, Object oldValue) {}

            void attributeRemoved(Session session, String name, Object oldValue) {}

            void sessionIdChanged(Session session, String oldSessionId) {}
        })
    }

    Runnable heartbeatSender() {
        return {
            try {
                LOG.debug("Sending heartbeats for sandbox sessions referenced in http sessions")
                def sandboxSessionIds = sandboxSessionIdByhttpSessionId.values().toSet() as Set<String>
                sandboxSessionIds.each { sandboxSessionId ->
                    sendHeartbeat(sandboxSessionId)
                }
            } catch (Exception e) {
                LOG.error("Failed to send heartbeats", e)
            }
        } as Runnable
    }

    private void sendHeartbeat(String sandboxSessionId) {
        def sandboxSession = sandboxSessionManager.findSession(sandboxSessionId)
        if (!sandboxSession) {
            LOG.debug("Trying to send heartbeat to non-existing sandbox session. sandboxSessionId: $sandboxSessionId")
            return
        }

        try {
            if (sandboxSession.closed)
                sandboxSessionClosed(sandboxSession)
            else {
                LOG.debug("Sending heartbeat. sandboxSession: $sandboxSession")
                sandboxSessionManager.heartbeat(sandboxSessionId, sandboxSession.username)
            }
        } catch (Exception e) {
            LOG.error("Failed to send sandbox sesssion heartbeat. sandboxSession: $sandboxSession", e)
            def endpoints = endpointByNameByUsername[sandboxSession.username].values()
                    .findAll { it.sandboxSessionId == sandboxSessionId }
            endpoints.each {
                LOG.debug("Closed endpoint after failing to send heartbeat. endpoint: $it, sandboxSession: $sandboxSession")
                it.close()
            }
        }
    }

    void sandboxSessionClosed(SandboxSession sandboxSession) {
        LOG.debug("Sandbox session closed. sandboxSession: $sandboxSession")
        endpointsBySandboxHost.remove(sandboxSession.host)?.each { endpoint ->
            endpointByNameByUsername.get(endpoint.username)?.remove(endpoint.name)
            endpoint.close()
        }
    }

    private addEndpoint(SandboxSession sandboxSession, String endpointName, String username) {
        def endpointUri = URI.create("http://${sandboxSession.host}:${portByEndpointName[endpointName]}")
        def endpoints = endpointsBySandboxHost.computeIfAbsent(endpointUri.host) {
            ConcurrentHashMap.newKeySet()
        }
        def endpoint = new Endpoint(endpointName, username, endpointUri, sandboxSession.id)
        endpoints.add(endpoint)
        endpointByNameByUsername[username][endpointName] = endpoint
    }

    private removeEndpoint(Endpoint endpoint) {
        endpoint.close()
        endpointsBySandboxHost.get(endpoint.sandboxHost)?.remove(endpoint)
        endpointByNameByUsername.get(endpoint.username)?.remove(endpoint.name)
    }

    String endpointStatus(HttpServerExchange exchange) {
        def endpointName = exchange.queryParameters.endpoint?.peekFirst() as String
        if (!endpointName)
            throw new BadRequest('Missing query parameter: endpoint', 400)
        def username = username(exchange)
        def httpSession = getOrCreateHttpSession(exchange)

        def sandboxSession = findSandboxSession(httpSession, username)

        if (!sandboxSession)
            throw new BadRequest("No session started for endpoint $endpointName", 400)

        if (sandboxSession.isActive())
            return 'STARTED'
        else
            return 'STARTING'
    }

    String startEndpoint(HttpServerExchange exchange) {
        def endpointName = exchange.queryParameters.endpoint?.peekFirst() as String
        if (!endpointName)
            throw new BadRequest('Missing query parameter: endpoint', 400)
        def username = username(exchange)
        def httpSession = getOrCreateHttpSession(exchange)

        def sandboxSession = findOrRequestSandboxSession(httpSession, username)
        httpSession.setAttribute(SANDBOX_SESSION_ID_KEY, sandboxSession.id)
        sandboxSessionIdByhttpSessionId[httpSession.id] = sandboxSession.id

        def endpointByName = endpointByNameByUsername.computeIfAbsent(username) {
            new ConcurrentHashMap<>()
        }

        def endpoint = endpointByName.get(endpointName)
        if (endpoint && endpoint.sandboxSessionId != sandboxSession.id) {
            // Endpoint doesn't match the expected sandbox
            removeEndpoint(endpoint)
            endpoint = null
        }

        if (!endpoint)
            addEndpoint(sandboxSession, endpointName, username)

        if (sandboxSession.isActive())
            return 'STARTED'
        else
            return 'STARTING'
    }

    Endpoint endpointFor(HttpServerExchange exchange) {
        def username = username(exchange)
        def endpointName = endpointName(exchange)
        def endpoint = endpointByNameByUsername.get(username)?.get(endpointName)
        if (!endpoint)
            throw new BadRequest("Endpoint must be started: ${endpointName}", 400)
        return endpoint
    }

    private SandboxSession findSandboxSession(Session httpSession, String username) {
        def sandboxSessionId = httpSession.getAttribute(SANDBOX_SESSION_ID_KEY) as String
        def sandboxSession = null
        if (sandboxSessionId)
            sandboxSession = sandboxSessionManager.findSession(sandboxSessionId)
        if (!sandboxSession || sandboxSession.closed) {
            def sandboxSessions = sandboxSessionManager.findPendingOrActiveSessions(username)
            // Take first active, or pending if none available
            if (sandboxSessions)
                sandboxSession = sandboxSessions.sort { it.active }.reverse().first()
            else
                sandboxSession = null // Don't use a closed sandbox session
        }
        if (sandboxSession && sandboxSession.username == username)
            sandboxSessionManager.heartbeat(sandboxSession.id, username)
        return sandboxSession
    }

    private SandboxSession findOrRequestSandboxSession(Session httpSession, String username) {
        return findSandboxSession(httpSession, username) ?: sandboxSessionManager.requestSession(username)
    }

    private String endpointName(HttpServerExchange exchange) {
        def endpointName = exchange.requestURI.find('/([^/]+)') { match, group -> group }
        if (!endpointName)
            throw new BadRequest('Endpoint must be specified: ' + exchange.requestURL, 404)
        if (!portByEndpointName.containsKey(endpointName))
            throw new BadRequest("Non-existing sepal-endpoint: ${endpointName}", 404)
        return endpointName
    }

    private String username(HttpServerExchange exchange) {
        def httpSession = getOrCreateHttpSession(exchange)
        def username = httpSession.getAttribute(USERNAME_KEY)
        if (!username) {
            def user = exchange.requestHeaders.getFirst(USER_HEADER_KEY)
            if (!user)
                throw new BadRequest("Missing header: $USER_HEADER_KEY", 400)
            try {
                username = new JsonSlurper(type: JsonParserType.LAX).parseText(user).username
            } catch (Exception ignore) {
            }
            if (!username)
                throw new BadRequest("Malformed header: $USER_HEADER_KEY", 400)
            httpSession.setAttribute(USERNAME_KEY, username)
        }
        return username
    }

    private Session getOrCreateHttpSession(HttpServerExchange exchange) {
        SessionManager httpSessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
        SessionConfig sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
        def session = httpSessionManager.getSession(exchange, sessionConfig)
        if (!session)
            session = httpSessionManager.createSession(exchange, sessionConfig)
        return session
    }

}