package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.GoogleTokens

class AssociateGoogleAccount extends AbstractCommand<GoogleTokens> {
    String authorizationCode
}

class AssociateGoogleAccountHandler implements CommandHandler<GoogleTokens, AssociateGoogleAccount> {
    private final GoogleOAuthClient oAuthClient
    private final UserRepository userRepository

    AssociateGoogleAccountHandler(GoogleOAuthClient oAuthClient, UserRepository userRepository) {
        this.oAuthClient = oAuthClient
        this.userRepository = userRepository
    }

    GoogleTokens execute(AssociateGoogleAccount command) {
        def tokens = oAuthClient.requestTokens(command.authorizationCode)
        userRepository.updateGoogleTokens(command.username, tokens)
        return tokens
    }
}
