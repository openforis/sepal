package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
class CloseSessionOnInstance extends AbstractCommand<Void> {
    String instanceId
}

class CloseSessionOnInstanceHandler implements CommandHandler<Void, CloseSessionOnInstance> {
    private final WorkerSessionRepository repository
    private final CloseSessionHandler closeSessionHandler

    CloseSessionOnInstanceHandler(WorkerSessionRepository repository, CloseSessionHandler closeSessionHandler) {
        this.repository = repository
        this.closeSessionHandler = closeSessionHandler
    }

    Void execute(CloseSessionOnInstance command) {
        def session = repository.sessionOnInstance(command.instanceId, [PENDING, ACTIVE])
        if (session)
            closeSessionHandler.execute(new CloseSession(session.id))
        return null
    }
}
