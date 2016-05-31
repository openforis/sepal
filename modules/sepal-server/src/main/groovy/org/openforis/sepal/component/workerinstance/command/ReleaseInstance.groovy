package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.event.FailedToReleaseInstance
import org.openforis.sepal.component.workerinstance.event.InstanceReleased
import org.openforis.sepal.event.EventDispatcher

class ReleaseInstance extends AbstractCommand<Void> {
    String instanceId
}

class ReleaseInstanceHandler implements CommandHandler<Void, ReleaseInstance> {
    private final InstanceProvider instanceProvider
    private final InstanceProvisioner instanceProvisioner
    private final EventDispatcher eventDispatcher

    ReleaseInstanceHandler(InstanceProvider instanceProvider, InstanceProvisioner instanceProvisioner, EventDispatcher eventDispatcher) {
        this.instanceProvider = instanceProvider
        this.instanceProvisioner = instanceProvisioner
        this.eventDispatcher = eventDispatcher
    }

    Void execute(ReleaseInstance command) {
        try {
            def instance = instanceProvider.getInstance(command.instanceId)
            instanceProvisioner.undeploy(instance)
            instanceProvider.release(command.instanceId)
            eventDispatcher.publish(new InstanceReleased(instance.release()))
        } catch (Exception e) {
            eventDispatcher.publish(new FailedToReleaseInstance(command.instanceId, e))
            instanceProvider.terminate(command.instanceId)
        }
        return null
    }
}
