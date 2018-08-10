package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.adapter.GoogleAccessTokenFileGateway
import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.component.user.adapter.InvalidToken
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.util.annotation.Data
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@Data(callSuper = true)
class RefreshGoogleAccessToken extends AbstractCommand<GoogleTokens> {
    GoogleTokens tokens
}

class RefreshGoogleAccessTokenHandler implements CommandHandler<GoogleTokens, RefreshGoogleAccessToken> {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final GoogleOAuthClient oAuthClient
    private final UserRepository userRepository
    private final GoogleAccessTokenFileGateway googleAccessTokenFileGateway

    RefreshGoogleAccessTokenHandler(
            GoogleOAuthClient oAuthClient,
            UserRepository userRepository,
            GoogleAccessTokenFileGateway googleAccessTokenFileGateway) {
        this.oAuthClient = oAuthClient
        this.userRepository = userRepository
        this.googleAccessTokenFileGateway = googleAccessTokenFileGateway
    }

    GoogleTokens execute(RefreshGoogleAccessToken command) {
        def tokens = command.tokens ?: userRepository.lookupUser(command.username).googleTokens
        if (!tokens || !tokens.shouldBeRefreshed(System.currentTimeMillis())) {
            if (!tokens)
                googleAccessTokenFileGateway.delete(command.username)
            return null
        }

        def refreshedToken = null
        try {
            refreshedToken = oAuthClient.refreshAccessToken(command.username, tokens)
        } catch (InvalidToken e) {
            LOG.info("Invalid refresh token. Sepal credentials will be used. command: $command, error: $e.message")
        }
        userRepository.updateGoogleTokens(command.username, refreshedToken)
        googleAccessTokenFileGateway.save(command.username, refreshedToken?.refreshToken)
        return refreshedToken
    }
}
