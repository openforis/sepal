package org.openforis.sepal.component.user

import groovymvc.Controller
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.user.adapter.*
import org.openforis.sepal.component.user.api.EmailGateway
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.api.GoogleEarthEngineWhitelistChecker
import org.openforis.sepal.component.user.command.*
import org.openforis.sepal.component.user.endpoint.UserEndpoint
import org.openforis.sepal.component.user.internal.KafkaPublishingUserChangeListener
import org.openforis.sepal.component.user.internal.TokenManager
import org.openforis.sepal.component.user.internal.UserChangeListener
import org.openforis.sepal.component.user.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.sql.DatabaseConfig
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.EmailServer
import org.openforis.sepal.util.SystemClock

class UserComponent extends DataSourceBackedComponent implements EndpointRegistry {
    public static final String SCHEMA = 'sepal_user'
    private final MessageBroker messageBroker

    static UserComponent create(UsernamePasswordVerifier usernamePasswordVerifier, ServerConfig serverConfig) {
        def connectionManager = SqlConnectionManager.create(DatabaseConfig.fromPropertiesFile(SCHEMA))
        return new UserComponent(
                connectionManager,
                new TerminalBackedExternalUserDataGateway(),
                new SmtpEmailGateway(serverConfig.host, new EmailServer()),
                usernamePasswordVerifier,
                new RmbMessageBroker(connectionManager),
                new AsynchronousEventDispatcher(),
                new RestBackedGoogleOAuthClient(
                        serverConfig.host, serverConfig.googleOAuthClientId, serverConfig.googleOAuthClientSecret),
                new RestGoogleEarthEngineWhitelistChecker(serverConfig.googleEarthEngineEndpoint),
                new GoogleAccessTokenFileGateway(serverConfig.homeDirectory),
                new KafkaPublishingUserChangeListener(),
                new SystemClock())
    }

    UserComponent(
            SqlConnectionManager connectionManager,
            ExternalUserDataGateway externalUserDataGateway,
            EmailGateway emailGateway,
            UsernamePasswordVerifier usernamePasswordVerifier,
            MessageBroker messageBroker,
            HandlerRegistryEventDispatcher eventDispatcher,
            GoogleOAuthClient googleOAuthClient,
            GoogleEarthEngineWhitelistChecker googleEarthEngineWhitelistChecker,
            GoogleAccessTokenFileGateway googleAccessTokenFileGateway,
            UserChangeListener changeListener,
            Clock clock
    ) {
        super(connectionManager, eventDispatcher)
        this.messageBroker = messageBroker
        def userRepository = new JdbcUserRepository(connectionManager)
        def tokenManager = new TokenManager(userRepository, clock)
        command(InviteUser, new InviteUserHandler(userRepository, messageBroker, externalUserDataGateway, emailGateway, changeListener))
        command(ValidateToken, new ValidateTokenHandler(tokenManager))
        command(ActivateUser, new ActivateUserHandler(tokenManager, externalUserDataGateway, userRepository, messageBroker, changeListener))
        command(ResetPassword, new ResetPasswordHandler(tokenManager, externalUserDataGateway))
        command(Authenticate, new AuthenticateHandler(usernamePasswordVerifier, userRepository))
        command(UpdateUserDetails, new UpdateUserDetailsHandler(userRepository, messageBroker, changeListener))
        command(ChangePassword, new ChangePasswordHandler(usernamePasswordVerifier, externalUserDataGateway))
        command(RequestPasswordReset, new RequestPasswordResetHandler(userRepository, emailGateway, messageBroker, clock))
        command(AssociateGoogleAccount, new AssociateGoogleAccountHandler(googleOAuthClient, userRepository, googleEarthEngineWhitelistChecker, googleAccessTokenFileGateway, messageBroker, changeListener))
        command(RefreshGoogleAccessToken, new RefreshGoogleAccessTokenHandler(googleOAuthClient, userRepository, googleAccessTokenFileGateway, messageBroker, changeListener))
        command(RevokeGoogleAccountAccess, new RevokeGoogleAccountAccessHandler(googleOAuthClient, userRepository, googleAccessTokenFileGateway, messageBroker, changeListener))
        command(DeleteUser, new DeleteUserHandler(externalUserDataGateway, userRepository, messageBroker, changeListener))
        query(LoadUser, new LoadUserHandler(userRepository))
        query(ListUsers, new ListUsersHandler(userRepository))
        query(GoogleAccessRequestUrl, new GoogleAccessRequestUrlHandler(googleOAuthClient))
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
