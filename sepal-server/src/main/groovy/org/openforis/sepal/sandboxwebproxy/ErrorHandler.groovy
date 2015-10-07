package org.openforis.sepal.sandboxwebproxy

import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.util.Headers

class ErrorHandler implements HttpHandler {
    private final HttpHandler next

    ErrorHandler(HttpHandler next) {
        this.next = next
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        try {
            next.handleRequest(exchange)
        } catch (BadRequest e) {
            exchange.statusCode = 400
            exchange.getResponseHeaders().put(Headers.CONTENT_TYPE, "text/html");
            def sender = exchange.getResponseSender()
            sender.send(e.message)
        }
    }
}
