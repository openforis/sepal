package component.user

import org.openforis.sepal.component.user.api.TokenStatus
import org.openforis.sepal.component.user.api.UsingInvalidToken

import static java.util.concurrent.TimeUnit.DAYS
import static org.openforis.sepal.user.User.Status.ACTIVE

class ActivateUserTest extends AbstractUserTest {
    def 'Given a pending user, when activating, user is active, password is set, and change listener is notified'() {
        def user = inviteUser()
        def token = mailServer.token
        when:
        activateUser(token, 'the password')
        def activatedUser = loadUser(user.username)

        then:
        activatedUser.status == ACTIVE
        externalUserDataGateway.password(user.username) == 'the password'
        changeListener.lastChange(user.username) == activatedUser.toMap()
    }

    def 'Given an invalid token, when activating user, exception is thrown'() {
        when:
        activateUser('invalid-token', 'the password')

        then:
        def e = thrown Exception
        e.cause instanceof UsingInvalidToken
    }

    def 'Given an old token, when activating user, user is active and password is set'() {
        def user = inviteUser()
        def token = mailServer.token
        clock.forward(TokenStatus.MAX_AGE_DAYS, DAYS)

        when:
        activateUser(token, 'the password')

        then:
        listUsers().first().status == ACTIVE
        externalUserDataGateway.password(user.username) == 'the password'
    }

    def 'Given an active user, when trying to activate user again, exception is thrown'() {
        def user = inviteUser()
        def token = mailServer.token
        activateUser(token, 'the password')

        when:
        activateUser(token, 'another password')

        then:
        def e = thrown Exception
        e.cause instanceof UsingInvalidToken
        externalUserDataGateway.password(user.username) == 'the password'
    }
}
