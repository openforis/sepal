package org.openforis.sepal.sandboxwebproxy

import io.undertow.Handlers
import io.undertow.Undertow
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.session.*
import org.openforis.sepal.sandbox.NonExistingUser
import org.openforis.sepal.sandbox.SandboxManager

import static io.undertow.server.session.SessionListener.SessionDestroyedReason

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
    private final Undertow server

    /**
     * Creates the proxy.
     * @param port the port the proxy run on
     * @param endpointByPort specifies which port each proxied endpoint run on
     * @param sandboxManager the sandbox manager used to obtain sandboxes.
     */
    SandboxWebProxy(int port, Map<String, Integer> endpointByPort, SandboxManager sandboxManager) {
        this.server = Undertow.builder()
                .addHttpListener(port, "0.0.0.0")
                .setHandler(createHandler(endpointByPort, sandboxManager))
                .build()
    }

    private HttpHandler createHandler(Map<String, Integer> endpointByPort, SandboxManager sandboxManager) {
        def sessionManager = new InMemorySessionManager('sandbox-web-proxy', 1000, true)
        sessionManager.registerSessionListener(new Listener(sandboxManager))
        new ErrorHandler(
                new SessionAttachmentHandler(
                        Handlers.proxyHandler(
                                new DynamicProxyClient(
                                        new SessionBasedUriProvider(endpointByPort, sandboxManager)
                                )
                        ), sessionManager, new SessionCookieConfig())
        )
    }

    void start() {
        server.start()
    }

    void stop() {
        server.stop()
    }

    private static class Listener extends SessionDestroyedListener {
        private final SandboxManager sandboxManager

        Listener(SandboxManager sandboxManager) {
            this.sandboxManager = sandboxManager
        }

        void sessionDestroyed(Session session, HttpServerExchange exchange, SessionDestroyedReason reason) {
        }
    }

    private static class SessionBasedUriProvider implements DynamicProxyClient.UriProvider {
        private final Map<String, Integer> endpointByPort
        private final SandboxManager sandboxManager

        SessionBasedUriProvider(Map<String, Integer> endpointByPort, SandboxManager sandboxManager) {
            this.endpointByPort = endpointByPort
            this.sandboxManager = sandboxManager
        }

        URI provide(HttpServerExchange exchange) {
            def session = getOrCreateSession(exchange)
            def endpoint = determineEndpoint(exchange)
            def user = determineUser(exchange)
            def sandboxHost = determineSandboxHost(user, session)

            def uriSessionKey = determineUriSessionKey(endpoint, user)
            def uri = session.getAttribute(uriSessionKey) as URI
            if (!uri) {
                uri = URI.create("http://$sandboxHost:${endpointByPort[endpoint]}")
                session.setAttribute(uriSessionKey, uri)
            }
            return uri
        }

        private String determineUser(HttpServerExchange exchange) {
            def user = exchange.requestHeaders.getFirst('sepal-user')
            String user1 = user
            if (!user1)
                throw new BadRequest('Missing header: sepal-user')
            return user
        }

        private String determineEndpoint(HttpServerExchange exchange) {
            def endpoint = exchange.requestHeaders.getFirst('sepal-endpoint')
            String endpoint1 = endpoint
            if (!endpoint1)
                throw new BadRequest('Missing header: sepal-endpoint')
            if (!endpointByPort.containsKey(endpoint1))
                throw new BadRequest("Non-existing sepal-endpoint: ${endpoint1}")
            return endpoint
        }

        private String determineSandboxHost(String user, Session session) {
            def sessionKey = determineSandboxHostSessionKey(user)
            String sandboxHost = session.getAttribute(sessionKey) as String
            if (!sandboxHost) {
                def sandbox
                try {
                    sandbox = sandboxManager.obtain(user)
                } catch (NonExistingUser e) {
                    throw new BadRequest(e.getMessage())
                }
                sandboxHost = sandbox.uri
                session.setAttribute(sessionKey, sandboxHost)
            }
            sandboxHost
        }

        private String determineSandboxHostSessionKey(String user) {
            return 'sepal-sandbox-host' + user
        }

        private String determineUriSessionKey(String endpoint, String user) {
            return 'sepal-target-uri-' + endpoint + '|' + user
        }

        private Session getOrCreateSession(HttpServerExchange exchange) {
            SessionManager sessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
            SessionConfig sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
            return sessionManager.getSession(exchange, sessionConfig) ?:
                    sessionManager.createSession(exchange, sessionConfig)
        }
    }
}