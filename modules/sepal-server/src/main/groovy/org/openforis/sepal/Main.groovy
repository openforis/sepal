package org.openforis.sepal

import org.openforis.sepal.component.apps.AppsComponent
import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.datasearch.DataSearchComponent
import org.openforis.sepal.component.files.FilesComponent
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.processingrecipe.ProcessingRecipeComponent
import org.openforis.sepal.component.sandboxwebproxy.SandboxWebProxyComponent
import org.openforis.sepal.component.task.TaskComponent
import org.openforis.sepal.component.task.adapter.HttpWorkerGateway
import org.openforis.sepal.component.workerinstance.WorkerInstanceComponent
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.endpoint.Server
import org.openforis.sepal.security.GateOneAuthEndpoint
import org.openforis.sepal.security.PathRestrictionsFactory
import org.openforis.sepal.sql.DatabaseConfig
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.lifecycle.Lifecycle
import org.openforis.sepal.util.lifecycle.Stoppable
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class Main {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final List<Stoppable> toStop = []

    Main() {
        def config = new SepalConfiguration()
        def hostingServiceAdapter = HostingServiceAdapter.Factory.create(config.hostingService)
        def connectionManager = SqlConnectionManager.create(DatabaseConfig.fromPropertiesFile('sdms'))

        def processingRecipeComponent = start ProcessingRecipeComponent.create()
        def workerInstanceComponent = start WorkerInstanceComponent.create(hostingServiceAdapter)
        def budgetComponent = start BudgetComponent.create(hostingServiceAdapter, connectionManager)
        def workerSessionComponent = start WorkerSessionComponent.create(
                budgetComponent,
                workerInstanceComponent,
                hostingServiceAdapter,
                connectionManager
        )
        def taskComponent = start new TaskComponent(
                workerSessionComponent,
                new HttpWorkerGateway(config.sepalUsername, config.sepalPassword, 1026),
                connectionManager
        )
        def dataSearchComponent = start DataSearchComponent.create(processingRecipeComponent, taskComponent, connectionManager)
        start new SandboxWebProxyComponent(config, workerSessionComponent, hostingServiceAdapter)
        def filesComponent = stoppable new FilesComponent(new File(config.userHomesDir))
        def appsComponent = new AppsComponent(config.appsFile)

        def gateOneAuthEndpoint = new GateOneAuthEndpoint(config.gateOnePublicKey, config.gateOnePrivateKey)
        def endpoints = new Endpoints(
                PathRestrictionsFactory.create(),
                gateOneAuthEndpoint,
                dataSearchComponent,
                workerSessionComponent,
                filesComponent,
                taskComponent,
                budgetComponent,
                processingRecipeComponent,
                appsComponent)
        start new Server(config.webAppPort, '/api', endpoints)
        addShutdownHook { stop() }
    }

    private <T extends Lifecycle> T start(T lifecycle) {
        lifecycle.start()
        toStop << lifecycle
        return lifecycle
    }

    private <T extends Stoppable> T stoppable(T stoppable) {
        toStop << stoppable
        return stoppable
    }


    private void stop() {
        toStop.reverse()*.stop()
    }

    static void main(String[] args) {
        try {
            new Main()
        } catch (Exception e) {
            LOG.error('Failed to start Sepal', e)
            System.exit(1)
        }
    }
}
