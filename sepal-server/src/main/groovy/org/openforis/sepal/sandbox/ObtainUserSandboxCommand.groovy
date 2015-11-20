package org.openforis.sepal.sandbox

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.user.UserRepository

import static groovymvc.validate.Constraints.custom

class ObtainUserSandboxCommand extends AbstractCommand<SandboxData> {

    Size sandboxSize

    ObtainUserSandboxCommand(String username, int sandboxSize) {
        this.username = username
        this.sandboxSize = Size.byValue(sandboxSize)
    }

    static constraints(UserRepository userRepository) {
        [
                username: custom { userRepository.userExist(it) }
        ]
    }
}

class ObtainUserSandboxCommandHandler implements CommandHandler<SandboxData, ObtainUserSandboxCommand> {

    final SandboxManager manager

    ObtainUserSandboxCommandHandler(SandboxManager manager) {
        this.manager = manager
    }

    @Override
    SandboxData execute(ObtainUserSandboxCommand command) {
        manager.getUserSandbox(command.username)
    }
}
