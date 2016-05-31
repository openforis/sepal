package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.Clock

import java.time.Duration

class SizeIdlePool extends AbstractCommand<Void> {
    Map<String, Integer> targetIdleCountByInstanceType
}

class SizeIdlePoolHandler implements CommandHandler<Void, SizeIdlePool> {
    private final InstanceProvider instanceProvider
    private final EventDispatcher eventDispatcher
    private final Clock clock

    SizeIdlePoolHandler(InstanceProvider instanceProvider, EventDispatcher eventDispatcher, Clock clock) {
        this.instanceProvider = instanceProvider
        this.eventDispatcher = eventDispatcher
        this.clock = clock
    }

    Void execute(SizeIdlePool command) {
        def idleInstancesByType = instanceProvider.idleInstances().groupBy { it.type }
        command.targetIdleCountByInstanceType.keySet()
                .findAll { !idleInstancesByType.containsKey(it) }
                .each { idleInstancesByType[it] = [] }

        idleInstancesByType
                .each { instanceType, idleInstances ->
            def idleCount = idleInstances.size()
            def targetCount = command.targetIdleCountByInstanceType[instanceType] ?: 0
            if (idleCount < targetCount)
                launch(targetCount - idleCount, instanceType)
            else if (idleCount > targetCount)
                potentiallyForTermination(idleCount - targetCount, idleInstances)
        }
        return null
    }

    private void potentiallyForTermination(int count, List<WorkerInstance> instances) {
        instances
                .findAll { minutesUntilCharged(it.launchTime) <= 5 }
                .sort(false, new OrderBy([{ minutesUntilCharged(it.launchTime) }]))
                .take(count)
                .each { terminate(it) }
    }

    private terminate(WorkerInstance instance) {
        instanceProvider.terminate(instance.id)
    }

    private launch(int count, String instanceType) {
        def instances = (0..<count).collect {
            new WorkerInstance(id: UUID.randomUUID().toString(), type: instanceType, launchTime: clock.now())
        }
        instanceProvider.launchIdle(instances)
    }

    private int minutesUntilCharged(Date launchTime) {
        return 60 - minutesSince(launchTime) % 60
    }

    private int minutesSince(Date launchTime) {
        Duration.between(launchTime.toInstant(), clock.now().toInstant()).toMinutes()
    }

}
