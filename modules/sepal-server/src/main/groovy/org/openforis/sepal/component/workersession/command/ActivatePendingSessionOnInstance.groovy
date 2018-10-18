package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.component.workersession.event.WorkerSessionActivated
import org.openforis.sepal.event.EventDispatcher

import static org.openforis.sepal.component.task.api.WorkerSession.State.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
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
        def session = sessionRepository.sessionOnInstance(command.instance.id, [PENDING])
        if (!session)
            return null // No pending session

        def activatedSession = session.activate()
        sessionRepository.update(activatedSession)
        eventDispatcher.publish(new WorkerSessionActivated(activatedSession))
        return null
    }
}
