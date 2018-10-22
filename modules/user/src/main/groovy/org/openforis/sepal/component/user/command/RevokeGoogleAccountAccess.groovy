package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.adapter.GoogleAccessTokenFileGateway
import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.component.user.adapter.InvalidToken
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.internal.UserChangeListener
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.user.GoogleTokens
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class RevokeGoogleAccountAccess extends AbstractCommand<Void> {
    GoogleTokens tokens
}

class RevokeGoogleAccountAccessHandler implements CommandHandler<Void, RevokeGoogleAccountAccess> {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final GoogleOAuthClient oAuthClient
    private final UserRepository userRepository
    private final GoogleAccessTokenFileGateway googleAccessTokenFileGateway
    private final MessageQueue<Map> messageQueue

    RevokeGoogleAccountAccessHandler(
        GoogleOAuthClient oAuthClient,
        UserRepository userRepository,
        GoogleAccessTokenFileGateway googleAccessTokenFileGateway,
        MessageBroker messageBroker,
        UserChangeListener changeListener) {
        this.oAuthClient = oAuthClient
        this.userRepository = userRepository
        this.googleAccessTokenFileGateway = googleAccessTokenFileGateway
        this.messageQueue = messageBroker.createMessageQueue('user.revoke_google_access_token', Map) {
            def user = it.user
            try {
                oAuthClient.revokeTokens(user.username, it.tokens)
            } catch (InvalidToken e) {
                LOG.info("Failed to revoke token with Google. user: $user, error: $e.message")
            }
            googleAccessTokenFileGateway.delete(user.username)
            changeListener.changed(user.username, user.toMap())
        }
    }

    Void execute(RevokeGoogleAccountAccess command) {
        userRepository.updateGoogleTokens(command.username, null)
        def user = userRepository.lookupUser(command.username)
        messageQueue.publish(user: user, tokens: command.tokens)
        return null
    }
}