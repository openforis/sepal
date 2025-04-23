package org.openforis.sepal.component.user

import groovy.transform.Canonical
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.component.user.adapter.LdapUsernamePasswordVerifier
import org.openforis.sepal.component.user.adapter.TerminalBackedExternalUserDataGateway
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.endpoint.Server
import org.openforis.sepal.security.PathRestrictionsFactory
import org.openforis.sepal.util.Config
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
                createUsernamePasswordVerifier(),
                createExternalUserDataGateway(),
                serverConfig
            )
            def endpoints = new Endpoints(
                PathRestrictionsFactory.create(),
                userComponent
            )
            start new Server(serverConfig.port, endpoints)
            addShutdownHook { stop() }
        } catch (Exception e) {
            LOG.error('Failed to start user module', e)
            System.exit(1)
        }
    }

    UsernamePasswordVerifier createUsernamePasswordVerifier() {
        new LdapUsernamePasswordVerifier()
    }

    ExternalUserDataGateway createExternalUserDataGateway() {
        new TerminalBackedExternalUserDataGateway()
    }

    static void main(String[] args) {
        new Main()
    }

}

@Canonical
class ServerConfig {

    final int port
    final String host
    final String googleOAuthCallbackBaseUrl
    final String googleOAuthClientId
    final String googleOAuthClientSecret
    final String googleEarthEngineEndpoint
    final String googleProjectId
    final String googleRecaptchaApiKey
    final String googleRecaptchaSiteKey
    final float googleRecaptchaMinScore
    final String homeDirectory
    final String rabbitMQHost
    final int rabbitMQPort

    ServerConfig() {
        def c = new Config('user-server.properties')
        port = c.integer('port')
        host = c.host
        googleOAuthCallbackBaseUrl = c.googleOAuthCallbackBaseUrl
        googleOAuthClientId = c.googleOAuthClientId
        googleOAuthClientSecret = c.googleOAuthClientSecret
        googleEarthEngineEndpoint = c.googleEarthEngineEndpoint
        googleProjectId = c.googleProjectId
        googleRecaptchaApiKey = c.googleRecaptchaApiKey
        googleRecaptchaSiteKey = c.googleRecaptchaSiteKey
        googleRecaptchaMinScore = c.floatingPoint('googleRecaptchaMinScore')
        homeDirectory = c.homeDirectory
        rabbitMQHost = c.rabbitMQHost
        rabbitMQPort = c.integer('rabbitMQPort')
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
