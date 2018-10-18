package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.adapter.GoogleAccessTokenFileGateway
import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.component.user.api.GoogleEarthEngineWhitelistChecker
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.internal.UserChangeListener
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.user.GoogleTokens
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class AssociateGoogleAccount extends AbstractCommand<GoogleTokens> {
    String authorizationCode
}

class AssociateGoogleAccountHandler implements CommandHandler<GoogleTokens, AssociateGoogleAccount> {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final GoogleOAuthClient oAuthClient
    private final UserRepository userRepository
    private final GoogleEarthEngineWhitelistChecker googleEarthEngineWhitelistChecker
    private final GoogleAccessTokenFileGateway googleAccessTokenFileGateway
    private final MessageQueue<Map> messageQueue

    AssociateGoogleAccountHandler(
        GoogleOAuthClient oAuthClient,
        UserRepository userRepository,
        GoogleEarthEngineWhitelistChecker googleEarthEngineWhitelistChecker,
        GoogleAccessTokenFileGateway googleAccessTokenFileGateway,
        MessageBroker messageBroker,
        UserChangeListener changeListener) {
        this.oAuthClient = oAuthClient
        this.userRepository = userRepository
        this.googleEarthEngineWhitelistChecker = googleEarthEngineWhitelistChecker
        this.googleAccessTokenFileGateway = googleAccessTokenFileGateway
        this.messageQueue = messageBroker.createMessageQueue('user.associate_google_account', Map) {
            def user = it.user
            googleAccessTokenFileGateway.save(user.username, it.tokens)
            changeListener.changed(user.username, user.toMap())
        }
    }

    GoogleTokens execute(AssociateGoogleAccount command) {
        def tokens = oAuthClient.requestTokens(command.username, command.authorizationCode)
        if (!googleEarthEngineWhitelistChecker.isWhitelisted(command.username, tokens)) {
            LOG.info('User is not whitelisted in Google Earth Engine, using Sepal service-account. command: ' + command)
            tokens = null
        }
        userRepository.updateGoogleTokens(command.username, tokens)
        def user = userRepository.lookupUser(command.username)
        messageQueue.publish(user: user, tokens: tokens)
        return tokens
    }
}
