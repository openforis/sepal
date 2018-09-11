package org.openforis.sepal.component.user

import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.component.user.adapter.LdapUsernamePasswordVerifier
import org.openforis.sepal.component.user.adapter.TerminalBackedExternalUserDataGateway
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
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
        try {
            def serverConfig = new ServerConfig()
            def userComponent = start UserComponent.create(
                createUsernamePasswordVerifier(serverConfig),
                createExternalUserDataGateway(),
                serverConfig
            )
            def endpoints = new Endpoints(
                    PathRestrictionsFactory.create(),
                    userComponent
            )
            start new Server(serverConfig.port, endpoints)
            addShutdownHook { instance.stop() }
        } catch (Exception e) {
            LOG.error('Failed to start user module', e)
            System.exit(1)
        }
    }

    UsernamePasswordVerifier createUsernamePasswordVerifier(ServerConfig serverConfig) {
        new LdapUsernamePasswordVerifier(serverConfig.ldapHost)
    }

    ExternalUserDataGateway createExternalUserDataGateway() {
        new TerminalBackedExternalUserDataGateway()
    }

    static void main(String[] args) {
        new Main()
    }


}

@Data
class ServerConfig {
    final int port
    final String host
    final String ldapHost
    final String googleOAuthClientId
    final String googleOAuthClientSecret
    final String googleEarthEngineEndpoint
    final String homeDirectory

    ServerConfig() {
        def c = new Config('user-server.properties')
        port = c.integer('port')
        host = c.host
        ldapHost = c.ldapHost
        googleOAuthClientId = c.googleOAuthClientId
        googleOAuthClientSecret = c.googleOAuthClientSecret
        googleEarthEngineEndpoint = c.googleEarthEngineEndpoint
        homeDirectory = c.homeDirectory
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