package component.user

class RequestPasswordResetTest extends AbstractUserTest {
    def 'When requesting password reset, a reset email is sent with a token'() {
        def user = activeUser()
        mailServer.clear()

        when:
        requestPasswordReset(email: user.email)

        then:
        mailServer.emailCount == 1
        mailServer.token
    }
}
