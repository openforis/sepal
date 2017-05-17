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

    def 'Given pending user, when password reset, a reset email is sent with a token and user is active'() {
        def user = pendingUser()
        mailServer.clear()

        when:
        requestPasswordReset(email: user.email)

        then:
        mailServer.emailCount == 1
        mailServer.token
        loadUser(user.username).status == User.Status.ACTIVE
    }
}
