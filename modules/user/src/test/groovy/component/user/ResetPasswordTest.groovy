package component.user

import org.openforis.sepal.component.user.api.TokenStatus
import org.openforis.sepal.component.user.api.UsingInvalidToken
import org.openforis.sepal.component.user.command.ResetPassword

import static java.util.concurrent.TimeUnit.DAYS

class ResetPasswordTest extends AbstractUserTest {
    def 'When resetting password, password is change on external user data gateway'() {
        def user = inviteUser()
        def token = mailServer.invitationToken
        when:
        resetPassword(token, 'the password')

        then:
        externalUserDataGateway.password(user.username) == 'the password'
    }

    def 'Given an invalid token, when resetting password, exception is thrown'() {
        when:
        resetPassword('invalid-token', 'the password')

        then:
        def e = thrown Exception
        e.cause instanceof UsingInvalidToken
    }

    def 'Given an expired token, when resetting password, exception is thrown'() {
        inviteUser()
        def token = mailServer.invitationToken
        clock.forward(TokenStatus.MAX_AGE_DAYS, DAYS)

        when:
        resetPassword(token, 'the password')

        then:
        def e = thrown Exception
        e.cause instanceof UsingInvalidToken
    }

    def 'When reusing a token to reset password, exception is thrown'() {
        def user = inviteUser()
        def token = mailServer.invitationToken
        resetPassword(token, 'the password')

        when:
        resetPassword(token, 'another password')

        then:
        def e = thrown Exception
        e.cause instanceof UsingInvalidToken
        externalUserDataGateway.password(user.username) == 'the password'
    }
}
