package org.openforis.sepal.component.sandboxmanager.query

import groovy.transform.ToString
import org.openforis.sepal.component.sandboxmanager.PendingSession
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@ToString
class FindSessionsPendingDeployment implements Query<List<PendingSession>> {
    String username
    Date createdBefore
}

@ToString
class FindSessionsPendingDeploymentHandler implements QueryHandler<List<PendingSession>, FindSessionsPendingDeployment> {
    private final SessionRepository sessionRepository

    FindSessionsPendingDeploymentHandler(SessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    List<PendingSession> execute(FindSessionsPendingDeployment query) {
        return sessionRepository.findPendingDeployment(query.username, query.createdBefore)
    }
}
