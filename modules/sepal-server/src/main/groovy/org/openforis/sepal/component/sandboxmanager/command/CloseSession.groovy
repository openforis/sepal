package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.WorkerInstanceManager

@ToString
class CloseSession extends AbstractCommand<Void> {
    long sessionId
}

@ToString
class CloseSessionHandler implements CommandHandler<Void, CloseSession> {
    private final SessionRepository sessionRepository
    private final SandboxSessionProvider sessionManager
    private final WorkerInstanceManager workerInstanceManager

    CloseSessionHandler(SessionRepository sessionRepository, SandboxSessionProvider sessionManager, WorkerInstanceManager workerInstanceManager) {
        this.sessionRepository = sessionRepository
        this.sessionManager = sessionManager
        this.workerInstanceManager = workerInstanceManager
    }

    Void execute(CloseSession command) {
        def session = sessionRepository.getById(command.sessionId)
        if (workerInstanceManager.isSessionInstanceAvailable(session.id)) {
            sessionManager.close(session)
            if (session.instanceId)
                workerInstanceManager.deallocate(session.instanceId)
        }
        sessionRepository.close(session)
        return null
    }
}

