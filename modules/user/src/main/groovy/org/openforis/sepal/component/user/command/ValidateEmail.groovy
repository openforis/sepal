package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.Email
import org.openforis.sepal.component.user.api.GoogleRecaptcha
import org.openforis.sepal.component.user.api.UserRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
class ValidateEmail extends AbstractCommand<Boolean> {
    String email
    String recaptchaToken
}

class ValidateEmailHandler implements CommandHandler<Boolean, ValidateEmail> {
    private final UserRepository userRepository
    private final GoogleRecaptcha googleRecaptcha

    ValidateEmailHandler(UserRepository userRepository, GoogleRecaptcha googleRecaptcha) {
        this.userRepository = userRepository
        this.googleRecaptcha = googleRecaptcha
    }

    Boolean execute(ValidateEmail command) {
        googleRecaptcha.isValid(command.recaptchaToken, 'VALIDATE_EMAIL') &&
            // Email.isValid(command.email) &&
            userRepository.findUserByEmail(command.email) == null
    }
}
