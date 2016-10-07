package org.openforis.sepal.component.user.command

import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.command.Command
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.User
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class Authenticate implements Command<User> {
    String username
    String password

    String toString() {
        return "${getClass().simpleName}(username:$username)"
    }
}

class AuthenticateHandler implements CommandHandler<User, Authenticate> {
    UsernamePasswordVerifier usernamePasswordVerifier
    UserRepository userRepository

    AuthenticateHandler(UsernamePasswordVerifier usernamePasswordVerifier, UserRepository userRepository) {
        this.usernamePasswordVerifier = usernamePasswordVerifier
        this.userRepository = userRepository
    }

    User execute(Authenticate command) {
        if (!usernamePasswordVerifier.verify(command.username, command.password))
            return null
        return userRepository.lookupUser(command.username)
    }
}
