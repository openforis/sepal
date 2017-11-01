package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceRepository
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.annotation.Data

import java.time.Duration
import java.util.concurrent.TimeUnit

@Data(callSuper = true)
class SizeIdlePool extends AbstractCommand<Void> {
    Map<String, Integer> targetIdleCountByInstanceType
    int timeBeforeChargeToTerminate
    TimeUnit timeUnit
}

class SizeIdlePoolHandler implements CommandHandler<Void, SizeIdlePool> {
    private final InstanceRepository instanceRepository
    private final InstanceProvider instanceProvider
    private final EventDispatcher eventDispatcher
    private final Clock clock

    SizeIdlePoolHandler(InstanceRepository instanceRepository, InstanceProvider instanceProvider, EventDispatcher eventDispatcher, Clock clock) {
        this.instanceRepository = instanceRepository
        this.instanceProvider = instanceProvider
        this.eventDispatcher = eventDispatcher
        this.clock = clock
    }

    Void execute(SizeIdlePool command) {
        def minutesBeforeChargeToTerminate = command.timeUnit.toMinutes(command.timeBeforeChargeToTerminate) as int
        def idleInstancesByType = instanceProvider.idleInstances().groupBy { it.type }
        command.targetIdleCountByInstanceType.keySet()
                .findAll { !idleInstancesByType.containsKey(it) }
                .each { idleInstancesByType[it] = [] }

        idleInstancesByType
                .each { instanceType, idleInstances ->
            def idleCount = idleInstances.size()
            def targetCount = command.targetIdleCountByInstanceType[instanceType] ?: 0
            if (idleCount < targetCount) {
                def instances = instanceProvider.launchIdle(instanceType, targetCount - idleCount)
                instanceRepository.launched(instances)
            } else if (idleCount > targetCount)
                potentiallyForTermination(idleCount - targetCount, idleInstances, minutesBeforeChargeToTerminate)
        }
        return null
    }

    private void potentiallyForTermination(int count, List<WorkerInstance> instances, int minutesBeforeChargeToTerminate) {
        instances
                .findAll { minutesUntilCharged(it.launchTime) <= minutesBeforeChargeToTerminate }
                .sort(false, new OrderBy([{ minutesUntilCharged(it.launchTime) }]))
                .take(count)
                .each { terminate(it) }
    }

    private terminate(WorkerInstance instance) {
        instanceProvider.terminate(instance.id)
        instanceRepository.terminated(instance.id)
    }

    private int minutesUntilCharged(Date launchTime) {
        return 60 - minutesSince(launchTime) % 60
    }

    private int minutesSince(Date launchTime) {
        Duration.between(launchTime.toInstant(), clock.now().toInstant()).toMinutes()
    }

}
