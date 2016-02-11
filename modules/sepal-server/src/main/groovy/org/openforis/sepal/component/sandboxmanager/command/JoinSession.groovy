package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider.NotAvailable
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.Clock

import static groovymvc.validate.Constraints.min
import static org.openforis.sepal.hostingservice.Status.ACTIVE
import static org.openforis.sepal.hostingservice.Status.STOPPED

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
    private final SessionRepository sessionRepository
    private final WorkerInstanceManager instanceManager
    private final SandboxSessionProvider sandboxProvider
    private final Clock clock

    JoinSessionHandler(SessionRepository sessionRepository,
                       WorkerInstanceManager instanceManager,
                       SandboxSessionProvider sandboxProvider,
                       Clock clock) {
        this.sessionRepository = sessionRepository
        this.instanceManager = instanceManager
        this.sandboxProvider = sandboxProvider
        this.clock = clock
    }

    SandboxSession execute(JoinSession command) {
        def session = sessionRepository.getById(command.sessionId)
        validate(command, session)
        def aliveSession = session.alive(clock.now())
        sessionRepository.alive(aliveSession.id, aliveSession.updateTime)
        return aliveSession
    }

    private void validate(JoinSession command, SandboxSession session) {
        if (session.username != command.username)
            throw new WrongUser("$command.sessionId: Session belongs to user $session.username. $command.username tries to join")
        if (session.status != ACTIVE)
            throw new NotActive("$command.sessionId: session not $ACTIVE but $session.status")
        try {
            sandboxProvider.assertAvailable(session)
        } catch (NotAvailable e) {
            sessionRepository.updateStatusInNewTransaction(session.id, STOPPED)
            throw e
        }
    }

    static class WrongUser extends RuntimeException {
        WrongUser(String message) {
            super(message)
        }
    }

    static class NotActive extends RuntimeException {
        NotActive(String message) {
            super(message)
        }
    }
}