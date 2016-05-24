package org.openforis.sepal.component.task.command

import groovy.transform.Immutable
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.InstanceProvider

@Immutable
class ActivateInstance extends AbstractCommand<Void> {
    Instance instance
}

class ActivateInstanceHandler implements CommandHandler<Void, ActivateInstance> {
    private final InstanceProvider instanceProvider

    ActivateInstanceHandler(InstanceProvider instanceProvider) {
        this.instanceProvider = instanceProvider
    }

    Void execute(ActivateInstance command) {
        instanceProvider.instanceActive(command.instance)
        return null
    }
}