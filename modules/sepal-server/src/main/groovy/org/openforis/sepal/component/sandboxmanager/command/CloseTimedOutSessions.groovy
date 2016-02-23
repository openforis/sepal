package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SessionManager

@ToString
class CloseTimedOutSessions extends AbstractCommand<Void> {
    Date updatedBefore
}


@ToString
class CloseTimedOutSessionsHandler implements CommandHandler<Void, CloseTimedOutSessions> {
    private final SessionManager sessionManager

    CloseTimedOutSessionsHandler(SessionManager sessionManager) {
        this.sessionManager = sessionManager
    }

    Void execute(CloseTimedOutSessions command) {
        sessionManager.closeTimedOut(command.updatedBefore)
        return null
    }
}
