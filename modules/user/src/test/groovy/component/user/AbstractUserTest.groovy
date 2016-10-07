package component.user

import fake.*
import org.openforis.sepal.component.user.UserComponent
import org.openforis.sepal.component.user.adapter.SmtpEmailGateway
import org.openforis.sepal.component.user.command.ActivateUser
import org.openforis.sepal.component.user.command.Authenticate
import org.openforis.sepal.component.user.command.InviteUser
import org.openforis.sepal.component.user.command.ResetPassword
import org.openforis.sepal.component.user.query.ListUsers
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
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
    final clock = new FakeClock()
    final component = new UserComponent(
            connectionManager,
            externalUserDataGateway,
            emailGateway,
            externalUserDataGateway,
            messageBroker,
            eventDispatcher,
            clock
    )

    final testUsername = 'test-user'
    final testName = 'Test Name'
    final testEmail = 'test@email.com'
    final testOrganization = 'Test Organization'

    def cleanup() {
        mailServer.stop()
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

    User activeUser(String password) {
        inviteUser()
        def token = mailServer.invitationToken
        return activateUser(token, password)
    }


    List<User> listUsers() {
        component.submit(new ListUsers())
    }


    private final username(Map args) {
        args.username ?: testUsername
    }
}
