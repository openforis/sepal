package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository

@ToString
class CloseSession extends AbstractCommand<Void> {
    long sessionId
}

@ToString
class CloseSessionHandler implements CommandHandler<Void, CloseSession> {
    private final SessionRepository sessionRepository
    private final SandboxSessionProvider sessionManager

    CloseSessionHandler(SessionRepository sessionRepository,
                        SandboxSessionProvider sessionManager) {
        this.sessionRepository = sessionRepository
        this.sessionManager = sessionManager
    }

    Void execute(CloseSession command) {
        def session = sessionRepository.getById(command.sessionId)
        def closedSession = sessionManager.close(session)
        sessionRepository.update(closedSession)
        return null
    }
}

