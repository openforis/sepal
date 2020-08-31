package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.NonTransactionalCommandHandler
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.transaction.TransactionManager

@EqualsAndHashCode(callSuper = true)
@Canonical
class CloseTimedOutSessions extends AbstractCommand<Void> {

}

class CloseTimedOutSessionsHandler implements NonTransactionalCommandHandler<Void, CloseTimedOutSessions> {
    private final WorkerSessionRepository repository
    private final TransactionManager transactionManager

    CloseTimedOutSessionsHandler(
            WorkerSessionRepository repository,
            TransactionManager transactionManager) {
        this.repository = repository
        this.transactionManager = transactionManager
    }

    Void execute(CloseTimedOutSessions command) {
        repository.timedOutSessions().each {
            transactionManager.withTransaction {
                new CloseSession(sessionId: it.id)
            }
        }
        return null
    }
}
