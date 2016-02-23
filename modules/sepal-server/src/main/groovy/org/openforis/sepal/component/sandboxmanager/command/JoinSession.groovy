package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionManager
import org.openforis.sepal.user.UserRepository

import static groovymvc.validate.Constraints.min
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.ACTIVE
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.STARTING

@ToString
class JoinSession extends AbstractCommand<SandboxSession> {
    long sessionId

    static constraints(UserRepository userRepository) {
        AbstractCommand.constraints(userRepository) + [
                sessionId: min(1)
        ]
    }
}

@ToString
class JoinSessionHandler implements CommandHandler<SandboxSession, JoinSession> {
    private final SessionManager sessionManager

    JoinSessionHandler(SessionManager sessionManager) {
        this.sessionManager = sessionManager
    }

    SandboxSession execute(JoinSession command) {
        def session = sessionManager.load(command.sessionId)
        assertSessionOwner(session, command.username)
        assertActiveOrStarting(session)
        sessionManager.alive(session)
    }

    private void assertActiveOrStarting(SandboxSession session) {
        if (![ACTIVE, STARTING].contains(session.status))
            throw new BadRequest("$session.id: session not $ACTIVE or $STARTING but $session.status")
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