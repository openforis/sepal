package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.workersession.api.GoogleOAuthGateway
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class Heartbeat extends AbstractCommand<WorkerSession> {
    String sessionId
}

class HeartbeatHandler implements CommandHandler<WorkerSession, Heartbeat> {
    private final WorkerSessionRepository sessionRepository
    private final GoogleOAuthGateway googleOAuthGateway

    HeartbeatHandler(WorkerSessionRepository sessionRepository, GoogleOAuthGateway googleOAuthGateway) {
        this.sessionRepository = sessionRepository
        this.googleOAuthGateway = googleOAuthGateway
    }

    WorkerSession execute(Heartbeat command) {
        def session = sessionRepository.getSession(command.sessionId)
        if (command.username && command.username != session.username)
            throw new Unauthorized("Session not owned by user: $session", command)
        if (session.active) {
            sessionRepository.update(session)
            googleOAuthGateway.refreshTokens(session.username)
        }
        return session
    }
}
