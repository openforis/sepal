package org.openforis.sepal.apigateway.server

import io.undertow.client.ClientResponse
import io.undertow.server.HttpServerExchange
import io.undertow.util.HttpString
import org.openforis.sepal.undertow.PatchedProxyHandler

class RedirectRewriter implements PatchedProxyHandler.ClientResponseListener {
    void completed(ClientResponse response, HttpServerExchange exchange) {
        def locationHeaderName = HttpString.tryFromString("Location")
        def headers = response.getResponseHeaders()
        def location = headers.getFirst(locationHeaderName)
        if (location != null) {
            URI locationURI = URI.create(location)
            if (locationURI.getHost() == null || locationURI.getHost().equals(exchange.getHostName())) {
                def clientRelativePath = locationURI.getPath() == null ? "" : locationURI.getPath()
                def rewrittenURI = "${exchange.requestScheme}://${exchange.hostAndPort}${exchange.resolvedPath}${clientRelativePath}"
                headers.remove(locationHeaderName)
                headers.add(locationHeaderName, rewrittenURI)
            }
        }
    }

    void failed(IOException e, HttpServerExchange exchange) {

    }
}
