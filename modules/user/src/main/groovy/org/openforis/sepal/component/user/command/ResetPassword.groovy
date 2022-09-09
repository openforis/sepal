package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.api.UsingInvalidToken
import org.openforis.sepal.component.user.internal.TokenManager
import org.openforis.sepal.component.user.internal.UserChangeListener
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.user.User
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.user.User.Status.ACTIVE

@EqualsAndHashCode(callSuper = true)
@Canonical
class ResetPassword extends AbstractCommand<User> {
    String token
    String password

    @Override
    String toString() {
        return "${getClass().simpleName}(token:$token)"
    }
}

class ResetPasswordHandler implements CommandHandler<User, ResetPassword> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final TokenManager tokenManager
    private final ExternalUserDataGateway externalUserDataGateway
    private final UserRepository userRepository
    private final MessageQueue<Map> messageQueue

    ResetPasswordHandler(
        TokenManager tokenManager,
        ExternalUserDataGateway externalUserDataGateway,
        UserRepository userRepository,
        MessageBroker messageBroker,
        UserChangeListener changeListener) {
        this.tokenManager = tokenManager
        this.externalUserDataGateway = externalUserDataGateway
        this.userRepository = userRepository
        this.messageQueue = messageBroker.createMessageQueue('user.reset_password', Map) {
            def user = it.user
            if (user.status == User.Status.LOCKED) {
                LOG.info("Ignoring password reset for locked user: " + command)
                return null
            }
            userRepository.updateStatus(user.username, ACTIVE)
            tokenManager.invalidate(it.token)
            externalUserDataGateway.changePassword(user.username, it.password)
            changeListener.changed(user.username, user.toMap())
        }
    }

    User execute(ResetPassword command) {
        def tokenStatus = tokenManager.validate(command.token, true)
        if (!tokenStatus || tokenStatus.expired)
            throw new UsingInvalidToken(command.token, tokenStatus)
        def user = tokenStatus.user.active()
        messageQueue.publish(user: user, password: command.password, token: command.token)
        return user
    }
}

