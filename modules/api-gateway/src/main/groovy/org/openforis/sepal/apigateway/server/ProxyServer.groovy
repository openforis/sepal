package org.openforis.sepal.apigateway.server

import io.undertow.Undertow
import io.undertow.UndertowOptions
import org.xnio.Options

class ProxyServer {
    private Undertow server
    private final RootHandler handler

    ProxyServer(ProxyConfig config) {
        handler = new RootHandler(config)
        def processorCount = Runtime.getRuntime().availableProcessors()
        server = Undertow.builder()
                .addHttpListener(config.httpPort, '0.0.0.0')
                .setHandler(handler)
                .setIoThreads(processorCount)
                .setWorkerThreads(processorCount * 32)
                .setSocketOption(Options.WRITE_TIMEOUT, 60 * 1000)
                .setServerOption(UndertowOptions.REQUEST_PARSE_TIMEOUT, 60 * 1000)
                .setServerOption(UndertowOptions.NO_REQUEST_TIMEOUT, 60 * 1000)
                .build()
    }

    ProxyServer start() {
        server.start()
        return this
    }

    void stop() {
        server?.stop()
    }
}
