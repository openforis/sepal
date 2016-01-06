package org.openforis.sepal.session.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.session.SepalSessionManager

class SessionAliveCommand extends AbstractCommand<Void> {

    int sessionId

    SessionAliveCommand(int sessionId) {
        this.sessionId = sessionId
    }

}

class SessionAliveCommandHandler implements CommandHandler<Void, SessionAliveCommand> {

    SepalSessionManager sessionManager

    SessionAliveCommandHandler(SepalSessionManager sessionManager) {
        this.sessionManager = sessionManager
    }

    @Override
    Void execute(SessionAliveCommand command) {
        sessionManager.aliveSignal(command.sessionId)
        return null
    }
}
