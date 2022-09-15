package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.NonTransactionalCommandHandler
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.component.workersession.event.WorkerSessionClosed
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.transaction.TransactionManager

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
class CloseUserSessions extends AbstractCommand<Void> {

}

class CloseUserSessionsHandler implements NonTransactionalCommandHandler<Void, CloseUserSessions> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager
    private final TransactionManager transactionManager
    private final EventDispatcher eventDispatcher

    CloseUserSessionsHandler(
            WorkerSessionRepository repository,
            InstanceManager instanceManager,
            TransactionManager transactionManager,
            EventDispatcher eventDispatcher) {
        this.repository = repository
        this.instanceManager = instanceManager
        this.transactionManager = transactionManager
        this.eventDispatcher = eventDispatcher
    }

    Void execute(CloseUserSessions command) {
        // TODO fix inconsistency
        // username should be the one of the user submitting the command, not the one we want to close sessions for
        def sessions = repository.userSessions(command.username, [PENDING, ACTIVE])
        sessions.each { WorkerSession session ->
            transactionManager.withTransaction {
                repository.update(session.close())
                instanceManager.releaseInstance(session.instance.id)
                eventDispatcher.publish(new WorkerSessionClosed(session.username, session.id))
            }
        }
        return null
    }
}