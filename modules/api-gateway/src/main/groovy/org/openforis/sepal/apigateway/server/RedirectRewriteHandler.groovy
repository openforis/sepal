package org.openforis.sepal.apigateway.server

import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.ResponseCommitListener
import io.undertow.util.HttpString

class RedirectRewriteHandler implements HttpHandler {
    private final HttpHandler next
    private final responseCommitListener = new Listener()

    RedirectRewriteHandler(HttpHandler next) {
        this.next = next
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        exchange.addResponseCommitListener(responseCommitListener)
        next.handleRequest(exchange)
    }

    private static class Listener implements ResponseCommitListener {
        void beforeCommit(HttpServerExchange exchange) {
            def locationHeaderName = HttpString.tryFromString("Location")
            def headers = exchange.getResponseHeaders()
            def location = headers.getFirst(locationHeaderName)
            if (location != null) {
                URI locationURI = URI.create(location)
                if (locationURI.getHost() == null || locationURI.getHost().equals(exchange.getHostName())) {
                    def clientRelativePath = locationURI.getPath() == null ? "" : locationURI.getPath()
                    def rewrittenURI = "https://${exchange.hostAndPort}${exchange.resolvedPath}${clientRelativePath}"
                    headers.remove(locationHeaderName)
                    headers.add(locationHeaderName, rewrittenURI)
                }
            }

        }
    }
}