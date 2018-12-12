package org.openforis.sepal.component.user.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.user.command.*
import org.openforis.sepal.component.user.query.GoogleAccessRequestUrl
import org.openforis.sepal.component.user.query.ListUsers
import org.openforis.sepal.component.user.query.LoadUser
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
            def passwordConstraints = custom { it ==~ /^.{8,100}$/ }

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
                    component.submit(
                            new RefreshGoogleAccessToken(
                                    username: user.username,
                                    tokens: user.googleTokens
                            ))
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
                    send toJson([status: 'failure', token: tokenStatus?.token, reason: reason, message: "Token is $reason"])
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
                send toJson(sepalUser)
            }

            get('/current') {
                response.contentType = 'application/json'
                def query = new LoadUser(username: sepalUser.username)
                def user = component.submit(query)
                send toJson(user)
            }

            post('/current/password') {
                response.contentType = 'application/json'
                def command = new ChangePassword()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = sepalUser.username
                def success = component.submit(command)
                send toJson(success ?
                        [status: 'success', message: 'Password changed'] :
                        [status: 'failure', message: 'Invalid old password'])
            }


            post('/current/details') {
                response.contentType = 'application/json'
                def command = new UpdateUserDetails(usernameToUpdate: sepalUser.username)
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = sepalUser.username
                command.usernameToUpdate = sepalUser.username
                def user = component.submit(command)
                response.addHeader('sepal-user-updated', 'true')
                send toJson(user)
            }

            post('/details', [ADMIN]) {
                response.contentType = 'application/json'
                def command = new UpdateUserDetails(usernameToUpdate: params.username)
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = sepalUser.username
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
                def command = new InviteUser(invitedUsername: params.username)
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = sepalUser.username
                component.submit(command)
                send toJson([status: 'success', message: 'Invitation sent'])
            }

            post('/delete', [ADMIN]) {
                response.contentType = 'application/json'
                def command = new DeleteUser(username: params.required('username', String))
                component.submit(command)
                send toJson([status: 'success', message: 'User deleted'])
            }

            get('/google/access-request-url') {
                response.contentType = 'application/json'
                def url = component.submit(new GoogleAccessRequestUrl(destinationUrl: params.destinationUrl))
                send toJson([url: url as String])
            }

            get('/google/access-request-callback') {
                response.contentType = 'application/json'
                component.submit(
                        new AssociateGoogleAccount(
                                username: sepalUser.username,
                                authorizationCode: params.required('code', String)
                        ))
                response.addHeader('sepal-user-updated', 'true')
                response.sendRedirect(params.required('state', String))
            }

            post('/google/revoke-access') {
                response.contentType = 'application/json'
                if (!sepalUser.googleTokens)
                    return send(toJson([status: 'success', message: 'No tokens to revoke']))
                component.submit(
                        new RevokeGoogleAccountAccess(
                                username: sepalUser.username,
                                tokens: sepalUser.googleTokens
                        ))
                response.addHeader('sepal-user-updated', 'true')
                send toJson([status: 'success', message: 'Access to Google account revoked'])
            }

            post('/google/refresh-access-token') {
                response.contentType = 'application/json'
                def tokens = component.submit(
                        new RefreshGoogleAccessToken(
                                username: sepalUser.username,
                                tokens: sepalUser.googleTokens
                        ))
                response.addHeader('sepal-user-updated', 'true')
                send toJson(tokens)
            }
        }
    }
}
