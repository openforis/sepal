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

import static org.openforis.sepal.user.User.Status.ACTIVE

@EqualsAndHashCode(callSuper = true)
@Canonical
class ActivateUser extends AbstractCommand<User> {
    String token
    String password

    String toString() {
        "ActivateUser(token:$token)"
    }
}

class ActivateUserHandler implements CommandHandler<User, ActivateUser> {
    private final TokenManager tokenManager
    private final ExternalUserDataGateway externalUserDataGateway
    private final UserRepository userRepository
    private final MessageQueue<Map> messageQueue

    ActivateUserHandler(
        TokenManager tokenManager,
        ExternalUserDataGateway externalUserDataGateway,
        UserRepository userRepository,
        MessageBroker messageBroker,
        UserChangeListener changeListener) {
        this.tokenManager = tokenManager
        this.externalUserDataGateway = externalUserDataGateway
        this.userRepository = userRepository
        this.messageQueue = messageBroker.createMessageQueue('user.activate_user', Map) {
            def user = it.user
            externalUserDataGateway.changePassword(user.username, it.password)
            changeListener.changed(user.username, user.toMap())
        }
    }

    User execute(ActivateUser command) {
        def tokenStatus = tokenManager.validate(command.token, false)
        if (!tokenStatus || tokenStatus.expired)
            throw new UsingInvalidToken(command.token, tokenStatus)
        def user = tokenStatus.user.active()
        userRepository.updateStatus(user.username, ACTIVE)
        tokenManager.invalidate(command.token)
        messageQueue.publish(user: user, password: command.password)
        return user.active()
    }
}
