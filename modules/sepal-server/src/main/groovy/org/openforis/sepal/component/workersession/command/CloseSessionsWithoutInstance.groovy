package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.component.workersession.event.SessionClosed
import org.openforis.sepal.event.EventDispatcher

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE

class CloseSessionsWithoutInstance extends AbstractCommand<Void> {
}

class CloseSessionsWithoutInstanceHandler implements CommandHandler<Void, CloseSessionsWithoutInstance> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager
    private final EventDispatcher eventDispatcher

    CloseSessionsWithoutInstanceHandler(
            WorkerSessionRepository repository,
            InstanceManager instanceManager,
            EventDispatcher eventDispatcher) {
        this.repository = repository
        this.instanceManager = instanceManager
        this.eventDispatcher = eventDispatcher
    }

    Void execute(CloseSessionsWithoutInstance command) {
        def sessions = repository.sessions([ACTIVE])
        def sessionsToClose = instanceManager.sessionsWithoutInstance(sessions)
        sessionsToClose.each { repository.update(it.close()) }
        sessionsToClose.each { eventDispatcher.publish(new SessionClosed(it.id)) }
        return null
    }
}
