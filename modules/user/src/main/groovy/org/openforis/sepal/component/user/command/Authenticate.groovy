package org.openforis.sepal.component.user.command

import groovy.transform.Immutable
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.command.Command
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.GoogleRecaptcha
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.User
import org.openforis.sepal.util.Clock

@Immutable
class Authenticate implements Command<User> {
    String username
    String password
    String recaptchaToken

    String toString() {
        return "${getClass().simpleName}(username:$username)"
    }
}

class AuthenticateHandler implements CommandHandler<User, Authenticate> {
    private final UsernamePasswordVerifier usernamePasswordVerifier
    private final UserRepository userRepository
    private final Clock clock
    private final GoogleRecaptcha googleRecaptcha

    AuthenticateHandler(
        UsernamePasswordVerifier usernamePasswordVerifier, 
        UserRepository userRepository, 
        Clock clock,
        GoogleRecaptcha googleRecaptcha
    ) {
        this.usernamePasswordVerifier = usernamePasswordVerifier
        this.userRepository = userRepository
        this.clock = clock
        this.googleRecaptcha = googleRecaptcha
    }

    User execute(Authenticate command) {
        if (!googleRecaptcha.isValid(command.recaptchaToken, 'LOGIN')) {
            return null
        }
        if (!usernamePasswordVerifier.verify(command.username, command.password)) {
            return null
        }
        userRepository.setLastLoginTime(command.username, clock.now())
        return userRepository.lookupUser(command.username)
    }
}
