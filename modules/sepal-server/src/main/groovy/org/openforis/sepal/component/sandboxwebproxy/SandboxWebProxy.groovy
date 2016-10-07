package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.Undertow
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.handlers.ResponseCodeHandler
import io.undertow.server.session.*
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSession
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSessionManager
import org.openforis.sepal.undertow.PatchedProxyHandler
import org.openforis.sepal.util.NamedThreadFactory
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Proxy for web endpoints on user sandboxes. It provides the user a single, static url for each endpoint.
 * The proxy will make sure a sandbox is obtained, delegates requests to it.
 * <p>
 * Requests to this proxy requires two request headers:
 * <ul>
 * <li>{@code sepal-endpoint} - the name of the endpoint to proxy
 * <li>{@code sepal-user} - the username of the user who's sandbox to proxy
 * </ul>
 */
class SandboxWebProxy {
    private final static Logger LOG = LoggerFactory.getLogger(this)
    static final String SANDBOX_SESSION_ID_KEY = "sepal-sandbox-id"
    static final String USERNAME_KEY = "sepal-user"

    private final Undertow server
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(
            NamedThreadFactory.singleThreadFactory('httpSessionMonitor')
    )
    private final int sessionHeartbeatInterval

    private final SessionManager httpSessionManager
    private final SandboxSessionManager sandboxSessionManager
    private final WebProxySessionMonitor sessionMonitor

    /**
     * Creates the proxy.
     * @param port the port the proxy run on
     * @param portByEndpoint specifies which port each proxied endpoint run on
     * @param sandboxManager the sandbox manager used to obtain sandboxes.
     */
    SandboxWebProxy(int port, Map<String, Integer> portByEndpoint, SandboxSessionManager sandboxSessionManager,
                    int sessionHeartbeatInterval, int sessionDefaultTimeout) {
        this.sessionHeartbeatInterval = sessionHeartbeatInterval
        this.sandboxSessionManager = sandboxSessionManager
        httpSessionManager = new InMemorySessionManager('sandbox-web-proxy', 1000, true)
        httpSessionManager.setDefaultSessionTimeout(sessionDefaultTimeout)
        this.sessionMonitor = new WebProxySessionMonitor(sandboxSessionManager, httpSessionManager)
        this.server = Undertow.builder()
                .addHttpListener(port, "0.0.0.0")
                .setHandler(createHandler(portByEndpoint, sessionMonitor))
                .build()
    }

    private HttpHandler createHandler(Map<String, Integer> portByEndpoint, WebProxySessionMonitor monitor) {
        new SepalHttpHandler(
                new SessionAttachmentHandler(
                        new PatchedProxyHandler(
                                new DynamicProxyClient(
                                        new SessionBasedUriProvider(portByEndpoint, sandboxSessionManager, monitor)
                                ),
                                ResponseCodeHandler.HANDLE_404
                        ), httpSessionManager, new SessionCookieConfig())
        )
    }

    void start() {
        server.start()
        executor.scheduleWithFixedDelay(
                sessionMonitor,
                sessionHeartbeatInterval,
                sessionHeartbeatInterval, TimeUnit.SECONDS
        )
    }

    void stop() {
        executor.shutdown();
        server.stop()
    }

    static String username(Session session) {
        session.getAttribute(USERNAME_KEY) as String
    }

    private static class SessionBasedUriProvider implements DynamicProxyClient.UriProvider {
        private final Map<String, Integer> portByEndpoint
        private final SandboxSessionManager sandboxSessionManager
        private final WebProxySessionMonitor sessionMonitor

        SessionBasedUriProvider(
                Map<String, Integer> portByEndpoint,
                SandboxSessionManager sandboxSessionManager,
                WebProxySessionMonitor sessionMonitor
        ) {
            this.portByEndpoint = portByEndpoint
            this.sandboxSessionManager = sandboxSessionManager
            this.sessionMonitor = sessionMonitor
        }

        URI provide(HttpServerExchange exchange) {
            def httpSession = getOrCreateHttpSession(exchange)
            def endpoint = determineEndpoint(exchange)
            def username = determineUsername(exchange)

            def sandboxSessionId = httpSession.getAttribute(SANDBOX_SESSION_ID_KEY)
            def uriSessionKey = determineUriSessionKey(endpoint, username)
            URI uri = null
            if (sandboxSessionId)
                uri = httpSession.getAttribute(uriSessionKey) as URI
            if (!uri) {
                def sandboxSession = sandboxSession(username)
                def sandboxHost = determineUri(httpSession, sandboxSession)
                uri = URI.create("http://$sandboxHost:${portByEndpoint[endpoint]}")
                httpSession.setAttribute(SANDBOX_SESSION_ID_KEY, sandboxSession.id)
                httpSession.setAttribute(uriSessionKey, uri)
                httpSession.setAttribute(USERNAME_KEY, username)
            }
            return uri
        }

        private static String determineUsername(HttpServerExchange exchange) {
            def username = exchange.requestHeaders.getFirst(USERNAME_KEY)
            if (!username)
                throw new BadRequest("Missing header: $USERNAME_KEY")
            return username
        }

        private String determineEndpoint(HttpServerExchange exchange) {
            def endpoint = exchange.requestHeaders.getFirst('sepal-endpoint')
            if (!endpoint)
                throw new BadRequest('Missing header: sepal-endpoint')
            if (!portByEndpoint.containsKey(endpoint))
                throw new BadRequest("Non-existing sepal-endpoint: ${endpoint}")
            return endpoint
        }

        private String determineUri(Session httpSession, SandboxSession sandboxSession) {
            def sessionKey = determineSandboxHostSessionKey(sandboxSession.username)
            sessionMonitor.sandboxSessionBound(httpSession, sandboxSession)
            httpSession.setAttribute(sessionKey, sandboxSession.host)
            return sandboxSession.host
        }

        private SandboxSession sandboxSession(String username) {
            SandboxSession sandboxSession
            def sepalSessions = sandboxSessionManager.findActiveSessions(username)
            if (sepalSessions) {
                sandboxSession = sepalSessions.first()
                sandboxSessionManager.heartbeat(sandboxSession.id, username)
            } else
                sandboxSession = sandboxSessionManager.requestSession(username)
            return waitForSessionToActivate(sandboxSession)
        }

        private SandboxSession waitForSessionToActivate(SandboxSession sandboxSession) {
            while (!sandboxSession.active) {
                Thread.sleep(5000)
                sandboxSession = sandboxSessionManager.heartbeat(sandboxSession.id, sandboxSession.username)
            }
            return sandboxSession
        }

        private String determineSandboxHostSessionKey(String username) {
            return 'sepal-sandbox-host-' + username
        }

        private String determineUriSessionKey(String endpoint, String username) {
            return 'sepal-target-uri-' + endpoint + '|' + username
        }

        private Session getOrCreateHttpSession(HttpServerExchange exchange) {
            SessionManager httpSessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
            SessionConfig sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
            def session = httpSessionManager.getSession(exchange, sessionConfig)
            if (!session) {
                session = httpSessionManager.createSession(exchange, sessionConfig)
                LOG.info("Creating HTTP session. Username: ${determineUsername(exchange)}")
            }
            return session

        }
    }
}