package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.NonTransactionalCommandHandler
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.component.workersession.event.WorkerSessionClosed
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.transaction.TransactionManager

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE

class CloseSessionsWithoutInstance extends AbstractCommand<Void> {
}

class CloseSessionsWithoutInstanceHandler implements NonTransactionalCommandHandler<Void, CloseSessionsWithoutInstance> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager
    private final TransactionManager transactionManager
    private final EventDispatcher eventDispatcher

    CloseSessionsWithoutInstanceHandler(
            WorkerSessionRepository repository,
            InstanceManager instanceManager,
            TransactionManager transactionManager,
            EventDispatcher eventDispatcher) {
        this.repository = repository
        this.instanceManager = instanceManager
        this.transactionManager = transactionManager
        this.eventDispatcher = eventDispatcher
    }

    Void execute(CloseSessionsWithoutInstance command) {
        def sessions = repository.sessions([ACTIVE])
        def sessionsToClose = instanceManager.sessionsWithoutInstance(sessions)
        sessionsToClose.each { WorkerSession session ->
            transactionManager.withTransaction {
                repository.update(session.close())
                eventDispatcher.publish(new WorkerSessionClosed(session.username, session.id))
            }
        }
        return null
    }
}
