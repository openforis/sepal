package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.HttpServerExchange


interface UriProvider {
    URI provide(HttpServerExchange exchange)
}
