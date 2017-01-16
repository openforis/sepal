package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.api.UsingInvalidToken
import org.openforis.sepal.component.user.internal.TokenManager
import org.openforis.sepal.user.User
import org.openforis.sepal.util.annotation.Data

import static org.openforis.sepal.user.User.Status.ACTIVE

@Data(callSuper = true)
class ActivateUser extends AbstractCommand<User> {
    String token
    String password
}

class ActivateUserHandler implements CommandHandler<User, ActivateUser> {
    private final TokenManager tokenManager
    private final ExternalUserDataGateway externalUserDataGateway
    private final UserRepository userRepository

    ActivateUserHandler(
            TokenManager tokenManager,
            ExternalUserDataGateway externalUserDataGateway,
            UserRepository userRepository) {
        this.tokenManager = tokenManager
        this.externalUserDataGateway = externalUserDataGateway
        this.userRepository = userRepository
    }

    User execute(ActivateUser command) {
        def tokenStatus = tokenManager.validate(command.token, false)
        if (!tokenStatus || tokenStatus.expired)
            throw new UsingInvalidToken(command.token, tokenStatus)
        def user = tokenStatus.user
        externalUserDataGateway.changePassword(user.username, command.password)
        userRepository.updateStatus(user.username, ACTIVE)
        tokenManager.invalidate(command.token)
        return user.active()
    }
}
