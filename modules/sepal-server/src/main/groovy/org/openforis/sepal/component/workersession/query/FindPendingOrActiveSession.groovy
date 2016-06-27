package org.openforis.sepal.component.workersession.query

import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.ImmutableData

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@ImmutableData
class FindPendingOrActiveSession implements Query<WorkerSession> {
    String username
    String workerType
    String instanceType
}

class FindPendingOrActiveSessionHandler implements QueryHandler<WorkerSession, FindPendingOrActiveSession> {
    private final WorkerSessionRepository sessionRepository

    FindPendingOrActiveSessionHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    WorkerSession execute(FindPendingOrActiveSession query) {
        def sessions = sessionRepository.userSessions(query.username, [PENDING, ACTIVE], query.workerType, query.instanceType)
        sessions.find { it.active } ?: sessions.find { it.pending }
    }
}
