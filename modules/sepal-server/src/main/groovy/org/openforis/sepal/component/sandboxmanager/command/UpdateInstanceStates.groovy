package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SessionManager

@ToString
class UpdateInstanceStates extends AbstractCommand<Void> {

}

@ToString
class UpdateInstanceStatesHandler implements CommandHandler<Void, UpdateInstanceStates> {
    private final SessionManager sessionManager

    UpdateInstanceStatesHandler(SessionManager sessionManager) {
        this.sessionManager = sessionManager
    }

    Void execute(UpdateInstanceStates command) {
        sessionManager.updateInstanceStates()
        return null
    }
}
