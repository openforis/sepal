package org.openforis.sepal.component.user.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.user.command.ActivateUser
import org.openforis.sepal.component.user.command.Authenticate
import org.openforis.sepal.component.user.command.InviteUser
import org.openforis.sepal.component.user.command.ResetPassword
import org.openforis.sepal.component.user.query.ListUsers
import org.openforis.sepal.endpoint.InvalidRequest
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovy.json.JsonOutput.toJson
import static groovymvc.validate.Constraints.*
import static org.openforis.sepal.security.Roles.ADMIN

class UserEndpoint {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String PASSWORD_REGEX = /[.]{6,100}/
    private final Component component

    UserEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {
            constrain(InviteUser, [
                    invitedUsername: [notBlank(), custom { it ==~ /[a-zA-Z_][a-zA-Z0-9]*/ }, maxLength(30)],
                    name           : [notBlank(), maxLength(1000)],
                    email          : [notBlank(), email()],
                    organization   : [maxLength(1000)]
            ])
            constrain(ActivateUser, [
                    token   : notBlank(),
                    password: custom { it ==~ PASSWORD_REGEX }
            ])
            constrain(ResetPassword, [
                    token   : notBlank(),
                    password: custom { it ==~ PASSWORD_REGEX }
            ])

            post('/authenticate', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                LOG.info('Authenticating user')
                def username = params.required('user', String)
                def password = params.required('password', String)
                def user = component.submit(new Authenticate(username, password))
                if (user) {
                    LOG.info('Authenticated ' + user)
                    send toJson(user)
                } else {
                    LOG.info('Authentication failed: ' + params.user)
                    halt(401)
                }
            }

            get('/current') {
                response.contentType = 'application/json'
                send toJson(currentUser)
            }

            post('/current') {
                response.contentType = 'application/json'
                send toJson(currentUser)
            }

            get('/list', [ADMIN]) {
                response.contentType = 'application/json'
                def users = component.submit(new ListUsers())
                users.removeAll { it.systemUser }
                send toJson(users)
            }

            post('/invite', [ADMIN]) {
                def command = new InviteUser()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                component.submit(command)
            }

            post('/activate') {
                response.contentType = 'application/json'
                def command = new ActivateUser()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def user = component.submit(command)
                send toJson(user)
            }

            post('/password/reset') {
                response.contentType = 'application/json'
                def command = new ResetPassword()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def user = component.submit(command)
                send toJson(user)
            }
        }
    }
}