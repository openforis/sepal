package org.openforis.sepal.component.workersession.query

import org.openforis.sepal.component.workersession.adapter.JdbcWorkerSessionRepository
import org.openforis.sepal.component.workersession.api.BudgetManager
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.UserSessionReport
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.ImmutableData

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@ImmutableData
class GenerateUserSessionReport implements Query<UserSessionReport> {
    String username
    String workerType
}

class GenerateUserSessionReportHandler implements QueryHandler<UserSessionReport, GenerateUserSessionReport> {
    private final JdbcWorkerSessionRepository sessionRepository
    private final InstanceManager instanceManager
    private final BudgetManager budgetManager

    GenerateUserSessionReportHandler(
            JdbcWorkerSessionRepository sessionRepository,
            InstanceManager instanceManager,
            BudgetManager budgetManager) {
        this.sessionRepository = sessionRepository
        this.instanceManager = instanceManager
        this.budgetManager = budgetManager
    }

    UserSessionReport execute(GenerateUserSessionReport query) {
        def sessions = sessionRepository.userSessions(query.username, [PENDING, ACTIVE]).findAll {
            it.workerType == query.workerType
        }
        return new UserSessionReport(
                sessions: sessions,
                instanceTypes: instanceManager.instanceTypes,
                spending: budgetManager.userSpending(query.username)
        )
    }
}
