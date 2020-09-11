package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.NonTransactionalCommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.component.workersession.event.WorkerSessionClosed
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.transaction.TransactionManager

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
class CloseSession extends AbstractCommand<Void> {
    String sessionId
}

class CloseSessionHandler implements NonTransactionalCommandHandler<Void, CloseSession> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager
    private final TransactionManager transactionManager
    private final EventDispatcher eventDispatcher

    CloseSessionHandler(
            WorkerSessionRepository repository,
            InstanceManager instanceManager,
            TransactionManager transactionManager,
            EventDispatcher eventDispatcher) {
        this.repository = repository
        this.instanceManager = instanceManager
        this.transactionManager = transactionManager
        this.eventDispatcher = eventDispatcher
    }

    Void execute(CloseSession command) {
        def session = repository.getSession(command.sessionId)
        if (command.username && command.username != session.username)
            throw new Unauthorized("Session not owned by user: $session", command)
        if (![ACTIVE, PENDING].contains(session.state))
            return null
        transactionManager.withTransaction {
            repository.update(session.close())
        }
        transactionManager.withTransaction {
            instanceManager.releaseInstance(session.instance.id)
        }
        eventDispatcher.publish(new WorkerSessionClosed(session.username, session.id))
        return null
    }
}
