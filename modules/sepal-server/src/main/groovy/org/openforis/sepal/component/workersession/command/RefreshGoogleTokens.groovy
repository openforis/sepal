package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.GoogleOAuthGateway
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

import static org.openforis.sepal.component.task.api.WorkerSession.State.*

class RefreshGoogleTokens extends AbstractCommand<Void> {
}

class RefreshGoogleTokensHandler implements CommandHandler<Void, RefreshGoogleTokens> {
    private final WorkerSessionRepository repository
    private final GoogleOAuthGateway googleOAuthGateway

    RefreshGoogleTokensHandler(WorkerSessionRepository repository, GoogleOAuthGateway googleOAuthGateway) {
        this.repository = repository
        this.googleOAuthGateway = googleOAuthGateway
    }

    Void execute(RefreshGoogleTokens command) {
        def sessions = repository.sessions([PENDING, ACTIVE])
        sessions
            .collect { it.username }
            .toSet() // Refresh once for each user
            .forEach { googleOAuthGateway.refreshTokens(it) }
        return null
    }
}
