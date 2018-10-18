package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.component.workersession.event.SessionClosed
import org.openforis.sepal.event.EventDispatcher

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
class CloseSession extends AbstractCommand<Void> {
    String sessionId
}

class CloseSessionHandler implements CommandHandler<Void, CloseSession> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager
    private final EventDispatcher eventDispatcher

    CloseSessionHandler(
        WorkerSessionRepository repository,
        InstanceManager instanceManager,
        EventDispatcher eventDispatcher) {
        this.repository = repository
        this.instanceManager = instanceManager
        this.eventDispatcher = eventDispatcher
    }

    Void execute(CloseSession command) {
        def session = repository.getSession(command.sessionId)
        if (command.username && command.username != session.username)
            throw new Unauthorized("Session not owned by user: $session", command)
        if (![ACTIVE, PENDING].contains(session.state))
            return null
        repository.update(session.close())
        instanceManager.releaseInstance(session.instance.id)
        eventDispatcher.publish(new SessionClosed(session.id))
        return null
    }
}