package fake

import groovymvc.security.User
import groovymvc.security.UserProvider

class FakeUserProvider implements UserProvider<User> {
    private final Set<String> roles = new HashSet<>()

    User lookup(String username) { new org.openforis.sepal.user.User(username: username, roles: roles) }

    def addRole(String role) {
        roles << role
    }

    def noRole() {
        roles.clear()
    }
}

