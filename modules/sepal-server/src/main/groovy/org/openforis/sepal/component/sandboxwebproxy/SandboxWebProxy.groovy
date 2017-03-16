package org.openforis.sepal.component.sandboxwebproxy

import groovy.json.JsonParserType
import groovy.json.JsonSlurper
import io.undertow.Handlers
import io.undertow.Undertow
import io.undertow.client.ClientResponse
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.handlers.ResponseCodeHandler
import io.undertow.server.session.*
import io.undertow.util.HeaderMap
import io.undertow.util.HttpString
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
                .setHandler(createHandler(portByEndpoint))
                .build()
    }

    private HttpHandler createHandler(Map<String, Integer> portByEndpoint) {
        def sessionBasedUriProvider = new SessionBasedUriProvider(portByEndpoint, sandboxSessionManager, sessionMonitor)
        def proxyHandler = new PatchedProxyHandler(
                new SandboxProxyClient(sessionBasedUriProvider),
                ResponseCodeHandler.HANDLE_404)
        proxyHandler.addClientResponseListener(new RedirectRewriter())
        def pathHandler = Handlers.path(proxyHandler).addExactPath('/start', sessionBasedUriProvider)
        new BadRequestCatchingHandler(
                new SessionAttachmentHandler(
                        pathHandler,
                        httpSessionManager,
                        new SessionCookieConfig(cookieName: "SANDBOX-SESSIONID", secure: false)))
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
        executor.shutdown()
        server.stop()
    }

    private static String extractEndpoint(HttpServerExchange exchange) {
        exchange.requestURI.find('/([^/]+)') { match, group -> group }
    }

    private static class RedirectRewriter implements PatchedProxyHandler.ClientResponseListener {
        void completed(ClientResponse response, HttpServerExchange exchange) {
            rewriteLocationHeader(response, exchange)
        }

        void failed(IOException e, HttpServerExchange exchange) {}

        private void rewriteLocationHeader(ClientResponse response, HttpServerExchange exchange) {
            HttpString locationHeaderName = HttpString.tryFromString("Location")
            HeaderMap headers = response.getResponseHeaders()
            String location = headers.getFirst(locationHeaderName)
            if (location != null) {
                URI locationURI = URI.create(location)
                if (locationURI.getHost() == null || locationURI.getHost().equals(exchange.getHostName())) {
                    String path = locationURI.getPath() == null ? "" : locationURI.getPath()
                    URI rewrittenURI = locationURI.resolve("/${extractEndpoint(exchange)}${path}")
                    headers.remove(locationHeaderName)
                    headers.add(locationHeaderName, rewrittenURI.toString())
                }
            }

        }
    }

    private static class SessionBasedUriProvider implements UriProvider, HttpHandler {
        private final Map<String, Integer> portByEndpoint
        private final SandboxSessionManager sandboxSessionManager
        private final WebProxySessionMonitor sessionMonitor

        SessionBasedUriProvider(
                Map<String, Integer> portByEndpoint,
                SandboxSessionManager sandboxSessionManager,
                WebProxySessionMonitor sessionMonitor) {
            this.portByEndpoint = portByEndpoint
            this.sandboxSessionManager = sandboxSessionManager
            this.sessionMonitor = sessionMonitor
        }

        void handleRequest(HttpServerExchange exchange) throws Exception {
            if (exchange.requestMethod as String != 'POST')
                throw new BadRequest('/start requires a POST', 404)
            startSandbox(exchange)
        }

        private void startSandbox(HttpServerExchange exchange) {
            def httpSession = getOrCreateHttpSession(exchange)
            def endpoint = exchange.queryParameters.endpoint?.peekFirst() as String
            if (!endpoint)
                throw new BadRequest('Missing query parameter: endpoint', 400)
            def username = determineUsername(exchange)
            def uriSessionKey = determineUriSessionKey(endpoint, username)
            def sandboxSessionId = httpSession.getAttribute(SANDBOX_SESSION_ID_KEY) as String
            URI uri = null
            if (sandboxSessionId) {
                uri = httpSession.getAttribute(uriSessionKey) as URI
                LOG.debug("HTTP session linked with sandbox $sandboxSessionId. endpoint: $uri, exchange: $exchange")
            } else
                LOG.debug("HTTP session not linked with any sandbox. exchange: $exchange")
            if (!uri) {
                def sandboxSession = sandboxSession(sandboxSessionId, username)
                httpSession.setAttribute(SANDBOX_SESSION_ID_KEY, sandboxSession.id)
                httpSession.setAttribute(USERNAME_KEY, username)
                if (sandboxSession.isActive()) {
                    def sandboxHost = determineUri(httpSession, sandboxSession)
                    uri = URI.create("http://$sandboxHost:${portByEndpoint[endpoint]}")
                    httpSession.setAttribute(uriSessionKey, uri)
                    sendSandboxStatus(exchange, 'STARTED')
                } else {
                    sendSandboxStatus(exchange, 'STARTING')
                }
            } else {
                sendSandboxStatus(exchange, 'STARTED')
            }
        }

        private sendSandboxStatus(HttpServerExchange exchange, String status) {
            LOG.debug("Sending sandbox status " + status + " for " + exchange)
            exchange.responseSender.send("{\"status\": \"$status\"}")
        }

        URI provide(HttpServerExchange exchange) {
            LOG.debug("Providing URI for exchange: $exchange")
            def httpSession = getOrCreateHttpSession(exchange)
            def endpoint = determineEndpoint(exchange)
            def username = determineUsername(exchange)
            exchange.resolvedPath = "/$endpoint"
            exchange.relativePath = exchange.requestURI.find('/[^/]+(/?.*)') { match, group -> group }
            def uriSessionKey = determineUriSessionKey(endpoint, username)
            def uri = httpSession.getAttribute(uriSessionKey) as URI
            if (!uri)
                throw new BadRequest('Sandbox is not started', 400)
            return uri
        }

        private static String determineUsername(HttpServerExchange exchange) {
            def user = exchange.requestHeaders.getFirst(USERNAME_KEY)
            if (!user)
                throw new BadRequest("Missing header: $USERNAME_KEY", 400)
            def username = null
            try {
                username = new JsonSlurper(type: JsonParserType.LAX).parseText(user).username
            } catch (Exception ignore) {
            }
            if (!username)
                throw new BadRequest("Malformed header: $USERNAME_KEY", 400)
            return username
        }

        private String determineEndpoint(HttpServerExchange exchange) {
            Object endpoint = extractEndpoint(exchange)
            if (!endpoint)
                throw new BadRequest('Endpoint must be specified: ' + exchange.requestURL, 404)
            if (!portByEndpoint.containsKey(endpoint))
                throw new BadRequest("Non-existing sepal-endpoint: ${endpoint}", 404)
            return endpoint
        }

        private String determineSandboxHostSessionKey(String username) {
            return 'sepal-sandbox-host-' + username
        }

        private String determineUriSessionKey(String endpoint, String username) {
            return 'sepal-target-uri-' + endpoint + '|' + username
        }

        private Session getOrCreateHttpSession(HttpServerExchange exchange) {
            def username = determineUsername(exchange)
            SessionManager httpSessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
            SessionConfig sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
            def session = httpSessionManager.getSession(exchange, sessionConfig)
            if (!session) {
                session = httpSessionManager.createSession(exchange, sessionConfig)
                session.setAttribute('username', username)
                LOG.info("Creating HTTP session. Username: ${username}")
            }
            return session

        }

        private SandboxSession sandboxSession(String sessionId, String username) {
            def sandboxSession = null
            if (sessionId)
                sandboxSession = sandboxSessionManager.findSession(sessionId)
            if (!sandboxSession || sandboxSession.closed) {
                def sandboxSessions = sandboxSessionManager.findPendingOrActiveSessions(username)
                // Take first active, or pending if none available
                if (sandboxSessions)
                    sandboxSession = sandboxSessions.sort { it.active }.reverse().first()
            }
            if (sandboxSession && sandboxSession.username == username)
                sandboxSessionManager.heartbeat(sandboxSession.id, username)
            else
                sandboxSession = sandboxSessionManager.requestSession(username)
            return sandboxSession
        }

        private String determineUri(Session httpSession, SandboxSession sandboxSession) {
            def sessionKey = determineSandboxHostSessionKey(sandboxSession.username)
            sessionMonitor.sandboxSessionBound(httpSession, sandboxSession)
            httpSession.setAttribute(sessionKey, sandboxSession.host)
            return sandboxSession.host
        }
    }
}