package org.openforis.sepal.sandboxwebproxy

import io.undertow.Handlers
import io.undertow.Undertow
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.session.*
import io.undertow.util.Headers
import org.openforis.sepal.sandbox.SandboxManager

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
        def proxyHandler = Handlers.proxyHandler(new SandboxProxyClient(endpointByPort, sandboxManager))
        def sessionManager = new InMemorySessionManager('rstudio-proxy', 1000, true)
        sessionManager.registerSessionListener(new Listener())
        def handler = new ErrorHandler(
                new SessionAttachmentHandler(
                        proxyHandler, sessionManager, new SessionCookieConfig())
        )
        this.server = Undertow.builder()
                .addHttpListener(port, "0.0.0.0")
                .setHandler(handler)
                .build()
    }

    void start() {
        server.start()
    }

    void stop() {
        server.stop()
    }

    static class BadRequestException extends RuntimeException {
        BadRequestException(String message) {
            super(message)
        }
    }

    private static class ErrorHandler implements HttpHandler {
        private final HttpHandler next

        ErrorHandler(HttpHandler next) {
            this.next = next
        }

        void handleRequest(HttpServerExchange exchange) throws Exception {
            try {
                next.handleRequest(exchange)
            } catch (BadRequestException e) {
                exchange.statusCode = 400
                exchange.getResponseHeaders().put(Headers.CONTENT_TYPE, "text/html");
                def sender = exchange.getResponseSender()
                sender.send(e.message)
            }
        }
    }

    private static class Listener implements SessionListener {
        void sessionCreated(Session session, HttpServerExchange exchange) {
        }

        void sessionDestroyed(Session session, HttpServerExchange exchange, SessionListener.SessionDestroyedReason reason) {
        }

        void attributeAdded(Session session, String name, Object value) {
        }

        void attributeUpdated(Session session, String name, Object newValue, Object oldValue) {
        }

        void attributeRemoved(Session session, String name, Object oldValue) {
        }

        void sessionIdChanged(Session session, String oldSessionId) {
        }
    }

}

