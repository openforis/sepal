package org.openforis.sepal

import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.datasearch.DataSearchComponent
import org.openforis.sepal.component.files.FilesComponent
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.sandboxwebproxy.SandboxWebProxyComponent
import org.openforis.sepal.component.task.TaskComponent
import org.openforis.sepal.component.task.adapter.HttpWorkerGateway
import org.openforis.sepal.component.workerinstance.WorkerInstanceComponent
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.endpoint.ResourceServer
import org.openforis.sepal.security.GateOneAuthEndpoint
import org.openforis.sepal.security.PathRestrictionsFactory
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
        def dataSource = config.dataSource

        def dataSearchComponent = start DataSearchComponent.create(dataSource)
        def workerInstanceComponent = start new WorkerInstanceComponent(hostingServiceAdapter, dataSource)
        def budgetComponent = start BudgetComponent.create(hostingServiceAdapter, dataSource)
        def workerSessionComponent = start new WorkerSessionComponent(
                budgetComponent,
                workerInstanceComponent,
                hostingServiceAdapter,
                dataSource
        )
        def taskComponent = start new TaskComponent(
                workerSessionComponent,
                new HttpWorkerGateway(config.sepalUsername, config.sepalPassword, 1026),
                dataSource
        )
        start new SandboxWebProxyComponent(config, workerSessionComponent, hostingServiceAdapter)
        def filesComponent = stoppable new FilesComponent(new File(config.userHomesDir))

        def gateOneAuthEndpoint = new GateOneAuthEndpoint(config.gateOnePublicKey, config.gateOnePrivateKey)
        def endpoints = new Endpoints(
                PathRestrictionsFactory.create(),
                gateOneAuthEndpoint,
                dataSearchComponent,
                workerSessionComponent,
                filesComponent,
                taskComponent,
                budgetComponent)
        start new ResourceServer(config.webAppPort, '/api', endpoints)
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
