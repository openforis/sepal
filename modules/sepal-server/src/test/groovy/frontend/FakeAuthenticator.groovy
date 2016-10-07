package frontend

import groovymvc.RequestContext
import groovymvc.security.RequestAuthenticator
import groovymvc.security.UserProvider
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.user.User
import org.openforis.sepal.user.UserRepository


class FakeAuthenticator implements UserRepository, UsernamePasswordVerifier, UserProvider<User>, RequestAuthenticator {
    final users = ['demo': createUser(1, 'demo', 'application_admin')] + (2..22).collectEntries {
        def username = "demo$it"
        [(username): createUser(it, username)]
    }

    private User createUser(long id, String username, String... roles) {
        new User(
                id: id,
                username: username,
                name: "Name",
                email: "$username@test.com",
                organization: "$username Organization",
                status: 'ACTIVE' as User.Status,
                roles: roles.toList().toSet(),
                systemUser: false)
    }

    boolean verify(String username, String password) {
        password == '123'
    }

    User getUserByUsername(String username) {
        users[username]
    }

    User lookup(String username) {
        getUserByUsername(username)
    }

    void eachUsername(Closure closure) {
        users.keySet().each(closure)
    }

    @Override
    void authenticate(RequestContext context, Closure callback) {
        context.with {
            if (verify(params.username as String, params.password as String))
                callback(params.username)
            else
                halt(401)
        }
    }
}
