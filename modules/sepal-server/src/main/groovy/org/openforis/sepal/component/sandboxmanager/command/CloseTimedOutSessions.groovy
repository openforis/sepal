package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository

@ToString
class CloseTimedOutSessions extends AbstractCommand<Void> {
    Date updatedBefore
}


@ToString
class CloseTimedOutSessionsHandler implements CommandHandler<Void, CloseTimedOutSessions> {
    private final SessionRepository sessionRepository
    private final SandboxSessionProvider sessionProvider

    CloseTimedOutSessionsHandler(SessionRepository sessionRepository,
                                 SandboxSessionProvider sessionProvider) {
        this.sessionRepository = sessionRepository
        this.sessionProvider = sessionProvider
    }

    Void execute(CloseTimedOutSessions command) {
        sessionRepository.stopAllTimedOut(command.updatedBefore) { SandboxSession session ->
            if (session.host)
                sessionProvider.undeploy(session)
        }
        return null
    }
}
