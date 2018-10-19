package org.openforis.sepal.gui

import io.undertow.Handlers
import io.undertow.Undertow
import io.undertow.server.handlers.resource.ClassPathResourceManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

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
        def processorCount = Runtime.getRuntime().availableProcessors()
        server = Undertow.builder()
                .addHttpListener(7667, "0.0.0.0")
                .setHandler(handler)
                .setIoThreads(processorCount)
                .setWorkerThreads(processorCount * 32)
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
