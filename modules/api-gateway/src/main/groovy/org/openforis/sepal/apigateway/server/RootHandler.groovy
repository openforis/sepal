package org.openforis.sepal.apigateway.server

import io.undertow.Handlers
import io.undertow.protocols.ssl.UndertowXnioSsl
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.handlers.PathHandler
import io.undertow.server.handlers.ResponseCodeHandler
import io.undertow.server.handlers.proxy.LoadBalancingProxyClient
import io.undertow.server.session.InMemorySessionManager
import io.undertow.server.session.SessionAttachmentHandler
import io.undertow.server.session.SessionCookieConfig
import io.undertow.server.session.SessionManager
import org.apache.http.conn.ssl.TrustSelfSignedStrategy
import org.apache.http.ssl.SSLContextBuilder
import org.openforis.sepal.undertow.PatchedProxyHandler
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.xnio.OptionMap
import org.xnio.Xnio

class RootHandler implements HttpHandler {
    private static final int SESSION_TIMEOUT = 30 * 60 // 30 minutes
    private final int httpsPort
    private final String authenticationUrl
    private final PathHandler handler = Handlers.path()
    private final SessionManager sessionManager

    RootHandler(int httpsPort, String authenticationUrl) {
        this.httpsPort = httpsPort
        this.authenticationUrl = authenticationUrl
        sessionManager = new InMemorySessionManager('sandbox-web-proxy', 1000, true)
        this.sessionManager.defaultSessionTimeout = SESSION_TIMEOUT
    }

    RootHandler proxy(EndpointConfig endpointConfig) {
        def target = endpointConfig.target.toString().replaceAll('/$', '') // Remove trailing slashes
        def endpointHandler = new LoggingProxyHandler(target)
        if (endpointConfig.authenticate)
            endpointHandler = new SecureEndpointHandler(authenticationUrl, endpointHandler)
        if (endpointConfig.https)
            endpointHandler = new HttpsRedirectHandler(httpsPort, endpointHandler)
        def sessionConfig = new SessionCookieConfig(cookieName: "SEPAL-SESSIONID", secure: true)
        endpointHandler = new SessionAttachmentHandler(endpointHandler, sessionManager, sessionConfig)
        endpointConfig.prefix ?
                handler.addPrefixPath(endpointConfig.path, endpointHandler) :
                handler.addExactPath(endpointConfig.path, endpointHandler)
        return this
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        exchange.requestHeaders.remove('sepal-user') // Prevent client from accessing as user without authenticating
        handler.handleRequest(exchange)
    }

    private static class LoggingProxyHandler implements HttpHandler {
        private final Logger LOG = LoggerFactory.getLogger(LoggingProxyHandler)
        private final HttpHandler proxyHandler
        private final String target

        LoggingProxyHandler(String target) {
            this.target = target
            def sslContext = new SSLContextBuilder()
                    .loadTrustMaterial(null, new TrustSelfSignedStrategy())
                    .build()
            def xnioSsl = new UndertowXnioSsl(Xnio.getInstance(), OptionMap.EMPTY, sslContext)
            def proxyClient = new LoadBalancingProxyClient()
            proxyClient.addHost(URI.create(target), xnioSsl)

            proxyHandler = new PatchedProxyHandler(
                    proxyClient,
                    ResponseCodeHandler.HANDLE_404
            )
        }

        void handleRequest(HttpServerExchange exchange) throws Exception {
            LOG.info("Forwarding to $target: $exchange")
            proxyHandler.handleRequest(exchange)
        }
    }
}

