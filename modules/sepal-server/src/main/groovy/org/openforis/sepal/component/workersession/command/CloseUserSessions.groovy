package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.component.workersession.event.SessionClosed
import org.openforis.sepal.event.EventDispatcher

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
class CloseUserSessions extends AbstractCommand<Void> {

}

class CloseUserSessionsHandler implements CommandHandler<Void, CloseUserSessions> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager
    private final EventDispatcher eventDispatcher

    CloseUserSessionsHandler(
        WorkerSessionRepository repository,
        InstanceManager instanceManager,
        EventDispatcher eventDispatcher) {
        this.repository = repository
        this.instanceManager = instanceManager
        this.eventDispatcher = eventDispatcher
    }

    Void execute(CloseUserSessions command) {
        def sessions = repository.userSessions(command.username, [PENDING, ACTIVE])
        sessions.each { repository.update(it.close()) }
        sessions.each { instanceManager.releaseInstance(it.instance.id) }
        sessions.each { eventDispatcher.publish(new SessionClosed(it.id)) }
        return null
    }
}