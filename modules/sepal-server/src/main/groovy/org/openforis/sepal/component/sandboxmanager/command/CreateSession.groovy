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
    private final WorkerInstanceManager workerInstanceManager
    private final SandboxSessionProvider sessionProvider
    private final Clock clock

    CreateSessionHandler(SessionRepository sessionRepository,
                         WorkerInstanceManager instanceProvider,
                         SandboxSessionProvider sessionProvider,
                         Clock clock) {
        this.sessionRepository = sessionRepository
        this.workerInstanceManager = instanceProvider
        this.sessionProvider = sessionProvider
        this.clock = clock
    }

    SandboxSession execute(CreateSession command) {
        def pendingSession = sessionRepository.create(command.username, command.instanceType)
        def session = workerInstanceManager.allocate(pendingSession) { WorkerInstance instance ->
            deploySandbox(pendingSession, instance)
        }
        sessionRepository.update(session)
        return session
    }

    private SandboxSession deploySandbox(SandboxSession pendingSession, WorkerInstance instance) {
        try {
            return sessionProvider.deploy(pendingSession, instance)
        } catch (Exception e) {
            deallocateInstance(instance.id)
            throw e
        }
    }

    private void deallocateInstance(String instanceId) {
        if (instanceId)
            workerInstanceManager.deallocate(instanceId)
    }
}