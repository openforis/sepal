package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.api.UsingInvalidToken
import org.openforis.sepal.component.user.internal.TokenManager

@EqualsAndHashCode(callSuper = true)
@Canonical
class ResetPassword extends AbstractCommand<Void> {
    String token
    String password

    @Override
    String toString() {
        return "${getClass().simpleName}(token:$token)"
    }
}

class ResetPasswordHandler implements CommandHandler<Void, ResetPassword> {
    private final TokenManager tokenManager
    private final ExternalUserDataGateway externalUserDataGateway

    ResetPasswordHandler(TokenManager tokenManager, ExternalUserDataGateway externalUserDataGateway) {
        this.tokenManager = tokenManager
        this.externalUserDataGateway = externalUserDataGateway
    }

    Void execute(ResetPassword command) {
        def tokenStatus = tokenManager.validate(command.token)
        if (!tokenStatus || tokenStatus.expired)
            throw new UsingInvalidToken(command.token, tokenStatus)
        externalUserDataGateway.changePassword(tokenStatus.user.username, command.password)
        tokenManager.invalidate(command.token)
        return null
    }
}

