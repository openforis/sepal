package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.TokenStatus
import org.openforis.sepal.component.user.internal.TokenManager
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
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
