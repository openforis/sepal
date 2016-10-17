package org.openforis.sepal.component.user.command

import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class ChangePassword extends AbstractCommand<Boolean> {
    String oldPassword
    String newPassword
}

class ChangePasswordHandler implements CommandHandler<Boolean, ChangePassword> {
    private final UsernamePasswordVerifier usernamePasswordVerifier
    private final ExternalUserDataGateway externalUserDataGateway

    ChangePasswordHandler(UsernamePasswordVerifier usernamePasswordVerifier, ExternalUserDataGateway externalUserDataGateway) {
        this.usernamePasswordVerifier = usernamePasswordVerifier
        this.externalUserDataGateway = externalUserDataGateway
    }

    Boolean execute(ChangePassword command) {
        if (usernamePasswordVerifier.verify(command.username, command.oldPassword))
            externalUserDataGateway.changePassword(command.username, command.newPassword)
        else
            return false
        return true
    }
}
