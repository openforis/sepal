package org.openforis.sepal.security

import groovymvc.Controller
import groovymvc.security.UserProvider
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.user.User

import static groovy.json.JsonOutput.toJson

class AuthenticationEndpoint implements EndpointRegistry {
    private final UserProvider<User> userProvider
    private final UsernamePasswordVerifier usernamePasswordVerifier

    AuthenticationEndpoint(UserProvider<User> userProvider, UsernamePasswordVerifier usernamePasswordVerifier) {
        this.userProvider = userProvider
        this.usernamePasswordVerifier = usernamePasswordVerifier
    }

    void registerEndpointsWith(Controller controller) {
        controller.with {
            post('/login', [NO_AUTHORIZATION]) {
                request.session.removeAttribute(CURRENT_USER_SESSION_ATTRIBUTE)
                if (!usernamePasswordVerifier.verify(params.user as String, params.password as String))
                    halt(401)

                def user = userProvider.lookup(params.user as String)
                request.session.setAttribute(CURRENT_USER_SESSION_ATTRIBUTE, user)
                send toJson(user)
            }

            get('/user') {
                response.contentType = 'application/json'
                send toJson(currentUser)
            }
        }
    }
}
