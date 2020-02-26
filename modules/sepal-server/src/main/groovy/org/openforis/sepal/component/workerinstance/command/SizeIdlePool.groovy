package org.openforis.sepal.component.workerinstance.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceRepository
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.Clock

@EqualsAndHashCode(callSuper = true)
@Canonical
class SizeIdlePool extends AbstractCommand<Void> {
    Map<String, Integer> targetIdleCountByInstanceType
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
        def idleInstancesByType = instanceProvider.idleInstances().groupBy { it.type }
        command.targetIdleCountByInstanceType.keySet()
            .findAll { !idleInstancesByType.containsKey(it) }
            .each { idleInstancesByType[it] = [] }

        idleInstancesByType
            .each { instanceType, idleInstances ->
                def idleCount = idleInstances.size()
                def targetCount = command.targetIdleCountByInstanceType[instanceType] ?: 0
                println("idleCount: " + idleCount)
                println("targetCount: " + targetCount)
                if (idleCount < targetCount) {
                    def instances = instanceProvider.launchIdle(instanceType, targetCount - idleCount)
                    instanceRepository.launched(instances)
                } else if (idleCount > targetCount)
                    terminateInstances(idleCount - targetCount, idleInstances)
            }
        return null
    }

    private void terminateInstances(int count, List<WorkerInstance> instances) {
        instances
            .take(count)
            .each { terminate(it) }
    }

    private terminate(WorkerInstance instance) {
        instanceProvider.terminate(instance.id)
        instanceRepository.terminated(instance.id)
    }
}
