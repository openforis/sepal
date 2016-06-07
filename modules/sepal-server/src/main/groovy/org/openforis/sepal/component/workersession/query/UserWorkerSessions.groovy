package org.openforis.sepal.component.workersession.query

import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class UserWorkerSessions implements Query<List<WorkerSession>> {
    String username
    List<WorkerSession.State> states = []
}

class UserWorkerSessionsHandler implements QueryHandler<List<WorkerSession>, UserWorkerSessions> {
    private final WorkerSessionRepository sessionRepository

    UserWorkerSessionsHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    List<WorkerSession> execute(UserWorkerSessions command) {
        sessionRepository.userSessions(command.username, command.states)
    }
}