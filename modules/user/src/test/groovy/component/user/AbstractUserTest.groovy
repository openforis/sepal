package component.user

import fake.*
import groovy.json.JsonSlurper
import org.openforis.sepal.component.user.UserComponent
import org.openforis.sepal.component.user.adapter.GoogleAccessTokenFileGateway
import org.openforis.sepal.component.user.adapter.SmtpEmailGateway
import org.openforis.sepal.component.user.command.*
import org.openforis.sepal.component.user.query.ListUsers
import org.openforis.sepal.component.user.query.LoadUser
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.user.User
import org.openforis.sepal.util.Config
import org.openforis.sepal.util.EmailServer
import spock.lang.Specification

class AbstractUserTest extends Specification {
    final mailServer = new FakeMailServer()
    final database = new Database('sepal_user')
    final connectionManager = new SqlConnectionManager(database.dataSource)
    final externalUserDataGateway = new FakeExternalUserDataGateway()
    final smtpConfig = [
            from    : 'from@sepal.org',
            host    : 'localhost',
            port    : mailServer.port as String,
            username: 'smtp-username',
            password: 'smtp-password'

    ] as Properties
    final emailGateway = new SmtpEmailGateway('localhost', new EmailServer(new Config(smtpConfig)))
    final messageBroker = new FakeMessageBroker()
    final eventDispatcher = new SynchronousEventDispatcher()
    final googleOAuthClient = new FakeGoogleOAuthClient()
    final googleEarthEngineWhitelistChecker = new FakeGoogleEarthEngineWhitelistChecker()
    final changeListener = new FakeUserChangeListener()
    final clock = new FakeClock()
    final homeDirectory = File.createTempDir()
    final component = new UserComponent(
            connectionManager,
            externalUserDataGateway,
            emailGateway,
            externalUserDataGateway,
            messageBroker,
            eventDispatcher,
            googleOAuthClient,
            googleEarthEngineWhitelistChecker,
            new GoogleAccessTokenFileGateway(homeDirectory.absolutePath),
            changeListener,
            clock
    )

    final testUsername = 'test-user'
    final testPassword = 'test-password'
    final testName = 'Test Name'
    final testEmail = 'test@email.com'
    final testOrganization = 'Test Organization'

    def cleanup() {
        mailServer.stop()
        homeDirectory.deleteDir()
    }

    User loadUser(String username) {
        component.submit(
                new LoadUser(username: username)
        )
    }

    User inviteUser(Map args = [:]) {
        component.submit(
                new InviteUser(
                        invitedUsername: username(args),
                        name: args.name ?: testName,
                        email: args.email ?: testEmail,
                        organization: args.testOrganization ?: testOrganization
                ))

    }

    void requestPasswordReset(Map args = [:]) {
        component.submit(
                new RequestPasswordReset(
                        username: username(args),
                        email: args.email ?: testEmail
                ))

    }

    User authenticate(String username, String password) {
        component.submit(new Authenticate(username: username, password: password))
    }

    User activateUser(String token, String password) {
        component.submit(
                new ActivateUser(token: token, password: password)
        )
    }

    void resetPassword(String token, String password) {
        component.submit(
                new ResetPassword(token: token, password: password)
        )
    }

    User activeUser(Map args = [:]) {
        inviteUser(args)
        def token = mailServer.token
        return activateUser(token, args.password ?: testPassword)
    }

    User pendingUser(Map args = [:]) {
        return inviteUser(args)
    }

    User activeUserWithPassword(String password) {
        activeUser(password: password)
    }

    List<User> listUsers() {
        component.submit(new ListUsers())
    }

    GoogleTokens associateGoogleAccount(Map args = [:]) {
        component.submit(new AssociateGoogleAccount(username: args.username ?: testUsername))
    }


    File earthEngineCredentialsFile(String username) {
        new File(new File(homeDirectory, "${username}/.config/earthengine"), 'credentials')
    }

    GoogleTokens googleTokensFromFile(username) {
        def file = earthEngineCredentialsFile(username)
        if (!file.exists())
            return null
        def json = new JsonSlurper().parse(file)
        return new GoogleTokens(
                refreshToken: json.refresh_token,
                accessToken: json.access_token,
                accessTokenExpiryDate: json.access_token_expiry_date
        )
    }

    private final username(Map args) {
        args.username ?: testUsername
    }

}
