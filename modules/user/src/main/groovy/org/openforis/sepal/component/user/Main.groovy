package org.openforis.sepal.component.user

import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.endpoint.Server
import org.openforis.sepal.security.PathRestrictionsFactory
import org.openforis.sepal.util.Config
import org.openforis.sepal.util.annotation.Data
import org.openforis.sepal.util.lifecycle.Lifecycle
import org.openforis.sepal.util.lifecycle.Stoppable
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class Main extends AbstractMain {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    Main() {
        def serverConfig = new ServerConfig()
        def userComponent = start UserComponent.create(serverConfig.host, serverConfig.ldapHost)
        def endpoints = new Endpoints(
                PathRestrictionsFactory.create(),
                userComponent
        )
        start new Server(serverConfig.port, endpoints)
    }

    static void main(String[] args) {
        try {
            def instance = new Main()
            addShutdownHook { instance.stop() }
        } catch (Exception e) {
            LOG.error('Failed to start Sepal', e)
            System.exit(1)
        }
    }
}

@Data
class ServerConfig {
    final int port
    final String host
    final String ldapHost

    ServerConfig() {
        def c = new Config('user-server.properties')
        port = c.integer('port')
        host = c.host
        ldapHost = c.ldapHost
    }
}


abstract class AbstractMain {
    private final List<Stoppable> toStop = []

    protected final <T extends Lifecycle> T start(T lifecycle) {
        lifecycle.start()
        toStop << lifecycle
        return lifecycle
    }

    protected final <T extends Stoppable> T stoppable(T stoppable) {
        toStop << stoppable
        return stoppable
    }

    protected final void stop() {
        toStop.reverse()*.stop()
    }
}