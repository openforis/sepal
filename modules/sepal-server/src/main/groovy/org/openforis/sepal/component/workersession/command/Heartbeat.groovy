package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

class Heartbeat extends AbstractCommand<Void> {
    String sessionId
}

class HeartbeatHandler implements CommandHandler<Void, Heartbeat> {
    private final WorkerSessionRepository sessionRepository

    HeartbeatHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    Void execute(Heartbeat command) {
        def session = sessionRepository.getSession(command.sessionId)
        if (command.username && command.username != session.username)
            throw new Unauthorized("Session not owned by user: $session", command)
        sessionRepository.update(session)
        return null
    }
}
