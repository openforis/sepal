package org.openforis.sepal.apigateway.server

import io.undertow.Undertow
import io.undertow.UndertowOptions
import org.xnio.Options

class ProxyServer {
    private Undertow server
    private final RootHandler handler

    ProxyServer(ProxyConfig config) {
        def sslContext = SslContextFactory.create(config.keyFile, config.certificateFile)
        handler = new RootHandler(config)
        def processorCount = Runtime.getRuntime().availableProcessors()
        server = Undertow.builder()
                .addHttpListener(config.httpPort, '0.0.0.0')
                .addHttpsListener(config.httpsPort, '0.0.0.0', sslContext)
                .setHandler(handler)
                .setIoThreads(processorCount)
                .setWorkerThreads(processorCount * 32)
                .setSocketOption(Options.WRITE_TIMEOUT, 60 * 1000)
                .setServerOption(UndertowOptions.REQUEST_PARSE_TIMEOUT, 60 * 1000)
                .setServerOption(UndertowOptions.NO_REQUEST_TIMEOUT, 60 * 1000)
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
