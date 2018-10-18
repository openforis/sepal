package org.openforis.sepal.apigateway.server

import groovy.transform.Immutable

@Immutable
class EndpointConfig {
    boolean https = true
    boolean authenticate = true
    boolean prefix
    boolean rewriteRedirects
    boolean cached
    boolean noCache
    String path
    URI target
}
