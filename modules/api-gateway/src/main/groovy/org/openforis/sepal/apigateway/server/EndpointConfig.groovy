package org.openforis.sepal.apigateway.server

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class EndpointConfig {
    boolean https = true
    boolean authenticate = true
    boolean prefix
    boolean rewriteRedirects
    boolean cached
    String path
    URI target
}
