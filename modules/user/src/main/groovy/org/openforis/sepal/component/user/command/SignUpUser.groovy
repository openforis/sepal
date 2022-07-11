package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import groovyx.net.http.HttpResponseException
import groovyx.net.http.RESTClient
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

import static groovyx.net.http.ContentType.JSON
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

    private boolean validateRecaptcha(String token) {
        // reCAPTCHA assessment
        // https://cloud.google.com/recaptcha-enterprise/docs/create-assessment#rest-api

        // requires:
        // - GOOGLE_PROJECT_ID
        // - GOOGLE_RECAPTCHA_API_KEY
        // - GOOGLE_RECAPTCHA_SITE_KEY

        def response = http.post(
                uri: 'https://recaptchaenterprise.googleapis.com',
                path: '/v1/projects/' + GOOGLE_PROJECT_ID + '/assessments',
                contentType: JSON,
                requestContentType: JSON,
                query: [
                        key: GOOGLE_RECAPTCHA_API_KEY
                ],
                body: [
                        event: [
                                token: token,
                                siteKey: GOOGLE_RECAPTCHA_SITE_KEY,
                                expectedAction: 'SIGNUP'
                        ]
                ]
        )
        return response.data 
            && response.data.tokenProperties.valid
            && response.data.event.token == token
            && response.data.event.siteKey == GOOGLE_RECAPTCHA_SITE_KEY
            && response.data.event.expectedAction == 'SIGNUP'
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
