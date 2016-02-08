package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository

@ToString
class CloseTimedOutSessions extends AbstractCommand<Void> {
    Date updatedBefore
}


@ToString
class CloseTimedOutSessionsHandler implements CommandHandler<Void, CloseTimedOutSessions> {
    private final SessionRepository sessionRepository
    private final SandboxSessionProvider sandboxes

    CloseTimedOutSessionsHandler(SessionRepository sessionRepository,
                                 SandboxSessionProvider sandboxes) {
        this.sessionRepository = sessionRepository
        this.sandboxes = sandboxes
    }

    Void execute(CloseTimedOutSessions command) {
        sessionRepository.stopAllTimedOut(command.updatedBefore) {
            sandboxes.undeploy(it)
        }
        return null
    }
}
