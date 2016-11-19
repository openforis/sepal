package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class Heartbeat extends AbstractCommand<WorkerSession> {
    String sessionId
}

class HeartbeatHandler implements CommandHandler<WorkerSession, Heartbeat> {
    private final WorkerSessionRepository sessionRepository

    HeartbeatHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    WorkerSession execute(Heartbeat command) {
        def session = sessionRepository.getSession(command.sessionId)
        if (command.username && command.username != session.username)
            throw new Unauthorized("Session not owned by user: $session", command)
        if (session.active)
            sessionRepository.update(session)
        return session
    }
}
