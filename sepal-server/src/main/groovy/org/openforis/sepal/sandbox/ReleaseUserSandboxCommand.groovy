package org.openforis.sepal.sandbox

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler

class ReleaseUserSandboxCommand extends AbstractCommand<Void> {

    ReleaseUserSandboxCommand(String username) {
        this.username = username
    }
}

class ReleaseUserSandboxCommandHandler implements CommandHandler<Void, ReleaseUserSandboxCommand> {

    final SandboxManager manager

    ReleaseUserSandboxCommandHandler(SandboxManager manager) {
        this.manager = manager
    }

    @Override
    Void execute(ReleaseUserSandboxCommand command) {
        manager.release(command.username)
        return null
    }
}
