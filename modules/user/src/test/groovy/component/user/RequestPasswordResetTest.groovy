package component.user

import org.openforis.sepal.user.User

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
}
