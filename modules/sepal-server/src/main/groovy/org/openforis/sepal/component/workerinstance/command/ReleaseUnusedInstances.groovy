package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.Clock

import java.util.concurrent.TimeUnit

class ReleaseUnusedInstances extends AbstractCommand<Void> {
    List<String> usedInstanceIds
    int minAge
    TimeUnit timeUnit
}

class ReleaseUnusedInstancesHandler implements CommandHandler<Void, ReleaseUnusedInstances> {
    private final InstanceProvider instanceProvider
    private final InstanceProvisioner instanceProvisioner
    private final EventDispatcher eventDispatcher
    private final Clock clock
    private final ReleaseInstanceHandler releaseInstanceHandler

    ReleaseUnusedInstancesHandler(
            InstanceProvider instanceProvider,
            InstanceProvisioner instanceProvisioner,
            EventDispatcher eventDispatcher,
            Clock clock) {
        this.instanceProvider = instanceProvider
        this.instanceProvisioner = instanceProvisioner
        this.eventDispatcher = eventDispatcher
        this.clock = clock
        releaseInstanceHandler = new ReleaseInstanceHandler(instanceProvider, instanceProvisioner, eventDispatcher)
    }

    Void execute(ReleaseUnusedInstances command) {
        instanceProvider.reservedInstances()
                .findAll { !command.usedInstanceIds.contains(it.id) }
                .findAll { timeAfterLaunchLongerThan(command.minAge, command.timeUnit, it) }
                .each { releaseInstance(it) }
        return null
    }

    private boolean timeAfterLaunchLongerThan(int time, TimeUnit timeUnit, WorkerInstance instance) {
        def millisSinceLaunch = clock.now().time - instance.launchTime.time as long
        return millisSinceLaunch > timeUnit.toMillis(time)
    }

    private void releaseInstance(WorkerInstance instance) {
        releaseInstanceHandler.execute(new ReleaseInstance(instanceId: instance.id))
    }
}
