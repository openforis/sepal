package org.openforis.sepal.component.workersession

import groovymvc.Controller
import org.openforis.sepal.component.AbstractComponent
import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.WorkerInstanceComponent
import org.openforis.sepal.component.workersession.adapter.BudgetComponentAdapter
import org.openforis.sepal.component.workersession.adapter.InstanceComponentAdapter
import org.openforis.sepal.component.workersession.adapter.JdbcWorkerSessionRepository
import org.openforis.sepal.component.workersession.api.BudgetManager
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.command.*
import org.openforis.sepal.component.workersession.endpoint.SandboxSessionEndpoint
import org.openforis.sepal.component.workersession.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import javax.sql.DataSource

import static java.util.concurrent.TimeUnit.MINUTES
import static java.util.concurrent.TimeUnit.SECONDS

class WorkerSessionComponent extends AbstractComponent implements EndpointRegistry {
    private final Clock clock

    WorkerSessionComponent(
            BudgetComponent budgetComponent,
            WorkerInstanceComponent workerInstanceComponent,
            HostingServiceAdapter hostingServiceAdapter,
            DataSource dataSource) {
        this(
                dataSource,
                new AsynchronousEventDispatcher(),
                new BudgetComponentAdapter(budgetComponent),
                new InstanceComponentAdapter(hostingServiceAdapter.instanceTypes, workerInstanceComponent),
                new SystemClock()
        )
    }

    WorkerSessionComponent(
            DataSource dataSource,
            HandlerRegistryEventDispatcher eventDispatcher,
            BudgetManager budgetManager,
            InstanceManager instanceManager,
            Clock clock) {
        super(dataSource, eventDispatcher)
        this.clock = clock
        def connectionManager = new SqlConnectionManager(dataSource)
        def sessionRepository = new JdbcWorkerSessionRepository(connectionManager, clock)

        command(RequestSession, new RequestSessionHandler(sessionRepository, budgetManager, instanceManager, clock))
        command(CloseSession, new CloseSessionHandler(sessionRepository, instanceManager, eventDispatcher))
        command(CloseTimedOutSessions, new CloseTimedOutSessionsHandler(sessionRepository, instanceManager, eventDispatcher))
        command(ActivatePendingSessionOnInstance, new ActivatePendingSessionOnInstanceHandler(sessionRepository, eventDispatcher))
        command(CloseUserSessions, new CloseUserSessionsHandler(sessionRepository, instanceManager, eventDispatcher))
        command(ReleaseUnusedInstances, new ReleaseUnusedInstancesHandler(sessionRepository, instanceManager))
        command(Heartbeat, new HeartbeatHandler(sessionRepository))

        query(UserWorkerSessions, new UserWorkerSessionsHandler(sessionRepository))
        query(FindSessionById, new FindSessionByIdHandler(sessionRepository))
        query(FindPendingOrActiveSession, new FindPendingOrActiveSessionHandler(sessionRepository))
        query(GenerateUserSessionReport, new GenerateUserSessionReportHandler(sessionRepository, instanceManager, budgetManager))

        instanceManager.onInstanceActivated { submit(new ActivatePendingSessionOnInstance(instance: it)) }
    }

    void registerEndpointsWith(Controller controller) {
        new SandboxSessionEndpoint(this, clock).registerWith(controller)
    }

    void onStart() {
        schedule(10, SECONDS,
                new CloseTimedOutSessions(),
                new ReleaseUnusedInstances(5, MINUTES)
        )
    }
}
