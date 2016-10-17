package org.openforis.sepal.component.user

import groovymvc.Controller
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.user.adapter.*
import org.openforis.sepal.component.user.api.EmailGateway
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.command.*
import org.openforis.sepal.component.user.endpoint.UserEndpoint
import org.openforis.sepal.component.user.internal.TokenManager
import org.openforis.sepal.component.user.query.ListUsers
import org.openforis.sepal.component.user.query.ListUsersHandler
import org.openforis.sepal.database.DatabaseConfig
import org.openforis.sepal.database.DatabaseMigration
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.EmailServer
import org.openforis.sepal.util.SystemClock

class UserComponent extends DataSourceBackedComponent implements EndpointRegistry {
    private final MessageBroker messageBroker

    static UserComponent create(String sepalHost, String ldapHost) {
        def databaseConfig = new DatabaseConfig()
        new DatabaseMigration(databaseConfig).migrate()
        def connectionManager = new SqlConnectionManager(databaseConfig.createConnectionPool())
        return new UserComponent(
                connectionManager,
                new TerminalBackedExternalUserDataGateway(),
                new SmtpEmailGateway(sepalHost, new EmailServer()),
                new LdapUsernamePasswordVerifier(ldapHost),
                new RmbMessageBroker(connectionManager),
                new AsynchronousEventDispatcher(),
                new SystemClock())
    }

    UserComponent(
            SqlConnectionManager connectionManager,
            ExternalUserDataGateway externalUserDataGateway,
            EmailGateway emailGateway,
            UsernamePasswordVerifier usernamePasswordVerifier,
            MessageBroker messageBroker,
            HandlerRegistryEventDispatcher eventDispatcher,
            Clock clock) {
        super(connectionManager, eventDispatcher)
        this.messageBroker = messageBroker
        def userRepository = new JdbcUserRepository(connectionManager)
        def tokenManager = new TokenManager(userRepository, clock)
        command(InviteUser, new InviteUserHandler(userRepository, messageBroker, externalUserDataGateway, emailGateway))
        command(ValidateToken, new ValidateTokenHandler(tokenManager))
        command(ActivateUser, new ActivateUserHandler(tokenManager, externalUserDataGateway, userRepository))
        command(ResetPassword, new ResetPasswordHandler(tokenManager, externalUserDataGateway))
        command(Authenticate, new AuthenticateHandler(usernamePasswordVerifier, userRepository))
        command(UpdateUserDetails, new UpdateUserDetailsHandler(userRepository))
        command(ChangePassword, new ChangePasswordHandler(usernamePasswordVerifier, externalUserDataGateway))
        command(RequestPasswordReset, new RequestPasswordResetHandler(userRepository, emailGateway, messageBroker, clock))
        query(ListUsers, new ListUsersHandler(userRepository))
    }

    void onStart() {
        messageBroker.start()
    }

    void onStop() {
        messageBroker?.stop()
    }

    void registerEndpointsWith(Controller controller) {
        new UserEndpoint(this).registerWith(controller)
    }
}
