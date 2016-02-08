package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.Status

@ToString
class CloseSession extends AbstractCommand<Void> {
    long sessionId
}

@ToString
class CloseSessionHandler implements CommandHandler<Void, CloseSession> {
    private final SessionRepository sessionRepository
    private final SandboxSessionProvider sandboxes

    CloseSessionHandler(SessionRepository sessionRepository,
                        SandboxSessionProvider sandboxes) {
        this.sessionRepository = sessionRepository
        this.sandboxes = sandboxes
    }

    Void execute(CloseSession command) {
        def session = sessionRepository.getById(command.sessionId)
        sandboxes.undeploy(session)
        sessionRepository.updateStatusInNewTransaction(session.id, Status.STOPPED)
        return null
    }
}

