package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.adapter.GoogleAccessTokenFileGateway
import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.util.annotation.Data
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@Data(callSuper = true)
class RevokeGoogleAccountAccess extends AbstractCommand<Void> {
    GoogleTokens tokens
}

class RevokeGoogleAccountAccessHandler implements CommandHandler<Void, RevokeGoogleAccountAccess> {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final GoogleOAuthClient oAuthClient
    private final UserRepository userRepository
    private final GoogleAccessTokenFileGateway googleAccessTokenFileGateway

    RevokeGoogleAccountAccessHandler(
            GoogleOAuthClient oAuthClient,
            UserRepository userRepository,
            GoogleAccessTokenFileGateway googleAccessTokenFileGateway) {
        this.oAuthClient = oAuthClient
        this.userRepository = userRepository
        this.googleAccessTokenFileGateway = googleAccessTokenFileGateway
    }

    Void execute(RevokeGoogleAccountAccess command) {
        try {
            oAuthClient.revokeTokens(command.username, command.tokens)
        } catch (GoogleOAuthClient.InvalidToken e) {
            LOG.info("Invalid token token. Sepal credentials will be used. command: $command, error: $e.message")
        }
        userRepository.updateGoogleTokens(command.username, null)
        googleAccessTokenFileGateway.delete(command.username)
        return null
    }
}