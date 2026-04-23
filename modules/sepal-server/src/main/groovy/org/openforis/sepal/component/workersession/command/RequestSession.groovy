package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.ApiKeyGenerator
import org.openforis.sepal.component.workersession.api.BudgetManager
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.util.Clock

import static org.openforis.sepal.workertype.WorkerTypes.SANDBOX

@EqualsAndHashCode(callSuper = true)
@Canonical
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
    private final ApiKeyGenerator apiKeyGenerator

    RequestSessionHandler(
        WorkerSessionRepository repository,
        BudgetManager budgetManager,
        InstanceManager instanceManager,
        Clock clock,
        ApiKeyGenerator apiKeyGenerator) {
        this.repository = repository
        this.budgetManager = budgetManager
        this.instanceManager = instanceManager
        this.clock = clock
        this.apiKeyGenerator = apiKeyGenerator
    }

    WorkerSession execute(RequestSession command) {
        budgetManager.check(command.username)
        def sanitizedUsername = command.username?.toLowerCase()
        def now = clock.now()
        def apiKey = command.workerType == SANDBOX ? apiKeyGenerator.generate() : null
        def session = new WorkerSession(
            id: UUID.randomUUID().toString(),
            state: WorkerSession.State.PENDING,
            username: sanitizedUsername,
            workerType: command.workerType,
            instanceType: command.instanceType,
            creationTime: now,
            updateTime: now,
            apiKey: apiKey
        )
        def instance = instanceManager.requestInstance(session)
        def requestedSession = session.withInstance(instance)
        repository.insert(requestedSession)
        return requestedSession
    }
}
