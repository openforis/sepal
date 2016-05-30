package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.UnauthorizedExecution
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

class CloseSession extends AbstractCommand<Void> {
    String sessionId
}

class CloseSessionHandler implements CommandHandler<Void, CloseSession> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager

    CloseSessionHandler(WorkerSessionRepository repository, InstanceManager instanceManager) {
        this.repository = repository
        this.instanceManager = instanceManager
    }

    Void execute(CloseSession command) {
        def session = repository.getSession(command.sessionId)
        if (session.username != command.username)
            throw new UnauthorizedExecution("Session not owned by user: $session", command)
        repository.update(session.close())
        instanceManager.release(session.instance.id)
        return null
    }
}