package fake

import groovymvc.security.User
import groovymvc.security.UserProvider
import org.openforis.sepal.taskexecutor.endpoint.TaskExecutorUser

class FakeUserProvider implements UserProvider<User> {
    private final Set<String> roles = new HashSet<>()

    User lookup(String username) { new TaskExecutorUser(username: username, roles: roles) }

    def addRole(String role) {
        roles << role
    }

    def noRole() {
        roles.clear()
    }
}

