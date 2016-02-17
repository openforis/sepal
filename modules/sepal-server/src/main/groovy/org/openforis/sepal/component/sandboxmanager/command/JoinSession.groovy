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
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.*

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
    private final SandboxSessionProvider sessionProvider
    private final Clock clock

    JoinSessionHandler(SessionRepository sessionRepository,
                       WorkerInstanceManager instanceManager,
                       SandboxSessionProvider sessionProvider,
                       Clock clock) {
        this.sessionRepository = sessionRepository
        this.instanceManager = instanceManager
        this.sessionProvider = sessionProvider
        this.clock = clock
    }

    SandboxSession execute(JoinSession command) {
        def session = sessionRepository.getById(command.sessionId)
        validate(command, session)
        def aliveSession = session.alive(clock.now())
        try {
            sessionRepository.alive(aliveSession.id, aliveSession.updateTime)
        } catch (Exception e) {
            closeSession(session)
            throw e
        }
        return aliveSession
    }

    private void validate(JoinSession command, SandboxSession session) {
        if (session.username != command.username)
            throw new WrongUser("$command.sessionId: Session belongs to user $session.username. $command.username tries to join")
        if (![ACTIVE, STARTING].contains(session.status))
            throw new NotActiveOrStarting("$command.sessionId: session not $ACTIVE or $STARTING but $session.status")
        if (!instanceManager.isSessionInstanceAvailable(session.id)) {
            closeSession(session)
            throw new NotAvailable(session.id, "Instance not available for session $session")
        }
        if (session.status == ACTIVE)
            try {
                sessionProvider.assertAvailable(session)
            } catch (NotAvailable e) {
                closeSession(session)
                throw e
            }
    }

    private void closeSession(SandboxSession session) {
        if (session.instanceId)
            instanceManager.deallocate(session.instanceId)
        sessionRepository.close(session)
    }

    static class WrongUser extends RuntimeException {
        WrongUser(String message) {
            super(message)
        }
    }

    static class NotActiveOrStarting extends RuntimeException {
        NotActiveOrStarting(String message) {
            super(message)
        }
    }
}