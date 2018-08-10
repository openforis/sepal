package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.adapter.GoogleAccessTokenFileGateway
import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.component.user.api.GoogleEarthEngineWhitelistChecker
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.util.annotation.Data
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@Data(callSuper = true)
class AssociateGoogleAccount extends AbstractCommand<GoogleTokens> {
    String authorizationCode
}

class AssociateGoogleAccountHandler implements CommandHandler<GoogleTokens, AssociateGoogleAccount> {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final GoogleOAuthClient oAuthClient
    private final UserRepository userRepository
    private final GoogleEarthEngineWhitelistChecker googleEarthEngineWhitelistChecker
    private final GoogleAccessTokenFileGateway googleAccessTokenFileGateway

    AssociateGoogleAccountHandler(
            GoogleOAuthClient oAuthClient,
            UserRepository userRepository,
            GoogleEarthEngineWhitelistChecker googleEarthEngineWhitelistChecker,
            GoogleAccessTokenFileGateway googleAccessTokenFileGateway) {
        this.oAuthClient = oAuthClient
        this.userRepository = userRepository
        this.googleEarthEngineWhitelistChecker = googleEarthEngineWhitelistChecker
        this.googleAccessTokenFileGateway = googleAccessTokenFileGateway
    }

    GoogleTokens execute(AssociateGoogleAccount command) {
        def tokens = oAuthClient.requestTokens(command.username, command.authorizationCode)
        if (!googleEarthEngineWhitelistChecker.isWhitelisted(command.username, tokens)) {
            LOG.info('User is not whitelisted in Google Earth Engine, using Sepal service-account. command: ' + command)
            tokens = null
        }
        userRepository.updateGoogleTokens(command.username, tokens)
        googleAccessTokenFileGateway.save(command.username, tokens)
        return tokens
    }
}
