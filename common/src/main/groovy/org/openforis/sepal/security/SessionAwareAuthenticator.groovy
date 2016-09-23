package org.openforis.sepal.security

import groovymvc.RequestContext
import groovymvc.security.RequestAuthenticator

class SessionAwareAuthenticator implements RequestAuthenticator {
    private final RequestAuthenticator authenticator

    SessionAwareAuthenticator(RequestAuthenticator authenticator) {
        this.authenticator = authenticator
    }

    void authenticate(RequestContext context, Closure callback) {
        context.with {
            if (currentUser)
                return callback.call(currentUser.username)
            return authenticator.authenticate(context, callback)
        }
    }
}
