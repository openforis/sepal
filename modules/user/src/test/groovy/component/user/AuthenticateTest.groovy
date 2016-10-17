package component.user

class AuthenticateTest extends AbstractUserTest {
    def 'Given valid credentials, when authenticating, user is returned'() {
        def user = activeUserWithPassword('the password')

        when:
        def authenticatedUser = authenticate(testUsername, 'the password')

        then:
        authenticatedUser == user
    }

    def 'Given invalid credentials, when authenticating, null is returned'() {
        activeUserWithPassword('the password')

        when:
        def authenticatedUser = authenticate(testUsername, 'invalid password')

        then:
        authenticatedUser == null
    }

    def 'Given a pending user, when authenticating, null is returned'() {
        inviteUser()

        when:
        def authenticatedUser = authenticate(testUsername, 'the password')

        then:
        authenticatedUser == null
    }

    // TODO: Authenticate LOCKED users
}

