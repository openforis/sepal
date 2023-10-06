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
class UpdateGoogleProject extends AbstractCommand<Void> {
    String projectId
    boolean legacyProject
}

class UpdateGoogleProjectHandler implements CommandHandler<Void, UpdateGoogleProject> {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final UserRepository userRepository
    private final GoogleAccessTokenFileGateway googleAccessTokenFileGateway
    private final MessageQueue<Map> messageQueue

    UpdateGoogleProjectHandler(
        UserRepository userRepository,
        GoogleAccessTokenFileGateway googleAccessTokenFileGateway,
        MessageBroker messageBroker,
        UserChangeListener changeListener) {
        this.userRepository = userRepository
        this.googleAccessTokenFileGateway = googleAccessTokenFileGateway
        this.messageQueue = messageBroker.createMessageQueue('user.update_google_project', Map) {
            def user = it.user
            googleAccessTokenFileGateway.save(user.username, it.tokens)
            changeListener.changed(user.username, user.toMap())
        }
    }

    Void execute(UpdateGoogleProject command) {
        def tokens = userRepository.lookupUser(command.username).googleTokens
        if (!tokens)
            return null
        def updatedTokens = new GoogleTokens(
                refreshToken: tokens.refreshToken,
                accessToken: tokens.accessToken,
                accessTokenExpiryDate: tokens.accessTokenExpiryDate,
                projectId: command.projectId,
                legacyProject: command.legacyProject,
        )
        userRepository.updateGoogleTokens(command.username, updatedTokens)
        def user = userRepository.lookupUser(command.username)
        messageQueue.publish(user: user, tokens: updatedTokens)
        return null
    }
}
