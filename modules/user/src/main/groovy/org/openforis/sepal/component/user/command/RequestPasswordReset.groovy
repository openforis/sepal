package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.GoogleRecaptcha
import org.openforis.sepal.component.user.api.EmailGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.internal.TokenManager
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.user.User
import org.openforis.sepal.util.Clock
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.user.User.Status.ACTIVE

@EqualsAndHashCode(callSuper = true)
@Canonical
class RequestPasswordReset extends AbstractCommand<Void> {
    String email
    boolean optional
    String recaptchaToken
}

class RequestPasswordResetHandler implements CommandHandler<Void, RequestPasswordReset> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final TokenManager tokenManager
    private final UserRepository userRepository
    private final EmailGateway emailGateway
    private final MessageQueue<Map> messageQueue
    private final Clock clock
    private final googleRecaptcha

GoogleRecaptcha googleRecaptcha
    RequestPasswordResetHandler(
        TokenManager tokenManager,
        UserRepository userRepository,
        EmailGateway emailGateway,
        MessageBroker messageBroker,
        Clock clock,
        GoogleRecaptcha googleRecaptcha
    ) {
        this.tokenManager = tokenManager
        this.userRepository = userRepository
        this.emailGateway = emailGateway
        this.messageQueue = messageBroker.createMessageQueue('user.send_password_reset_email', Map) {
            sendPasswordResetEmail(it)
        }
        this.clock = clock
        this.googleRecaptcha = googleRecaptcha
    }

    Void execute(RequestPasswordReset command) {
        if (googleRecaptcha.isValid(command.recaptchaToken, 'REQUEST_PASSWORD_RESET')) {
            def user = userRepository.findUserByEmail(command.email)
            def optional = command.optional

            if (!user) {
                LOG.info("Cannot reset password for non-existing email: " + command)
                return null
            
            }
            if (user.status == User.Status.LOCKED) {
                LOG.info("Ignoring password reset request for locked user: " + user)
                return null
            }
            def token = tokenManager.getOrGenerateToken(user.username)
            userRepository.updateToken(user.username, token, clock.now())
            messageQueue.publish(user: user, token: token, optional: optional)
        }
        return null
    }

    private void sendPasswordResetEmail(Map message) {
        try {
            if (message.optional) {
                emailGateway.sendOptionalPasswordReset(message.user, message.token)
            } else {
                emailGateway.sendMandatoryPasswordReset(message.user, message.token)
            }
        } catch (Exception e) {
            LOG.error("Could not send password reset email", e)
            throw e
        }
    }
}
