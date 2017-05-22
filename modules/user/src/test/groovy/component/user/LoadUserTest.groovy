package component.user

class LoadUserTest extends AbstractUserTest {
    def 'Given existing user, loading user returns the user'() {
        def user = activeUser()

        expect:
        loadUser(user.username) == user
    }
}

