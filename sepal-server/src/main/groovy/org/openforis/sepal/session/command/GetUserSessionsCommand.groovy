package org.openforis.sepal.session.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.session.SepalSessionManager
import org.openforis.sepal.session.model.UserSessions
import org.openforis.sepal.user.UserRepository

import static groovymvc.validate.Constraints.custom


class GetUserSessionsCommand extends AbstractCommand<UserSessions> {

    static constraints(UserRepository userRepository) {
        [
                username: custom { userRepository.getUser(it) }
        ]
    }

}

class GetUserSessionsCommandHandler implements CommandHandler<UserSessions,GetUserSessionsCommand> {

    SepalSessionManager sandboxManager

    GetUserSessionsCommandHandler(SepalSessionManager sandboxManager){
        this.sandboxManager = sandboxManager
    }

    @Override
    UserSessions execute(GetUserSessionsCommand command) { sandboxManager.getUserSessions(command.username) }
}
