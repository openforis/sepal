package org.openforis.sepal.apigateway.server

import io.undertow.Undertow

class ProxyServer {
    private Undertow server
    private final RootHandler handler

    ProxyServer(ServerConfig config) {
        def sslContext = SslContextFactory.create(config.keyFile, config.certificateFile)
        handler = new RootHandler(config.httpsPort, config.authenticationUrl)
        server = Undertow.builder()
                .addHttpListener(config.httpPort, '0.0.0.0')
                .addHttpsListener(config.httpsPort, '0.0.0.0', sslContext)
                .setHandler(handler)
                .build()

        config.endpointConfigs.each { proxy(it) }
    }

    ProxyServer proxy(EndpointConfig endpointConfig) {
        handler.proxy(endpointConfig)
        return this
    }

    ProxyServer start() {
        server.start()
        return this
    }

    void stop() {
        server?.stop()
    }
}
