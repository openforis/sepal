package org.openforis.sepal

import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import org.openforis.sepal.component.dataprovider.DataProviderComponent
import org.openforis.sepal.component.datasearch.DataSearchComponent
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxwebproxy.SandboxWebProxyComponent
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.security.AuthenticationEndpoint
import org.openforis.sepal.security.GateOneAuthEndpoint
import org.openforis.sepal.security.LdapUsernamePasswordVerifier
import org.openforis.sepal.security.NonChallengingBasicRequestAuthenticator
import org.openforis.sepal.security.SessionAwareAuthenticator
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.user.JdbcUserRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class Main {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static DataProviderComponent dataProviderComponent
    private static DataSearchComponent dataSearchComponent
    private static SandboxManagerComponent sandboxManagerComponent
    private static SandboxWebProxyComponent sandboxWebProxyComponent
    private static SqlConnectionManager connectionManager

    static void main(String[] args) {
        try {
            def propertiesLocation = args.length > 0 ? args[0] : "/etc/sepal/sepal.properties"
            def config = new SepalConfiguration(propertiesLocation)

            dataProviderComponent = new DataProviderComponent(config).start()
            dataSearchComponent = new DataSearchComponent(config).start()
            sandboxManagerComponent = new SandboxManagerComponent(config).start()
            sandboxWebProxyComponent = new SandboxWebProxyComponent(config, sandboxManagerComponent).start()
            connectionManager = new SqlConnectionManager(config.dataSource)
            def usernamePasswordVerifier = new LdapUsernamePasswordVerifier(config.ldapHost)
            def userProvider = new JdbcUserRepository(connectionManager)
            def pathRestrictions = new PathRestrictions(
                    userProvider,
                    new SessionAwareAuthenticator(new NonChallengingBasicRequestAuthenticator('Sepal', usernamePasswordVerifier))
            )

            def authenticationEndpoint = new AuthenticationEndpoint(userProvider, usernamePasswordVerifier)
            def gateOneAuthEndpoint = new GateOneAuthEndpoint(config.gateOnePublicKey, config.gateOnePrivateKey)
            Endpoints.deploy(
                    config.webAppPort,
                    pathRestrictions,
                    authenticationEndpoint,
                    gateOneAuthEndpoint,
                    dataProviderComponent,
                    dataSearchComponent,
                    sandboxManagerComponent,
            )
            addShutdownHook { stop() }
        } catch (Throwable e) {
            LOG.error("Failed setting up Sepal", e)
            stop()
            System.exit(1)
        }
    }

    private static void stop() {
        Endpoints.undeploy()
        dataProviderComponent?.stop()
        dataSearchComponent?.stop()
        sandboxManagerComponent?.stop()
        sandboxWebProxyComponent?.stop()
        connectionManager.close()
    }
}
