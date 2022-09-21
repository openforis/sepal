package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.GoogleRecaptcha
import org.openforis.sepal.component.user.api.Username
import org.openforis.sepal.component.user.api.UserRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
class ValidateUsername extends AbstractCommand<Boolean> {
    String username
    String recaptchaToken
}

class ValidateUsernameHandler implements CommandHandler<Boolean, ValidateUsername> {
    private final UserRepository userRepository
    private final GoogleRecaptcha googleRecaptcha

    ValidateUsernameHandler(UserRepository userRepository, GoogleRecaptcha googleRecaptcha) {
        this.userRepository = userRepository
        this.googleRecaptcha = googleRecaptcha
    }

    Boolean execute(ValidateUsername command) {
        googleRecaptcha.isValid(command.recaptchaToken, 'VALIDATE_USERNAME') &&
            Username.isValid(command.username) &&
            userRepository.findUserByUsername(command.username) == null
    }
}
