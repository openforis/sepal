package org.openforis.sepal.component.sandboxwebproxy

import groovy.json.JsonOutput
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
        Map status
        if (exchange.requestMethod as String == 'POST')
            status = endpointProvider.startEndpoint(exchange)
        else
            status = endpointProvider.endpointStatus(exchange)
        LOG.debug("Sending sandbox status " + status + " for " + exchange)
        exchange.responseSender.send(JsonOutput.toJson(status))
    }
}





