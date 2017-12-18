package org.openforis.sepal.apigateway.server

import io.undertow.Handlers
import io.undertow.attribute.ExchangeAttributes
import io.undertow.predicate.Predicates
import io.undertow.protocols.ssl.UndertowXnioSsl
import io.undertow.server.ExchangeCompletionListener
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.ResponseCommitListener
import io.undertow.server.handlers.PathHandler
import io.undertow.server.handlers.ResponseCodeHandler
import io.undertow.server.handlers.encoding.ContentEncodingRepository
import io.undertow.server.handlers.encoding.EncodingHandler
import io.undertow.server.handlers.proxy.LoadBalancingProxyClient
import io.undertow.server.session.InMemorySessionManager
import io.undertow.server.session.SessionAttachmentHandler
import io.undertow.server.session.SessionCookieConfig
import io.undertow.server.session.SessionManager
import io.undertow.util.Headers
import io.undertow.util.HttpString
import org.apache.http.conn.ssl.TrustSelfSignedStrategy
import org.apache.http.ssl.SSLContextBuilder
import org.openforis.sepal.undertow.PatchedGzipEncodingProvider
import org.openforis.sepal.undertow.PatchedProxyHandler
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.xnio.OptionMap
import org.xnio.Xnio

class RootHandler implements HttpHandler {
    private static final int SESSION_TIMEOUT = 30 * 60 // 30 minutes
    private final String host
    private final int httpsPort
    private final String authenticationUrl
    private final String currentUserUrl
    private final String refreshGoogleAccessTokenUrl
    private final PathHandler handler = Handlers.path()
    private final SessionManager sessionManager

    RootHandler(ProxyConfig config) {
        this.host = config.host
        this.httpsPort = config.httpsPort
        this.authenticationUrl = config.authenticationUrl
        this.currentUserUrl = config.currentUserUrl
        this.refreshGoogleAccessTokenUrl = config.refreshGoogleAccessTokenUrl
        sessionManager = new InMemorySessionManager('sandbox-web-proxy', 4096, true)
        this.sessionManager.defaultSessionTimeout = SESSION_TIMEOUT
        handler.addExactPath(config.logoutPath, LogoutHandler.create())
    }

    RootHandler proxy(EndpointConfig endpointConfig) {
        def endpointHandler = new LoggingProxyHandler(endpointConfig, host)
        if (endpointConfig.rewriteRedirects)
            endpointHandler = new RedirectRewriteHandler(endpointHandler)
        if (endpointConfig.authenticate)
            endpointHandler = new AuthenticatingHandler(authenticationUrl, currentUserUrl, refreshGoogleAccessTokenUrl, endpointHandler)
        if (endpointConfig.https)
            endpointHandler = new HttpsRedirectHandler(httpsPort, endpointHandler)
        if (endpointConfig.cached)
            endpointHandler = new CachedHandler(endpointHandler)
        if (endpointConfig.noCache)
            endpointHandler = new NoCacheHandler(endpointHandler)
//        endpointHandler = gzipHandler(endpointHandler)
        def sessionConfig = new SessionCookieConfig(cookieName: "SEPAL-SESSIONID", secure: endpointConfig.https)
        endpointHandler = new SessionAttachmentHandler(endpointHandler, sessionManager, sessionConfig)
        endpointConfig.prefix ?
                handler.addPrefixPath(endpointConfig.path, endpointHandler) :
                handler.addExactPath(endpointConfig.path, endpointHandler)
        return this
    }

    private EncodingHandler gzipHandler(HttpHandler endpointHandler) {
        return new EncodingHandler(
                new ContentEncodingRepository().addEncodingHandler(
                        "gzip",
                        new PatchedGzipEncodingProvider(),
                        50,
                        Predicates.contains(ExchangeAttributes.responseHeader(Headers.CONTENT_TYPE),
                                'text/plain',
                                'text/css',
                                'text/javascript',
                                'application/json',
                                'application/javascript',
                                'application/x-javascript',
                                'text/xml',
                                'application/xml',
                                'application/xml+rss')
                )).setNext(endpointHandler)
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        exchange.requestHeaders.remove('sepal-user') // Prevent client from accessing as user without authenticating
        handler.handleRequest(exchange)
    }

    private static class CachedHandler implements HttpHandler {
        private final HttpHandler next

        CachedHandler(HttpHandler next) {
            this.next = next
        }

        void handleRequest(HttpServerExchange exchange) throws Exception {
            exchange.responseHeaders.add(HttpString.tryFromString('Cache-Control'), 'public, max-age=31536000')
            next.handleRequest(exchange)
        }
    }

    private static class NoCacheHandler implements HttpHandler {
        private final HttpHandler next

        NoCacheHandler(HttpHandler next) {
            this.next = next
        }

        void handleRequest(HttpServerExchange exchange) throws Exception {
            exchange.requestHeaders.remove(HttpString.tryFromString('If-None-Match'))
            exchange.requestHeaders.remove(HttpString.tryFromString('If-Modified-Since'))
            exchange.requestHeaders.remove(HttpString.tryFromString('Cache-Control'))
            exchange.requestHeaders.add(HttpString.tryFromString('Cache-Control'), 'no-cache')
            exchange.responseHeaders.add(HttpString.tryFromString('Cache-Control'), 'max-age=0')
            next.handleRequest(exchange)
        }
    }

    private static class LogoutHandler implements HttpHandler {
        private static final LOG = LoggerFactory.getLogger(this)

        void handleRequest(HttpServerExchange exchange) throws Exception {
            LOG.debug("Logging out: $exchange")
            exchange.requestCookies
                    .findAll { it.key.endsWith('SESSIONID') }
                    .collect { it.value }
                    .each {
                it.value = ''
                it.path = '/'
                it.maxAge = 0
                exchange.responseCookies[it.name] = it
            }
        }

        static HttpHandler create() {
            new LogoutHandler()
        }
    }

    private static class LoggingProxyHandler implements HttpHandler {
        private final Logger LOG = LoggerFactory.getLogger(LoggingProxyHandler)
        private final HttpHandler proxyHandler
        private final String host
        private final String target

        LoggingProxyHandler(EndpointConfig endpointConfig, String host) {
            this.host = host
            target = endpointConfig.target.toString().replaceAll('/$', '') // Remove trailing slashes
            def sslContext = new SSLContextBuilder()
                    .loadTrustMaterial(null, new TrustSelfSignedStrategy())
                    .build()
            def xnioSsl = new UndertowXnioSsl(Xnio.getInstance(), OptionMap.EMPTY, sslContext)
            def proxyClient = new LoadBalancingProxyClient(
                    maxQueueSize: 4096,
                    connectionsPerThread: 20,
                    softMaxConnectionsPerThread: 10
            )
            proxyClient.addHost(URI.create(target), xnioSsl)
            proxyClient.ttl = 30 * 1000
            proxyHandler = new PatchedProxyHandler(
                    proxyClient,
                    -1,
                    ResponseCodeHandler.HANDLE_404,
                    false,
                    false,
                    3
            )
        }

        void handleRequest(HttpServerExchange exchange) throws Exception {
            LOG.debug(exchange.toString())
            exchange.responseHeaders.add(HttpString.tryFromString(
                    'Content-Security-Policy'),
                    "connect-src 'self' wss://$host https://*.googleapis.com https://apis.google.com"
            )
            exchange.addResponseCommitListener(new ResponseCommitListener() {
                void beforeCommit(HttpServerExchange ex) {
                    if (LOG.traceEnabled) LOG.trace("Before response commit. statusCode: $ex.statusCode, exchange: $exchange")
                }
            })
            exchange.addExchangeCompleteListener(new ExchangeCompletionListener() {
                void exchangeEvent(HttpServerExchange ex, ExchangeCompletionListener.NextListener nextListener) {
                    if (LOG.traceEnabled) LOG.trace("Exchange complete. statusCode: $ex.statusCode, exchange: $ex")
                    nextListener.proceed()
                }
            })
            LOG.trace("Forwarding. target: $target, exchange: $exchange")
            proxyHandler.handleRequest(exchange)
        }
    }
}

