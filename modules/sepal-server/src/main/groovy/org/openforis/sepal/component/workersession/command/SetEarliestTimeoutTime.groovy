package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

class SetEarliestTimeoutTime extends AbstractCommand<Void> {
    String sessionId
    Date time
}

class SetEarliestTimeoutTimeHandler implements CommandHandler<Void, SetEarliestTimeoutTime> {
    private WorkerSessionRepository sessionRepository

    SetEarliestTimeoutTimeHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    Void execute(SetEarliestTimeoutTime command) {
        def session = sessionRepository.getSession(command.sessionId)
        if (command.username && command.username != session.username)
            throw new Unauthorized("Session not owned by user: $session", command)
        sessionRepository.update(session.withEarliestTimeoutTime(command.time))
        return null
    }
}
