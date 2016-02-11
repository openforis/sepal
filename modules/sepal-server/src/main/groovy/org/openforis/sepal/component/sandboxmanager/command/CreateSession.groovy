package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.util.Clock

@ToString
class CreateSession extends AbstractCommand<SandboxSession> {
    String instanceType
}

@ToString
class CreateSessionHandler implements CommandHandler<SandboxSession, CreateSession> {
    private final SessionRepository sessionRepository
    private final WorkerInstanceManager workerInstances
    private final SandboxSessionProvider sessionProvider
    private final Clock clock

    CreateSessionHandler(SessionRepository sessionRepository,
                         WorkerInstanceManager instanceProvider,
                         SandboxSessionProvider sessionProvider,
                         Clock clock) {
        this.sessionRepository = sessionRepository
        this.workerInstances = instanceProvider
        this.sessionProvider = sessionProvider
        this.clock = clock
    }

    SandboxSession execute(CreateSession command) {
        def pendingSession = sessionRepository.creating(command.username, command.instanceType)
        def session = workerInstances.allocate(pendingSession) { WorkerInstance instance ->
            def deployedSession = sessionProvider.deploy(pendingSession, instance)
            return sessionRepository.deployed(deployedSession)
        }
        sessionRepository.update(session)
        return session
        // TODO: Rollback on exception
    }
}