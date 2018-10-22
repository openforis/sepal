package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.EmailGateway
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.internal.UserChangeListener
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.user.User
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.user.User.Status.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
class InviteUser extends AbstractCommand<User> {
    String invitedUsername
    String name
    String email
    String organization
}

class InviteUserHandler implements CommandHandler<User, InviteUser> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final UserRepository userRepository
    private final ExternalUserDataGateway externalUserDataGateway
    private final EmailGateway emailGateway
    private final MessageQueue<Map> messageQueue

    InviteUserHandler(
        UserRepository userRepository,
        MessageBroker messageBroker,
        ExternalUserDataGateway externalUserDataGateway,
        EmailGateway emailGateway,
        UserChangeListener changeListener
    ) {
        this.userRepository = userRepository
        this.externalUserDataGateway = externalUserDataGateway
        this.emailGateway = emailGateway
        this.messageQueue = messageBroker.createMessageQueue('user.invite_user', Map) {
            createExternalUserAndSendEmailNotification(it)
            def user = it.user
            changeListener.changed(user.username, user.toMap())
        }
    }

    User execute(InviteUser command) {
        def token = UUID.randomUUID() as String
        def user = userRepository.insertUser(new User(
            name: command.name,
            username: command.invitedUsername,
            email: command.email,
            organization: command.organization,
            status: PENDING,
            roles: [].toSet()), token)
        messageQueue.publish(
            user: user,
            token: token
        )
        return user
    }

    private void createExternalUserAndSendEmailNotification(Map message) {
        try {
            externalUserDataGateway.createUser(message.user.username)
            emailGateway.sendInvite(message.user, message.token)
        } catch (Exception e) {
            LOG.error("User invitation failed", e)
            throw e
        }
    }
}
