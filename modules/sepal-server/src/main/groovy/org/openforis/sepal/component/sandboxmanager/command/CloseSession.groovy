package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionManager

@ToString
class CloseSession extends AbstractCommand<Void> {
    long sessionId
}

@ToString
class CloseSessionHandler implements CommandHandler<Void, CloseSession> {
    private final SessionManager sessionManager

    CloseSessionHandler(SessionManager sessionManager) {
        this.sessionManager = sessionManager
    }

    Void execute(CloseSession command) {
        def session = sessionManager.load(command.sessionId)
        assertSessionOwner(session, command.username)
        sessionManager.close(session)
        return null
    }

    private void assertSessionOwner(SandboxSession session, String username) {
        if (session.username != username)
            throw new BadRequest("$session.id: Session belongs to user $session.username. $username tries to join")
    }

    static class BadRequest extends RuntimeException {
        BadRequest(String message) {
            super(message)
        }
    }
}

