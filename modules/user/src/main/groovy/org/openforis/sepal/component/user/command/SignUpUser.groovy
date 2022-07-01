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
class SignUpUser extends AbstractCommand<User> {
    String username
    String name
    String email
    String organization
    String intendedUse
}

// reCAPTCHA assessment
// https://cloud.google.com/recaptcha-enterprise/docs/create-assessment#java
//
// POST https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${API_KEY}
//
// Request body (json):
//
// {
//     "event": {
//         "token": "${recaptchaToken}",
//         "siteKey": "${RECAPTCHA_KEY}",
//         "expectedAction": "SIGNUP"
//     }
// }
//
// Expected response:
//
// {
//     "tokenProperties": {
//         "valid": true,
//         "hostname": "www.google.com",
//         "action": "homepage",
//         "createTime": "2019-03-28T12:24:17.894Z"
//     },
//     "riskAnalysis": {
//         "score": 0.1,
//         "reasons": ["AUTOMATION"]
//     },
//     "event": {
//         "token": "TOKEN",
//         "siteKey": "KEY",
//         "expectedAction": "USER_ACTION"
//     },
//     "name": "projects/PROJECT_ID//assessments/b6ac310000000000"
// }

class SignUpUserHandler implements CommandHandler<User, SignUpUser> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final UserRepository userRepository
    private final ExternalUserDataGateway externalUserDataGateway
    private final EmailGateway emailGateway
    private final MessageQueue<Map> messageQueue
    private final Clock clock

    SignUpUserHandler(
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
        this.messageQueue = messageBroker.createMessageQueue('user.signup_user', Map) {
            createExternalUserAndSendEmailNotification(it)
            def user = it.user
            changeListener.changed(user.username, user.toMap())
        }
        this.clock = clock
    }

    User execute(SignUpUser command) {
        def token = UUID.randomUUID() as String
        def now = clock.now()
        def userToInsert = new User(
                name: command.name,
                username: command.username,
                email: command.email,
                organization: command.organization,
                intendedUse: command.intendedUse,
                emailNotificationsEnabled: true,
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
