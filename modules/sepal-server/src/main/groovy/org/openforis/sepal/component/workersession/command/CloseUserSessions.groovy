package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.util.annotation.Data

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@Data(callSuper = true)
class CloseUserSessions extends AbstractCommand<Void> {

}

class CloseUserSessionsHandler implements CommandHandler<Void, CloseUserSessions> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager

    CloseUserSessionsHandler(WorkerSessionRepository repository, InstanceManager instanceManager) {
        this.repository = repository
        this.instanceManager = instanceManager
    }

    Void execute(CloseUserSessions command) {
        def sessions = repository.userSessions(command.username, [PENDING, ACTIVE])
        sessions.each { repository.update(it.close()) }
        sessions.each { instanceManager.releaseInstance(it.instance.id) }
        return null
    }
}