package org.openforis.sepal.sandbox

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler

class ObtainUserSandboxCommand extends AbstractCommand<Sandbox> {

    ObtainUserSandboxCommand(String username) {
        this.username = username
    }
}

class ObtainUserSandboxCommandHandler implements CommandHandler<Sandbox, ObtainUserSandboxCommand> {

    final SandboxManager manager

    ObtainUserSandboxCommandHandler(SandboxManager manager) {
        this.manager = manager
    }

    @Override
    Sandbox execute(ObtainUserSandboxCommand command) { manager.obtain(command.username) }
}
