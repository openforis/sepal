package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class SandboxStartHandler implements HttpHandler {
    private final static Logger LOG = LoggerFactory.getLogger(this)
    final EndpointProvider endpointProvider

    SandboxStartHandler(EndpointProvider endpointProvider) {
        this.endpointProvider = endpointProvider
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        if (exchange.requestMethod as String != 'POST')
            throw new BadRequest('/start requires a POST', 400)
        String status = endpointProvider.startEndpoint(exchange)
        LOG.debug("Sending sandbox status " + status + " for " + exchange)
        exchange.responseSender.send("{\"status\": \"$status\"}")
    }
}





