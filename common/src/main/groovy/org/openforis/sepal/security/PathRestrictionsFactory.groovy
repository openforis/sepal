package org.openforis.sepal.security

import groovy.json.JsonOutput
import groovy.json.JsonParserType
import groovy.json.JsonSlurper
import groovymvc.RequestContext
import groovymvc.security.PathRestrictions
import groovymvc.security.RequestAuthenticator
import groovymvc.security.UserProvider
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.user.User
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class PathRestrictionsFactory {

    static PathRestrictions create() {
        new PathRestrictions(new UnusedUserProvider(), new AuthHandler())
    }

    private static class UnusedUserProvider implements UserProvider<User> {
        User lookup(String username) {
            throw new UnsupportedOperationException('Users not expected to be looked up')
        }
    }

    private static class AuthHandler implements RequestAuthenticator {
        private static final Logger LOG = LoggerFactory.getLogger(this)

        void authenticate(RequestContext context, Closure callback) {
            context.with {
                def userJson = request.getHeader('sepal-user')
                if (userJson) {
                    def user = createUser(userJson)
                    if (user) {
                        request.session.setAttribute(CURRENT_USER_SESSION_ATTRIBUTE, user)
                        callback.call(user.username)
                        return // Completed
                    }
                }
                send JsonOutput.toJson([message: 'No "sepal-user" header in request'])
                halt(400)
            }
        }

        private User createUser(String userJson) {
            try {
                def u = new JsonSlurper(type: JsonParserType.LAX).parseText(userJson)
                return new User(
                        id: u.id,
                        name: u.name,
                        username: u.username,
                        email: u.email,
                        organization: u.organization,
                        googleTokens: u.googleTokens ? new GoogleTokens(
                                refreshToken: u.googleTokens.refreshToken,
                                accessToken: u.googleTokens.accessToken,
                                accessTokenExpiryDate: u.googleTokens.accessTokenExpiryDate
                        ) : null,
                        status: u.status as User.Status,
                        roles: u.roles?.toSet() ?: new HashSet<>()
                )
            } catch (Exception e) {
                LOG.warn("Failed to create user from request header", e)
                return null
            }
        }
    }
}
