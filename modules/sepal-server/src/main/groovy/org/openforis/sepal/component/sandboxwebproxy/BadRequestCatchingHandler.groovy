package org.openforis.sepal.component.sandboxwebproxy

import groovy.json.JsonOutput
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.util.Headers
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class BadRequestCatchingHandler implements HttpHandler {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final HttpHandler next

    BadRequestCatchingHandler(HttpHandler next) {
        this.next = next
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        try {
            next.handleRequest(exchange)
        } catch (BadRequest e) {
            LOG.info("Bad Request arrived: $e.message")
            exchange.statusCode = e.status
            exchange.getResponseHeaders().put(Headers.CONTENT_TYPE, "application/json");
            def sender = exchange.getResponseSender()
            sender.send(JsonOutput.toJson(message: e.message))
        }
    }
}
