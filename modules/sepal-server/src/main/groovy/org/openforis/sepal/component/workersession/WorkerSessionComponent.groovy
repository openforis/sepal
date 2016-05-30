package org.openforis.sepal.component.workersession

import org.openforis.sepal.component.AbstractComponent
import org.openforis.sepal.component.workersession.command.CloseUserSessions
import org.openforis.sepal.component.workersession.command.CloseUserSessionsHandler
import org.openforis.sepal.component.workersession.command.ReleaseUnusedInstances
import org.openforis.sepal.component.workersession.command.ReleaseUnusedInstancesHandler
import org.openforis.sepal.component.workersession.adapter.JdbcWorkerSessionRepository
import org.openforis.sepal.component.workersession.api.BudgetChecker
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.command.ActivatePendingSessionOnInstance
import org.openforis.sepal.component.workersession.command.ActivatePendingSessionOnInstanceHandler
import org.openforis.sepal.component.workersession.command.CloseTimedOutSessions
import org.openforis.sepal.component.workersession.command.CloseTimedOutSessionsHandler
import org.openforis.sepal.component.workersession.command.CloseSession
import org.openforis.sepal.component.workersession.command.CloseSessionHandler
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.component.workersession.command.RequestSessionHandler
import org.openforis.sepal.component.workersession.query.UserWorkerSessions
import org.openforis.sepal.component.workersession.query.UserWorkerSessionsHandler
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock

import javax.sql.DataSource

class WorkerSessionComponent extends AbstractComponent {
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

        query(UserWorkerSessions, new UserWorkerSessionsHandler(sessionRepository))

        instanceManager.onInstanceActivated { submit(new ActivatePendingSessionOnInstance(instance: it))}
    }
}
