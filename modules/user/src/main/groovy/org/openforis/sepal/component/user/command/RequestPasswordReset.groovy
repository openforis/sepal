package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.EmailGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.annotation.Data
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@Data(callSuper = true)
class RequestPasswordReset extends AbstractCommand<Void> {
    String email
}

class RequestPasswordResetHandler implements CommandHandler<Void, RequestPasswordReset> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final UserRepository userRepository
    private final EmailGateway emailGateway
    private final MessageQueue<Map> messageQueue
    private final Clock clock

    RequestPasswordResetHandler(
            UserRepository userRepository,
            EmailGateway emailGateway,
            MessageBroker messageBroker,
            Clock clock) {
        this.userRepository = userRepository
        this.emailGateway = emailGateway
        this.messageQueue = messageBroker.createMessageQueue('user.send_password_reset_email', Map) {
            sendPasswordResetEmail(it)
        }
        this.clock = clock
    }

    Void execute(RequestPasswordReset command) {
        def token = UUID.randomUUID() as String
        def user = userRepository.findUserByEmail(command.email)
        if (!user) {
            LOG.info("Requesting password reset for non-existing email: " + command)
            return null
        }
        userRepository.updateToken(user.username, token, clock.now())
        messageQueue.publish(
                user: user,
                token: token
        )
        return null
    }

    private void sendPasswordResetEmail(Map message) {
        try {
            emailGateway.sendPasswordReset(message.user, message.token)
        } catch (Exception e) {
            LOG.error("User invitation failed", e)
            throw e
        }
    }
}
