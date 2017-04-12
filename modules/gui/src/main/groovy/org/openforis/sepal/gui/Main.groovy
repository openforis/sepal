package org.openforis.sepal.gui

import io.undertow.Undertow
import io.undertow.server.handlers.resource.ClassPathResourceManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static io.undertow.Handlers.resource

class Main {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final Undertow server

    Main() {
        def resourceHandler = resource(new ClassPathResourceManager(getClass().classLoader, 'dist'))
        server = Undertow.builder()
                .addHttpListener(7667, "0.0.0.0")
                .setHandler(resourceHandler)
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
