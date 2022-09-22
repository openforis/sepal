package org.openforis.sepal.component.user.command

import groovy.transform.Immutable
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.command.Command
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.User
import org.openforis.sepal.util.Clock

@Immutable
class Authenticate implements Command<User> {
    String username
    String password

    String toString() {
        return "${getClass().simpleName}(username:$username)"
    }
}

class AuthenticateHandler implements CommandHandler<User, Authenticate> {
    private final UsernamePasswordVerifier usernamePasswordVerifier
    private final UserRepository userRepository
    private final Clock clock

    AuthenticateHandler(
        UsernamePasswordVerifier usernamePasswordVerifier, 
        UserRepository userRepository, 
        Clock clock
    ) {
        this.usernamePasswordVerifier = usernamePasswordVerifier
        this.userRepository = userRepository
        this.clock = clock
    }

    User execute(Authenticate command) {
        if (!usernamePasswordVerifier.verify(command.username, command.password)) {
            return null
        }
        userRepository.setLastLoginTime(command.username, clock.now())
        return userRepository.lookupUser(command.username)
    }
}
