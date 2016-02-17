package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.WorkerInstanceManager

@ToString
class CloseTimedOutSessions extends AbstractCommand<Void> {
    Date updatedBefore
}


@ToString
class CloseTimedOutSessionsHandler implements CommandHandler<Void, CloseTimedOutSessions> {
    private final SessionRepository sessionRepository
    private final SandboxSessionProvider sessionProvider
    private final WorkerInstanceManager workerInstanceManager

    CloseTimedOutSessionsHandler(SessionRepository sessionRepository, SandboxSessionProvider sessionProvider, WorkerInstanceManager workerInstanceManager) {
        this.sessionRepository = sessionRepository
        this.sessionProvider = sessionProvider
        this.workerInstanceManager = workerInstanceManager
    }

    Void execute(CloseTimedOutSessions command) {
        sessionRepository.closeAllTimedOut(command.updatedBefore) { SandboxSession session ->
            if (session.host && workerInstanceManager.isSessionInstanceAvailable(session.id)) {
                sessionProvider.close(session)
                if (session.instanceId)
                    workerInstanceManager.deallocate(session.instanceId)
            }
        }
        return null
    }
}
