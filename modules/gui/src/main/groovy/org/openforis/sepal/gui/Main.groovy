package org.openforis.sepal.gui

import io.undertow.Handlers
import io.undertow.Undertow
import io.undertow.UndertowOptions
import io.undertow.server.handlers.resource.ClassPathResourceManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.xnio.Options

import static io.undertow.Handlers.resource
import static io.undertow.Handlers.rewrite

class Main {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final Undertow server

    Main() {
        def handler = Handlers.path(
                rewrite('path-prefix("/")',
                        '/',
                        getClass().classLoader,
                        resource(new ClassPathResourceManager(getClass().classLoader, 'frontend'))))
        handler.addPrefixPath(
                '/static',
                resource(new ClassPathResourceManager(getClass().classLoader, 'frontend/static'))
        )
        handler.addPrefixPath(
                '/resource',
                resource(new ClassPathResourceManager(getClass().classLoader, 'frontend/resource'))
        )
        def processorCount = Runtime.getRuntime().availableProcessors()
        server = Undertow.builder()
                .addHttpListener(7667, "0.0.0.0")
                .setHandler(handler)
                .setIoThreads(processorCount)
                .setWorkerThreads(processorCount * 32)
                .setSocketOption(Options.WRITE_TIMEOUT, 60 * 1000)
                .setSocketOption(Options.KEEP_ALIVE, true)
                .setServerOption(UndertowOptions.REQUEST_PARSE_TIMEOUT, 60 * 1000)
                .setServerOption(UndertowOptions.NO_REQUEST_TIMEOUT, 60 * 1000)
                .build()
        server.start()
        addShutdownHook { server.stop() }
    }

    static void main(String[] args) {
        try {
            new Main()
        } catch (Exception e) {
            LOG.error('Failed to start Sepal GUI', e)
            System.exit(1)
        }
    }
}
