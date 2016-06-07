package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.InvalidCommand
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.util.annotation.Data

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@Data(callSuper = true)
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
        if (command.username && command.username != session.username)
            throw new Unauthorized("Session not owned by user: $session", command)
        if (![ACTIVE, PENDING].contains(session.state))
            throw new InvalidCommand('Only active and pending sessions can be closed', command)
        repository.update(session.close())
        instanceManager.releaseInstance(session.instance.id)
        return null
    }
}