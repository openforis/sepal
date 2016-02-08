package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.util.Clock

@ToString
class SessionHeartbeatReceived extends AbstractCommand<Void> {
    long sessionId
}


@ToString
class SessionHeartbeatReceivedHandler implements CommandHandler<Void, SessionHeartbeatReceived> {
    private final SessionRepository sessionRepository
    private final Clock clock

    SessionHeartbeatReceivedHandler(SessionRepository sessionRepository, Clock clock) {
        this.sessionRepository = sessionRepository
        this.clock = clock
    }

    Void execute(SessionHeartbeatReceived command) {
        sessionRepository.alive(command.sessionId, clock.now())
        return null
    }
}
