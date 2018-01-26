package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.InstanceRepository
import org.openforis.sepal.component.workerinstance.event.FailedToReleaseInstance
import org.openforis.sepal.component.workerinstance.event.InstanceReleased
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.annotation.Data
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@Data(callSuper = true)
class ReleaseInstance extends AbstractCommand<Void> {
    String instanceId
}

class ReleaseInstanceHandler implements CommandHandler<Void, ReleaseInstance> {
    private static Logger LOG = LoggerFactory.getLogger(this)
    private final InstanceRepository instanceRepository
    private final InstanceProvider instanceProvider
    private final InstanceProvisioner instanceProvisioner
    private final EventDispatcher eventDispatcher

    ReleaseInstanceHandler(InstanceRepository instanceRepository, InstanceProvider instanceProvider, InstanceProvisioner instanceProvisioner, EventDispatcher eventDispatcher) {
        this.instanceRepository = instanceRepository
        this.instanceProvider = instanceProvider
        this.instanceProvisioner = instanceProvisioner
        this.eventDispatcher = eventDispatcher
    }

    Void execute(ReleaseInstance command) {
        try {
            def instance = instanceProvider.getInstance(command.instanceId)
            def raceCondition = !instanceRepository.released(command.instanceId)
            if (raceCondition) {
                LOG.info("Encountered race-condition when releasing instance. instance: $instance")
                return null
            }
            if (instance.host) // Host might be unknown at this point, and there will be nothing to undeploy on the instance
                instanceProvisioner.undeploy(instance)
            instanceProvider.release(command.instanceId)
            eventDispatcher.publish(new InstanceReleased(instance.release()))
        } catch (Exception e) {
            LOG.warn("Failed to release instance, terminating instead: $command", e)
            eventDispatcher.publish(new FailedToReleaseInstance(command.instanceId, e))
            terminateInstance(command)
            instanceRepository.terminated(command.instanceId)
        }
        return null
    }

    private terminateInstance(ReleaseInstance command) {
        try {
            instanceProvider.terminate(command.instanceId)
        } catch (Exception e) {
            LOG.error("Failed to terminate instance: $command", e)
        }
    }
}
