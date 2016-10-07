package org.openforis.sepal.apigateway

import org.openforis.sepal.apigateway.server.ProxyServer
import org.openforis.sepal.apigateway.server.ServerConfig

class Main {
    static void main(String[] args) {
        def server = new ProxyServer(ServerConfig.create())
        addShutdownHook { server.stop() }
        server.start()
    }
}
