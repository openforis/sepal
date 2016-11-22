package org.openforis.sepal.component.user.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.user.command.*
import org.openforis.sepal.component.user.query.ListUsers
import org.openforis.sepal.endpoint.InvalidRequest
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovy.json.JsonOutput.toJson
import static groovymvc.validate.Constraints.*
import static org.openforis.sepal.security.Roles.ADMIN

class UserEndpoint {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final Component component

    UserEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {
            def usernameConstraints = custom { it ==~ /^[a-zA-Z_][a-zA-Z0-9]{0,29}$/ }
            def nameConstraints = [notBlank(), maxLength(1000)]
            def emailConstraints = [notBlank(), email()]
            def organizationConstraints = [maxLength(1000)]
            def passwordConstraints = custom { it ==~ /^.{6,100}$/ }

            constrain(InviteUser, [
                    invitedUsername: usernameConstraints,
                    name           : nameConstraints,
                    email          : emailConstraints,
                    organization   : organizationConstraints])
            constrain(ActivateUser, [
                    token   : [notNull(), notBlank()],
                    password: passwordConstraints])
            constrain(ResetPassword, [
                    token   : [notNull(), notBlank()],
                    password: passwordConstraints])
            constrain(UpdateUserDetails, [
                    usernameToUpdate: [notNull(), notBlank()],
                    name            : [notNull(), notBlank()],
                    email           : emailConstraints,
                    organization    : organizationConstraints])
            constrain(ChangePassword, [
                    oldPassword: [notNull(), notBlank()],
                    newPassword: passwordConstraints])
            constrain(RequestPasswordReset, [
                    email: emailConstraints])

            post('/authenticate', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                LOG.info('Authenticating user')
                def username = params.required('username', String)
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

            post('/password/reset-request', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def command = new RequestPasswordReset()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username == null
                component.submit(command)
                send toJson([status : 'success',
                             message: 'If there is an account with this email, ' +
                                     'an email with a password reset link will be sent there'])
            }

            post('/validate-token', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def tokenStatus = component.submit(new ValidateToken(token: params.required('token')))
                if (tokenStatus?.valid)
                    send toJson([status: 'success', token: tokenStatus.token, user: tokenStatus.user, message: 'Token is valid'])
                else {
                    def reason = tokenStatus?.expired ? 'expired' : 'invalid'
                    send toJson([status: 'failure', token: tokenStatus.token, reason: reason, message: "Token is $reason"])
                }
            }

            post('/password/reset', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def command = new ResetPassword()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def user = component.submit(command)
                send toJson(user)
            }

            post('/activate', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def command = new ActivateUser()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def user = component.submit(command)
                send toJson(user)
            }


            post('/login') { // Just a nice looking endpoint the frontend can call to trigger authentication
                response.contentType = 'application/json'
                send toJson(currentUser)
            }

            get('/current') {
                response.contentType = 'application/json'
                send toJson(currentUser)
            }

            post('/current/password') {
                response.contentType = 'application/json'
                def command = new ChangePassword()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = currentUser.username
                def success = component.submit(command)
                send toJson(success ?
                        [status: 'success', message: 'Password changed'] :
                        [status: 'failure', message: 'Invalid old password'])
            }


            post('/current/details') {
                response.contentType = 'application/json'
                def command = new UpdateUserDetails()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = currentUser.username
                command.usernameToUpdate = currentUser.username
                def user = component.submit(command)
                send toJson(user)
            }

            post('/details', [ADMIN]) {
                response.contentType = 'application/json'
                def command = new UpdateUserDetails(usernameToUpdate: params.username)
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = currentUser.username
                def user = component.submit(command)
                send toJson(user)
            }

            get('/list', [ADMIN]) {
                response.contentType = 'application/json'
                def users = component.submit(new ListUsers())
                users.removeAll { it.systemUser }
                send toJson(users)
            }

            post('/invite', [ADMIN]) {
                response.contentType = 'application/json'
                def command = new InviteUser()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = currentUser.username
                component.submit(command)
                send toJson([status: 'success', message: 'Invitation sent'])
            }

            post('/delete', [ADMIN]) {
                response.contentType = 'application/json'
                // TODO: Implement...
                send toJson([status: 'success', message: 'User deleted'])
            }
        }
    }
}