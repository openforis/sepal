package org.openforis.sepal.sandboxwebproxy

import io.undertow.Handlers
import io.undertow.Undertow
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.session.*
import org.openforis.sepal.sandbox.Sandbox
import org.openforis.sepal.sandbox.SandboxManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

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

    private final static Logger LOG = LoggerFactory.getLogger(this)

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
        private static final URI_SESSION_ATTRIBUTE = 'sepal-target-uri'
        private final Map<String, Integer> endpointByPort
        private final SandboxManager sandboxManager

        SessionBasedUriProvider(Map<String, Integer> endpointByPort, SandboxManager sandboxManager) {
            this.endpointByPort = endpointByPort
            this.sandboxManager = sandboxManager
        }

        URI provide(HttpServerExchange exchange) {
            def session = getOrCreateSession(exchange)
            def uri = session.getAttribute(URI_SESSION_ATTRIBUTE) as URI
            if (!uri) {
                uri = determineUri(exchange)
                session.setAttribute(URI_SESSION_ATTRIBUTE, uri)
            }
            return uri
        }

        private Session getOrCreateSession(HttpServerExchange exchange) {
            SessionManager sessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
            SessionConfig sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
            return sessionManager.getSession(exchange, sessionConfig) ?:
                    sessionManager.createSession(exchange, sessionConfig)
        }

        private URI determineUri(HttpServerExchange exchange) {
            def endpoint = exchange.requestHeaders.getFirst('sepal-endpoint')
            def user = exchange.requestHeaders.getFirst('sepal-user')
            validateEndpoint(endpoint, endpointByPort)
            def sandbox = null
            try{
                sandbox = validateUser(user)
            }catch (Exception ex){
                throw new BadRequest(ex.getMessage())
            }
            def createdUri = "http://$sandbox.uri:${endpointByPort[endpoint]}"
            URI.create(createdUri)
        }

        private Sandbox validateUser(String user) {
            if (!user) {
                throw new BadRequest('Missing header: sepal-user')
            }
            return sandboxManager.obtain(user)

        }

        private void validateEndpoint(String endpoint, Map<String, Integer> endpointByPort) {
            if (!endpoint)
                throw new BadRequest('Missing header: sepal-endpoint')
            if (!endpointByPort.containsKey(endpoint))
                throw new BadRequest("Non-existing sepal-endpoint: $endpoint")
        }
    }
}