package fake

import groovymvc.security.UserProvider
import org.openforis.sepal.user.User
import org.openforis.sepal.user.UserRepository

class FakeUserRepository implements UserRepository, UserProvider<User> {
    private boolean containsUser = true
    private final Set<String> roles = new HashSet<>()

    User getUserByUsername(String username) { new User(username: username, roles: roles) }

    User lookup(String username) { new User(username: username, roles: roles) }

    boolean contains(String username) {
        return containsUser
    }

    void doesNotContainUser() {
        containsUser = false;
    }

    void eachUsername(Closure closure) {

    }

    def addRole(String role) {
        roles << role
    }

    def noRole() {
        roles.clear()
    }
}
