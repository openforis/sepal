package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.User
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class UpdateUserDetails extends AbstractCommand<User> {
    String usernameToUpdate
    String name
    String email
    String organization
}

class UpdateUserDetailsHandler implements CommandHandler<User, UpdateUserDetails> {
    private final UserRepository userRepository

    UpdateUserDetailsHandler(UserRepository userRepository) {
        this.userRepository = userRepository
    }

    User execute(UpdateUserDetails command) {
        def user = userRepository.lookupUser(command.usernameToUpdate)
                .withDetails(
                command.name,
                command.email,
                command.organization
        )
        userRepository.updateUserDetails(user)
        return user
    }
}
