package org.openforis.sepal.component.user.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.user.command.*
import org.openforis.sepal.component.user.query.EmailNotificationsEnabled
import org.openforis.sepal.component.user.query.GoogleAccessRequestUrl
import org.openforis.sepal.component.user.query.ListUsers
import org.openforis.sepal.component.user.query.LoadUser
import org.openforis.sepal.endpoint.InvalidRequest
import org.openforis.sepal.user.User
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
            def usernameConstraints = [notBlank(), custom { it ==~ /^[a-zA-Z_][a-zA-Z0-9]{0,29}$/ }]
            def nameConstraints = [notBlank(), maxLength(1000)]
            def emailConstraints = [notBlank(), email()]
            def organizationConstraints = [maxLength(1000)]
            def passwordConstraints = [notBlank(), custom { it ==~ /^.{8,100}$/ }]
            def intendedUseConstraints = [notBlank()]
            def recaptchaTokenConstraints = [notBlank()]

            constrain(SignUpUser, [
                    username    : usernameConstraints,
                    name        : nameConstraints,
                    email       : emailConstraints,
                    organization: organizationConstraints,
                    recaptchaToken: recaptchaTokenConstraints
            ])
            constrain(InviteUser, [
                    invitedUsername: usernameConstraints,
                    name           : nameConstraints,
                    email          : emailConstraints,
                    organization   : organizationConstraints
            ])
            constrain(ActivateUser, [
                    token   : [notNull(), notBlank()],
                    password: passwordConstraints
            ])
            constrain(ResetPassword, [
                    token   : [notNull(), notBlank()],
                    password: passwordConstraints
            ])
            constrain(UpdateUserDetails, [
                    usernameToUpdate: [notNull(), notBlank()],
                    name            : [notNull(), notBlank()],
                    email           : emailConstraints,
                    organization    : organizationConstraints,
                    admin           : notNull()
            ])
            constrain(ChangePassword, [
                    oldPassword: [notNull(), notBlank()],
                    newPassword: passwordConstraints
            ])
            constrain(RequestPasswordReset, [
                    email: emailConstraints
            ])
            constrain(LockUser, [
                    usernameToLock  : usernameConstraints
            ])
            constrain(UnlockUser, [
                    usernameToUnlock: usernameConstraints
            ])
            constrain(ValidateUsername, [
                    username: usernameConstraints,
                    recaptchaToken: recaptchaTokenConstraints
            ])
            constrain(ValidateEmail, [
                    email: emailConstraints,
                    recaptchaToken: recaptchaTokenConstraints
            ])

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
                        )
                    )
                    send toJson(userToMap(user))
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

            post('/validate/token', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def tokenStatus = component.submit(new ValidateToken(token: params.required('token')))
                if (tokenStatus?.valid)
                    send toJson([status: 'success', token: tokenStatus.token, user: tokenStatus.user, message: 'Token is valid'])
                else {
                    def reason = tokenStatus?.expired ? 'expired' : 'invalid'
                    send toJson([status: 'failure', token: tokenStatus?.token, reason: reason, message: "Token is $reason"])
                }
            }

            post('/validate/username', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def command = new ValidateUsername()
                def errors = bindAndValidate(command)
                if (errors) {
                    throw new InvalidRequest(errors)
                }
                def valid = component.submit(command)
                send toJson([valid: valid])
            }

            post('/validate/email', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def command = new ValidateEmail()
                def errors = bindAndValidate(command)
                if (errors) {
                    throw new InvalidRequest(errors)
                }
                def valid = component.submit(command)
                send toJson([valid: valid])
            }

            post('/password/reset', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def command = new ResetPassword()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def user = component.submit(command)
                send toJson(userToMap(user))
            }

            post('/activate', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def command = new ActivateUser()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def user = component.submit(command)
                send toJson(userToMap(user))
            }

            post('/signup', [NO_AUTHORIZATION]) {
                response.contentType = 'application/json'
                def command = new SignUpUser()
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def success = component.submit(command)
                send toJson(success ?
                        [status: 'success', message: 'Signup succeeded'] :
                        [status: 'failure', message: 'Signup failed'])
            }

            post('/login') { // Just a nice looking endpoint the frontend can call to trigger authentication
                response.contentType = 'application/json'
                // send toJson(sepalUser)
                def query = new LoadUser(username: sepalUser.username)
                def user = component.submit(query)
                send toJson(userToMap(user))
            }

            get('/current') {
                response.contentType = 'application/json'
                def query = new LoadUser(username: sepalUser.username)
                def user = component.submit(query)
                send toJson(userToMap(user))
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
                // Make sure user cannot update these properties - take them from currently logged in user.
                command.username = sepalUser.username
                command.usernameToUpdate = sepalUser.username
                command.admin = sepalUser.admin
                def user = component.submit(command)
                response.addHeader('sepal-user-updated', 'true')
                send toJson(userToMap(user))
            }

            post('/details', [ADMIN]) {
                response.contentType = 'application/json'
                def command = new UpdateUserDetails(usernameToUpdate: params.username)
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = sepalUser.username
                def user = component.submit(command)
                send toJson(userToMap(user))
            }

            get('/list', [ADMIN]) {
                response.contentType = 'application/json'
                def users = component.submit(new ListUsers())
                users.removeAll { it.systemUser }
                send toJson(users.collect { userToMap(it) })
            }

            get('/email-notifications-enabled/{email}', [ADMIN]) {
                response.contentType = 'application/json'
                def emailNotificationsEnabled = component.submit(
                        new EmailNotificationsEnabled(email: params.required('email', String))
                )
                send toJson([emailNotificationsEnabled: emailNotificationsEnabled])
            }

            post('/invite', [ADMIN]) {
                response.contentType = 'application/json'
                def command = new InviteUser(invitedUsername: params.username?.toLowerCase())
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                command.username = sepalUser.username
                def user = component.submit(command)
                send toJson(userToMap(user))
            }

            post('/lock', [ADMIN]) {
                response.contentType = 'application/json'
                def command = new LockUser(usernameToLock: params.required('username', String).toLowerCase())
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def user = component.submit(command)
                send toJson(userToMap(user))
            }

            post('/unlock', [ADMIN]) {
                response.contentType = 'application/json'
                def command = new UnlockUser(usernameToUnlock: params.required('username', String).toLowerCase())
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def user = component.submit(command)
                send toJson(userToMap(user))
            }

            get('/google/access-request-url') {
                response.contentType = 'application/json'
                def url = component.submit(new GoogleAccessRequestUrl(destinationUrl: params.destinationUrl))
                send toJson([url: url as String])
            }

            get('/google/access-request-callback', [NO_AUTHORIZATION]) {
                // Redirect from within the browser, to make sure SameSite cookies are included.
                response.contentType = 'text/html'
                def url = "/api/user/google/associate-account?${request.queryString}"
                send "<html><head><meta http-equiv=\"refresh\" content=\"0;URL='${url}'\"/></head></html>"
            }

            get('/google/associate-account') {
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
                if (tokens) 
                    send toJson(tokens)
                else
                    response.status = 204
            }

            post('/google/project') {
                def legacyProject = params.legacyProject == 'true'
                component.submit(
                    new UpdateGoogleProject(
                            username: sepalUser.username,
                            projectId: legacyProject ? null : params.projectId,
                            legacyProject: legacyProject,
                    ))
                response.addHeader('sepal-user-updated', 'true')
                response.status = 204
            }
        }
    }

    Map userToMap(User user) {
        [
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                organization: user.organization,
                intendedUse: user.intendedUse,
                googleTokens: user.googleTokens,
                emailNotificationsEnabled: user.emailNotificationsEnabled,
                status: user.status,
                roles: user.roles,
                systemUser: user.systemUser,
                creationTime: user.creationTime,
                updateTime: user.updateTime,
                admin: user.admin
        ]
    }
}
