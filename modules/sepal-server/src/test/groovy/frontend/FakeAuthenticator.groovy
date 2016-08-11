package frontend

import groovymvc.RequestContext
import groovymvc.security.RequestAuthenticator
import groovymvc.security.UserProvider
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.user.User
import org.openforis.sepal.user.UserRepository


class FakeAuthenticator implements UserRepository, UsernamePasswordVerifier, UserProvider<User>, RequestAuthenticator {
    final users = [
            demo: new User(1, 'demo', "Demo Admin User", 1234, 'demo@test.com', ["admin"].toSet(), "FAO")
            ,demo1: new User(2, 'demo2', "Demo User 1", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo2: new User(3, 'demo3', "Demo User 2", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo3: new User(4, 'demo4', "Demo User 3", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo4: new User(5, 'demo5', "Demo User 4", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo5: new User(6, 'demo6', "Demo User 5", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo6: new User(7, 'demo7', "Demo User 6", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo7: new User(8, 'demo8', "Demo User 7", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo8: new User(9, 'demo9', "Demo User 8", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo9: new User(10, 'demo10', "Demo User 9", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo10: new User(11, 'demo11', "Demo User 10", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo11: new User(12, 'demo12', "Demo User 11", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo12: new User(13, 'demo13', "Demo User 12", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo13: new User(14, 'demo14', "Demo User 13", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo14: new User(15, 'demo15', "Demo User 14", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo15: new User(16, 'demo16', "Demo User 15", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo16: new User(17, 'demo17', "Demo User 16", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo17: new User(18, 'demo18', "Demo User 17", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo18: new User(19, 'demo19', "Demo User 18", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo19: new User(20, 'demo20', "Demo User 19", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo20: new User(21, 'demo21', "Demo User 20", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo21: new User(22, 'demo22', "Demo User 21", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
            ,demo22: new User(23, 'demo23', "Demo User 22", 1234, 'demo@test.com', ["user"].toSet(), "FAO")
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
