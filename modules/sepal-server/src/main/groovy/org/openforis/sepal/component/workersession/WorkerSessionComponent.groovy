package org.openforis.sepal.component.workersession

import org.openforis.sepal.component.AbstractComponent
import org.openforis.sepal.component.workerinstance.command.SizeIdlePool
import org.openforis.sepal.component.workersession.adapter.JdbcWorkerSessionRepository
import org.openforis.sepal.component.workersession.api.BudgetChecker
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.command.*
import org.openforis.sepal.component.workersession.query.*
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import javax.sql.DataSource

import static java.util.concurrent.TimeUnit.MINUTES
import static java.util.concurrent.TimeUnit.SECONDS

class WorkerSessionComponent extends AbstractComponent {
    WorkerSessionComponent(BudgetChecker budgetChecker, InstanceManager instanceManager, DataSource dataSource) {
        this(
                dataSource,
                new HandlerRegistryEventDispatcher(),
                budgetChecker,
                instanceManager,
                new SystemClock()
        )
    }

    WorkerSessionComponent(
            DataSource dataSource,
            HandlerRegistryEventDispatcher eventDispatcher,
            BudgetChecker budgetChecker,
            InstanceManager instanceManager,
            Clock clock) {
        super(dataSource, eventDispatcher)
        def connectionManager = new SqlConnectionManager(dataSource)
        def sessionRepository = new JdbcWorkerSessionRepository(connectionManager, clock)

        command(RequestSession, new RequestSessionHandler(sessionRepository, budgetChecker, instanceManager, clock))
        command(CloseSession, new CloseSessionHandler(sessionRepository, instanceManager))
        command(CloseTimedOutSessions, new CloseTimedOutSessionsHandler(sessionRepository, instanceManager))
        command(ActivatePendingSessionOnInstance, new ActivatePendingSessionOnInstanceHandler(sessionRepository, eventDispatcher))
        command(CloseUserSessions, new CloseUserSessionsHandler(sessionRepository, instanceManager))
        command(ReleaseUnusedInstances, new ReleaseUnusedInstancesHandler(sessionRepository, instanceManager))
        command(Heartbeat, new HeartbeatHandler(sessionRepository))

        query(UserWorkerSessions, new UserWorkerSessionsHandler(sessionRepository))
        query(FindSessionById, new FindSessionByIdHandler(sessionRepository))
        query(FindPendingOrActiveSession, new FindPendingOrActiveSessionHandler(sessionRepository))

        instanceManager.onInstanceActivated { submit(new ActivatePendingSessionOnInstance(instance: it)) }
    }

    void onStart() {
        schedule(10, SECONDS,
                new CloseTimedOutSessions(),
                new ReleaseUnusedInstances(5, MINUTES),
                new SizeIdlePool()
        )
    }
}
