package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.event.EventDispatcher

class ReleaseUnusedInstances extends AbstractCommand<Void> {
    List<String> usedInstanceIds
}

class ReleaseUnusedInstancesHandler implements CommandHandler<Void, ReleaseUnusedInstances> {
    private final InstanceProvider instanceProvider
    private final InstanceProvisioner instanceProvisioner
    private final EventDispatcher eventDispatcher
    private final ReleaseInstanceHandler releaseInstanceHandler

    ReleaseUnusedInstancesHandler(InstanceProvider instanceProvider, InstanceProvisioner instanceProvisioner, EventDispatcher eventDispatcher) {
        this.instanceProvider = instanceProvider
        this.instanceProvisioner = instanceProvisioner
        this.eventDispatcher = eventDispatcher
        releaseInstanceHandler = new ReleaseInstanceHandler(instanceProvider, instanceProvisioner, eventDispatcher)
    }

    Void execute(ReleaseUnusedInstances command) {
        instanceProvider.reservedInstances()
                .findAll { !command.usedInstanceIds.contains(it.id) }
                .each { releaseInstance(it) }
        return null
    }

    private void releaseInstance(WorkerInstance instance) {
        releaseInstanceHandler.execute(new ReleaseInstance(instanceId: instance.id))
    }
}
