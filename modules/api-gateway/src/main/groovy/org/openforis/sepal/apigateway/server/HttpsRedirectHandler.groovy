package org.openforis.sepal.apigateway.server

import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.handlers.RedirectHandler
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class HttpsRedirectHandler implements HttpHandler {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final int httpsPort
    private final HttpHandler next

    HttpsRedirectHandler(int httpsPort, HttpHandler next) {
        this.httpsPort = httpsPort
        this.next = next
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        if (exchange.hostPort != httpsPort)
            redirectToHttps(exchange)
        else
            next.handleRequest(exchange)
    }

    private redirectToHttps(HttpServerExchange exchange) {
        def location = "https://$exchange.hostName:$httpsPort$exchange.requestPath"
        if (exchange.queryString)
            location += '?' + exchange.queryString
        LOG.info("Redirecting to HTTPS: " + location)
        new RedirectHandler(location).handleRequest(exchange)
    }
}
