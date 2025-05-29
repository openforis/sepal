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
import org.openforis.sepal.util.Clock
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
    private final Clock clock

    InviteUserHandler(
            UserRepository userRepository,
            MessageBroker messageBroker,
            ExternalUserDataGateway externalUserDataGateway,
            EmailGateway emailGateway,
            UserChangeListener changeListener,
            Clock clock
    ) {
        this.userRepository = userRepository
        this.externalUserDataGateway = externalUserDataGateway
        this.emailGateway = emailGateway
        this.messageQueue = messageBroker.createMessageQueue('user.invite_user', Map) {
            createExternalUserAndSendEmailNotification(it)
            def user = it.user
            changeListener.changed(user.username, user.toMap())
        }
        this.clock = clock
    }

    User execute(InviteUser command) {
        def token = UUID.randomUUID() as String
        def sanitizedUsername = command.invitedUsername?.toLowerCase()
        def now = clock.now()
        def userToInsert = new User(
                name: command.name,
                username: sanitizedUsername,
                email: command.email,
                organization: command.organization,
                emailNotificationsEnabled: true,
                manualMapRenderingEnabled: false,
                status: PENDING,
                roles: [].toSet(),
                creationTime: now,
                updateTime: now)
        def user = userRepository.insertUser(userToInsert, token)
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
