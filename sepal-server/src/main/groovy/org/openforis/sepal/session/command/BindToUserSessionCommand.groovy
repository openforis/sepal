package org.openforis.sepal.session.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.session.SepalSessionManager
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.user.UserRepository

import static groovymvc.validate.Constraints.custom

class BindToUserSessionCommand extends AbstractCommand<SepalSession> {

    Long sessionId


    static constraints(UserRepository userRepository) {
        [
                username: custom { userRepository.getUser(it)  != null}

        ]
    }

}

class BindToUserSessionCommandHandler implements CommandHandler<SepalSession,BindToUserSessionCommand> {

    SepalSessionManager sessionManager

    BindToUserSessionCommandHandler (SepalSessionManager sessionManager){
        this.sessionManager = sessionManager
    }

    @Override
    SepalSession execute(BindToUserSessionCommand command) {
        sessionManager.bindToUserSession(command.username,command.sessionId)
    }
}
