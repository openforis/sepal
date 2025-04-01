package org.openforis.sepal

import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.datasearch.DataSearchComponent
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.notification.NotificationComponent
import org.openforis.sepal.component.processingrecipe.ProcessingRecipeComponent
import org.openforis.sepal.component.sandboxwebproxy.SandboxWebProxyComponent
import org.openforis.sepal.component.task.TaskComponent
import org.openforis.sepal.component.task.adapter.HttpWorkerGateway
import org.openforis.sepal.component.workerinstance.WorkerInstanceComponent
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.endpoint.Server
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
                new HttpWorkerGateway(config.sepalUsername, config.sepalPassword, 8080),
                connectionManager
        )
        def dataSearchComponent = start DataSearchComponent.create(processingRecipeComponent, taskComponent, connectionManager)
        start new SandboxWebProxyComponent(config, workerSessionComponent, hostingServiceAdapter)
        def notificationComponent = start NotificationComponent.create()

        def endpoints = new Endpoints(
                PathRestrictionsFactory.create(),
                dataSearchComponent,
                workerSessionComponent,
                budgetComponent,
                taskComponent,
                processingRecipeComponent,
                notificationComponent
        )
        start new Server(config.webAppPort, '/api', endpoints)
        addShutdownHook { stop() }
    }

    private <T extends Lifecycle> T start(T lifecycle) {
        lifecycle.start()
        toStop << lifecycle
        return lifecycle
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
