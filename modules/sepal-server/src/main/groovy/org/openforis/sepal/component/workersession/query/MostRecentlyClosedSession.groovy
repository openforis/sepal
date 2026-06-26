package org.openforis.sepal.component.workersession.query

import groovy.transform.Immutable
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class MostRecentlyClosedSession implements Query<Map<String, Date>> {
    String username
}

class MostRecentlyClosedSessionHandler implements QueryHandler<Map<String, Date>, MostRecentlyClosedSession> {
    private final WorkerSessionRepository sessionRepository

    MostRecentlyClosedSessionHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    Map<String, Date> execute(MostRecentlyClosedSession query) {
        def sanitizedUsername = query.username?.toLowerCase()
        return sessionRepository.mostRecentlyClosedSession(sanitizedUsername)
    }
}