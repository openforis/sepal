package org.openforis.sepal.component.workersession.query

import groovy.transform.Immutable
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class MostRecentlyClosedSessionByUser implements Query<Map<String, Date>> {
    String username
}

class MostRecentlyClosedSessionByUserHandler implements QueryHandler<Map<String, Date>, MostRecentlyClosedSessionByUser> {
    private final WorkerSessionRepository sessionRepository

    MostRecentlyClosedSessionByUserHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    Map<String, Date> execute(MostRecentlyClosedSessionByUser query) {
        return sessionRepository.mostRecentlyClosedSessionByUser()
    }
}