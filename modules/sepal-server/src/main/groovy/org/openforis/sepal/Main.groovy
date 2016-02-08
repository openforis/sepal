package org.openforis.sepal

import org.openforis.sepal.component.dataprovider.DataProviderComponent
import org.openforis.sepal.component.datasearch.DataSearchComponent
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxwebproxy.SandboxWebProxyComponent
import org.openforis.sepal.endpoint.Endpoints

class Main {
    private static DataProviderComponent dataProviderComponent
    private static DataSearchComponent dataSearchComponent
    private static SandboxManagerComponent sandboxManagerComponent
    private static SandboxWebProxyComponent sandboxWebProxyComponent

    static void main(String[] args) {
        def propertiesLocation = args.length > 0 ? args[0] : "/etc/sepal/sepal.properties"
        def config = new SepalConfiguration(propertiesLocation)

        dataProviderComponent = new DataProviderComponent(config).start()
        dataSearchComponent = new DataSearchComponent(config).start()
        sandboxManagerComponent = new SandboxManagerComponent(config).start()
        sandboxWebProxyComponent = new SandboxWebProxyComponent(config, sandboxManagerComponent).start()

        Endpoints.deploy(
                config.webAppPort,
                dataProviderComponent,
                dataSearchComponent,
                sandboxManagerComponent,
        )
        addShutdownHook { stop() }
    }

    private static void stop() {
        dataProviderComponent.stop()
        dataSearchComponent.stop()
        sandboxManagerComponent.stop()
        Endpoints.undeploy()
    }
}
