package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.WorkerInstanceProvider

@ToString
class CreateSession extends AbstractCommand<SandboxSession> {
    String instanceType
}

@ToString
class CreateSessionHandler implements CommandHandler<SandboxSession, CreateSession> {
    private final SessionRepository sessionRepository
    private final WorkerInstanceProvider workerInstances
    private final SandboxSessionProvider sessionProvider

    CreateSessionHandler(SessionRepository sessionRepository,
                         WorkerInstanceProvider instanceProvider,
                         SandboxSessionProvider sessionProvider) {
        this.sessionRepository = sessionRepository
        this.workerInstances = instanceProvider
        this.sessionProvider = sessionProvider
    }

    SandboxSession execute(CreateSession command) {
        def pendingSession = sessionRepository.creating(command.username, command.instanceType)
        def instance = workerInstances.allocate(command.instanceType)
        def session = sessionProvider.deploy(pendingSession, instance)
        sessionRepository.deployed(session)
        return session
    }
}