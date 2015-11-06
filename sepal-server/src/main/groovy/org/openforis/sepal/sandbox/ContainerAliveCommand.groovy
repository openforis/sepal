package org.openforis.sepal.sandbox

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler

class ContainerAliveCommand extends AbstractCommand<Void> {

    int sandboxId

    ContainerAliveCommand(int sandboxId) {
        this.sandboxId = sandboxId
    }

}

class ContainerAliveCommandHandler implements CommandHandler<Void, ContainerAliveCommand> {

    SandboxManager sandboxManager

    ContainerAliveCommandHandler(SandboxManager sandboxManager) {
        this.sandboxManager = sandboxManager
    }

    @Override
    Void execute(ContainerAliveCommand command) {
        sandboxManager.aliveSignal(command.sandboxId)
        return null
    }
}
