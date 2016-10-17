package org.openforis.sepal.apigateway

import org.openforis.sepal.apigateway.server.ProxyServer
import org.openforis.sepal.apigateway.server.ProxyConfig

class Main {
    static void main(String[] args) {
        def server = new ProxyServer(ProxyConfig.create())
        addShutdownHook { server.stop() }
        server.start()
    }
}
