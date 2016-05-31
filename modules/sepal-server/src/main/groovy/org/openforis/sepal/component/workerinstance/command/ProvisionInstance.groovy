package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.event.InstanceProvisioned
import org.openforis.sepal.event.EventDispatcher

class ProvisionInstance extends AbstractCommand<Void> {
    WorkerInstance instance
}

class ProvisionInstanceHandler implements CommandHandler<Void, ProvisionInstance> {
    private final InstanceProvisioner instanceProvisioner
    private final EventDispatcher eventDispatcher

    ProvisionInstanceHandler(InstanceProvisioner instanceProvisioner, EventDispatcher eventDispatcher) {
        this.instanceProvisioner = instanceProvisioner
        this.eventDispatcher = eventDispatcher
    }

    Void execute(ProvisionInstance command) {
        instanceProvisioner.provisionInstance(command.instance)
        eventDispatcher.publish(new InstanceProvisioned(command.instance))
        return null
    }
}
