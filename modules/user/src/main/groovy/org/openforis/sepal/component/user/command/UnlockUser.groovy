package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.EmailGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.user.User
import org.openforis.sepal.user.User.Status
import org.openforis.sepal.util.Clock
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class UnlockUser extends AbstractCommand<User> {
    String usernameToUnlock
}

class UnlockUserHandler implements CommandHandler<User, UnlockUser> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final UserRepository userRepository
    private final EmailGateway emailGateway
    private final MessageQueue<Map> messageQueue
    private final Clock clock

    UnlockUserHandler(
        UserRepository userRepository,
        EmailGateway emailGateway,
        MessageBroker messageBroker,
        Clock clock
    ) {
        this.userRepository = userRepository
        this.emailGateway = emailGateway
        this.messageQueue = messageBroker.createMessageQueue('user.unlock', Map) {
            sendPasswordResetEmail(it)
        }
        this.clock = clock
    }

    User execute(UnlockUser command) {
        def user = userRepository.lookupUser(command.usernameToUnlock)
        def token = UUID.randomUUID() as String
                
        if (!user) {
            LOG.info("Cannot unlock non-existing user: " + command)
            return null
        }

        if (user.status != Status.LOCKED) {
            LOG.info("Ignoring unlock for already unlocked user: " + user)
            return user
        }

        userRepository.updateStatus(command.usernameToUnlock, Status.PENDING)
        userRepository.updateToken(user.username, token, clock.now())

        def unlockedUser = user.withStatus(Status.PENDING)
        messageQueue.publish(user: unlockedUser)
        return unlockedUser
    }

    private void sendPasswordResetEmail(Map message) {
        def user = message.user as User
        LOG.info("User unlocked: " + user.username)
        try {
            emailGateway.sendMandatoryPasswordReset(user, message.token)
        } catch (Exception e) {
            LOG.error("Could not send password reset email", e)
            throw e
        }
    }
}
