package component.user

import org.openforis.sepal.user.User
import static java.util.concurrent.TimeUnit.DAYS
import static org.openforis.sepal.component.user.api.TokenStatus.MAX_AGE_DAYS


class RequestPasswordResetTest extends AbstractUserTest {
    def 'Given active user, when requesting password reset, a reset email is sent with a token'() {
        def user = activeUser()
        mailServer.clear()

        when:
        requestPasswordReset(email: user.email)

        then:
        mailServer.emailCount == 1
        mailServer.token
    }

    def 'Given active user with pending password reset, when requesting password reset, a reset email is sent with same as received before token'() {
        def user = activeUser()
        mailServer.clear()
        requestPasswordReset(email: user.email)
        def token = mailServer.token

        when:
        requestPasswordReset(email: user.email)

        then:
        mailServer.emailCount == 2
        mailServer.token == token
    }

    def 'Given active user with epired password reset, when requesting password reset, a reset email is sent with a new token'() {
        def user = activeUser()
        mailServer.clear()
        requestPasswordReset(email: user.email)
        def token = mailServer.token
        clock.forward(MAX_AGE_DAYS + 1, DAYS)

        when:
        requestPasswordReset(email: user.email)

        then:
        mailServer.emailCount == 2
        mailServer.token != token
    }
}
