package org.openforis.sepal.component.workersession.query

import groovy.transform.Immutable
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class FindSessionById implements Query<WorkerSession> {
    String sessionId
}

class FindSessionByIdHandler implements QueryHandler<WorkerSession, FindSessionById> {
    private final WorkerSessionRepository sessionRepository

    FindSessionByIdHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    WorkerSession execute(FindSessionById query) {
        return sessionRepository.getSession(query.sessionId)
    }
}