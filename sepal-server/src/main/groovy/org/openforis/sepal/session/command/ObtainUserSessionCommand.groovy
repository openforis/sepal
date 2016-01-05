package org.openforis.sepal.session.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.session.SepalSessionManager
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.user.UserRepository

import static groovymvc.validate.Constraints.custom

class ObtainUserSessionCommand extends AbstractCommand<SepalSession> {

    Long instanceType


    ObtainUserSessionCommand(String username, Long instanceType) {
        this.username = username
        this.instanceType = instanceType
    }

    static constraints(UserRepository userRepository) {
        [
                username: custom { userRepository.getUser(it) != null }
        ]
    }
}

class ObtainUserSessionCommandHandler implements CommandHandler<SepalSession, ObtainUserSessionCommand> {

    final SepalSessionManager manager

    ObtainUserSessionCommandHandler(SepalSessionManager manager) {
        this.manager = manager
    }

    @Override
    SepalSession execute(ObtainUserSessionCommand command) {
        manager.generateNewSession(command.username, command.instanceType)
    }
}
