package org.openforis.sepal

import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import org.openforis.sepal.component.dataprovider.DataProviderComponent
import org.openforis.sepal.component.datasearch.DataSearchComponent
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxwebproxy.SandboxWebProxyComponent
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.security.LdapUsernamePasswordVerifier
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

    static void main(String[] args) {
        try {
            def propertiesLocation = args.length > 0 ? args[0] : "/etc/sepal/sepal.properties"
            def config = new SepalConfiguration(propertiesLocation)

            dataProviderComponent = new DataProviderComponent(config).start()
            dataSearchComponent = new DataSearchComponent(config).start()
            sandboxManagerComponent = new SandboxManagerComponent(config).start()
            sandboxWebProxyComponent = new SandboxWebProxyComponent(config, sandboxManagerComponent).start()

            def pathRestrictions = new PathRestrictions(
                    new JdbcUserRepository(new SqlConnectionManager(config.dataSource)),
                    new BasicRequestAuthenticator(
                            'Sepal',
                            new LdapUsernamePasswordVerifier(config.ldapHost)
                    )
            )
            Endpoints.deploy(
                    config.webAppPort,
                    pathRestrictions,
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
        dataProviderComponent?.stop()
        dataSearchComponent?.stop()
        sandboxManagerComponent?.stop()
        sandboxWebProxyComponent?.stop()
        Endpoints.undeploy()
    }
}
