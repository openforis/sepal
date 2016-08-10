package frontend

import groovymvc.RequestContext
import groovymvc.security.RequestAuthenticator
import groovymvc.security.UserProvider
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.user.User
import org.openforis.sepal.user.UserRepository


class FakeAuthenticator implements UserRepository, UsernamePasswordVerifier, UserProvider<User>, RequestAuthenticator {
    final users = [
            demo: new User(1, 'demo', "Demo User", 1234, 'demo@test.com', ["admin"].toSet(), "FAO")
    ]

    boolean verify(String username, String password) {
        password == '123'
    }

    User getUserByUsername(String username) {
        users[username]
    }

    User lookup(String username) {
        getUserByUsername(username)
    }

    boolean contains(String username) {
        users.containsKey(username)
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
