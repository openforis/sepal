package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.TokenStatus
import org.openforis.sepal.component.user.internal.TokenManager

@EqualsAndHashCode(callSuper = true)
@Canonical
class ValidateToken extends AbstractCommand<TokenStatus> {
    String token
}

class ValidateTokenHandler implements CommandHandler<TokenStatus, ValidateToken> {
    private final TokenManager tokenManager

    ValidateTokenHandler(TokenManager tokenManager) {
        this.tokenManager = tokenManager
    }

    TokenStatus execute(ValidateToken command) {
        tokenManager.validate(command.token)
    }
}
