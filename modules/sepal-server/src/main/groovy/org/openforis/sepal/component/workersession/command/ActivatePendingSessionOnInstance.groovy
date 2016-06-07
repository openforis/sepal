package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.component.workersession.event.WorkerSessionActivated
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class ActivatePendingSessionOnInstance extends AbstractCommand<Void> {
    WorkerInstance instance
}

class ActivatePendingSessionOnInstanceHandler implements CommandHandler<Void, ActivatePendingSessionOnInstance> {
    private final WorkerSessionRepository sessionRepository
    private final EventDispatcher eventDispatcher

    ActivatePendingSessionOnInstanceHandler(WorkerSessionRepository sessionRepository, EventDispatcher eventDispatcher) {
        this.sessionRepository = sessionRepository
        this.eventDispatcher = eventDispatcher
    }

    Void execute(ActivatePendingSessionOnInstance command) {
        def session = sessionRepository.pendingSessionOnInstance(command.instance.id)
        if (!session)
            return null // No pending session

        def activatedSession = session.activate()
        sessionRepository.update(activatedSession)
        eventDispatcher.publish(new WorkerSessionActivated(activatedSession))
        return null
    }
}
