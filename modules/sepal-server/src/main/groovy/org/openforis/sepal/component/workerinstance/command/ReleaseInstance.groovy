package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider

class ReleaseInstance extends AbstractCommand<Void> {
    String instanceId
}

class ReleaseInstanceHandler implements CommandHandler<Void, ReleaseInstance> {
    private final InstanceProvider instanceProvider

    ReleaseInstanceHandler(InstanceProvider instanceProvider) {
        this.instanceProvider = instanceProvider
    }

    Void execute(ReleaseInstance command) {
        instanceProvider.release(command.instanceId)
        return null
    }
}
