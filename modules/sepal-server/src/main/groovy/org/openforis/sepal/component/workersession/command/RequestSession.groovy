package org.openforis.sepal.component.workersession.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.BudgetManager
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class RequestSession extends AbstractCommand<WorkerSession> {
    String workerType
    String instanceType
}

@ToString
class RequestSessionHandler implements CommandHandler<WorkerSession, RequestSession> {
    private final WorkerSessionRepository repository
    private final BudgetManager budgetManager
    private final InstanceManager instanceManager
    private final Clock clock

    RequestSessionHandler(
            WorkerSessionRepository repository,
            BudgetManager budgetManager,
            InstanceManager instanceManager,
            Clock clock) {
        this.repository = repository
        this.budgetManager = budgetManager
        this.instanceManager = instanceManager
        this.clock = clock
    }

    WorkerSession execute(RequestSession command) {
        budgetManager.check(command.username)
        def now = clock.now()
        def session = new WorkerSession(
                id: UUID.randomUUID().toString(),
                state: WorkerSession.State.PENDING,
                username: command.username,
                workerType: command.workerType,
                instanceType: command.instanceType,
                creationTime: now,
                updateTime: now
        )
        def instance = instanceManager.requestInstance(session)
        def requestedSession = session.withInstance(instance)
        repository.insert(requestedSession)
        return requestedSession
    }
}
