package org.openforis.sepal.component.workersession

import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.WorkerInstanceComponent
import org.openforis.sepal.component.workerinstance.command.CloseSessionOnInstance
import org.openforis.sepal.component.workerinstance.command.CloseSessionOnInstanceHandler
import org.openforis.sepal.component.workersession.adapter.BudgetComponentAdapter
import org.openforis.sepal.component.workersession.adapter.InstanceComponentAdapter
import org.openforis.sepal.component.workersession.adapter.JdbcWorkerSessionRepository
import org.openforis.sepal.component.workersession.api.BudgetManager
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.InstanceType
import org.openforis.sepal.component.workersession.command.*
import org.openforis.sepal.component.workersession.endpoint.SandboxSessionEndpoint
import org.openforis.sepal.component.workersession.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import static java.util.concurrent.TimeUnit.MINUTES

class WorkerSessionComponent extends DataSourceBackedComponent implements EndpointRegistry {
    private final Clock clock
    private final List<InstanceType> instanceTypes

    WorkerSessionComponent(
            BudgetComponent budgetComponent,
            WorkerInstanceComponent workerInstanceComponent,
            HostingServiceAdapter hostingServiceAdapter,
            SqlConnectionManager connectionManager) {
        this(
                connectionManager,
                new AsynchronousEventDispatcher(),
                new BudgetComponentAdapter(budgetComponent),
                new InstanceComponentAdapter(hostingServiceAdapter.instanceTypes, workerInstanceComponent),
                hostingServiceAdapter.instanceTypes,
                new SystemClock()
        )
    }

    WorkerSessionComponent(
            SqlConnectionManager connectionManager,
            HandlerRegistryEventDispatcher eventDispatcher,
            BudgetManager budgetManager,
            InstanceManager instanceManager,
            List<InstanceType> instanceTypes,
            Clock clock) {
        super(connectionManager, eventDispatcher)
        this.instanceTypes = instanceTypes
        this.clock = clock
        def sessionRepository = new JdbcWorkerSessionRepository(connectionManager, clock)

        command(RequestSession, new RequestSessionHandler(sessionRepository, budgetManager, instanceManager, clock))
        def closeSessionHandler = new CloseSessionHandler(sessionRepository, instanceManager, eventDispatcher)
        command(CloseSession, closeSessionHandler)
        command(CloseTimedOutSessions, new CloseTimedOutSessionsHandler(sessionRepository, instanceManager, eventDispatcher))
        command(ActivatePendingSessionOnInstance, new ActivatePendingSessionOnInstanceHandler(sessionRepository, eventDispatcher))
        def closeUserSessionsHandler = new CloseUserSessionsHandler(sessionRepository, instanceManager, eventDispatcher)
        command(CloseUserSessions, closeUserSessionsHandler)
        command(CloseSessionOnInstance, new CloseSessionOnInstanceHandler(sessionRepository, closeSessionHandler))
        command(ReleaseUnusedInstances, new ReleaseUnusedInstancesHandler(sessionRepository, instanceManager))
        command(Heartbeat, new HeartbeatHandler(sessionRepository))
        command(CloseSessionsForUsersExceedingBudget,
                new CloseSessionsForUsersExceedingBudgetHandler(budgetManager, closeUserSessionsHandler))

        query(UserWorkerSessions, new UserWorkerSessionsHandler(sessionRepository))
        query(FindSessionById, new FindSessionByIdHandler(sessionRepository))
        query(FindPendingOrActiveSession, new FindPendingOrActiveSessionHandler(sessionRepository))
        query(GenerateUserSessionReport, new GenerateUserSessionReportHandler(sessionRepository, instanceManager, budgetManager))

        instanceManager.onInstanceActivated { submit(new ActivatePendingSessionOnInstance(instance: it)) }
        instanceManager.onFailedToProvisionInstance {
            submit(new CloseSessionOnInstance(it.id))
        }
    }

    void registerEndpointsWith(Controller controller) {
        new SandboxSessionEndpoint(this, clock).registerWith(controller)
    }

    void onStart() {
        schedule(1, MINUTES,
                new CloseTimedOutSessions(),
                new ReleaseUnusedInstances(5, MINUTES)
        )
        schedule(10, MINUTES,
                new CloseSessionsForUsersExceedingBudget()
        )
    }

    List<InstanceType> getInstanceTypes() {
        return instanceTypes
    }

    InstanceType getDefaultInstanceType() {
        return instanceTypes.first()
    }
}
