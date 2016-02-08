package org.openforis.sepal.component.sandboxmanager.query

import groovy.transform.ToString
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@ToString
class LoadSession implements Query<SandboxSession> {
    String username
    long sessionId

}

@ToString
class LoadSessionHandler implements QueryHandler<SandboxSession, LoadSession> {
    private final SessionRepository sessionRepository

    LoadSessionHandler(SessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    SandboxSession execute(LoadSession query) {
        def session = sessionRepository.getById(query.sessionId)
        if (session.username != query.username)
            throw new WrongUser("$query.sessionId: Session belongs to user $session.username. $query.username tries to load")
        return session
    }

    static class WrongUser extends RuntimeException {
        WrongUser(String message) {
            super(message)
        }
    }
}
