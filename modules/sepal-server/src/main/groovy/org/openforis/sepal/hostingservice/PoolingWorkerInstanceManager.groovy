package org.openforis.sepal.hostingservice

import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionStatus
import org.openforis.sepal.component.sandboxmanager.WorkerInstanceProvider
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.Is

import java.time.Duration

class PoolingWorkerInstanceManager implements WorkerInstanceManager {
    private final WorkerInstanceProvider provider
    private final Map<String, Integer> expectedIdleCountByType
    private final Clock clock

    PoolingWorkerInstanceManager(WorkerInstanceProvider provider, Map<String, Integer> expectedIdleCountByType, Clock clock) {
        this.provider = provider
        this.expectedIdleCountByType = expectedIdleCountByType
        this.clock = clock
    }

    SandboxSession allocate(SandboxSession sessionPendingInstanceAllocation, Closure<SandboxSession> callback) {
        if (sessionPendingInstanceAllocation.status != SessionStatus.PENDING)
            throw new IllegalStateException("Expected status to be $SessionStatus.PENDING")
        def idleInstances = provider.idleInstances(sessionPendingInstanceAllocation.instanceType)
        def instance = idleInstances ? firstIdle(idleInstances) : provider.launch(sessionPendingInstanceAllocation.instanceType)
        return reserveAndNotify(instance, sessionPendingInstanceAllocation, callback)
    }

    void deallocate(String instanceId) {
        Is.notNull(instanceId)
        if (provider.isInstanceAvailable(instanceId))
            provider.idle(instanceId)
    }

    private WorkerInstance firstIdle(List<WorkerInstance> idleInstances) {
        idleInstances.sort(false, new OrderBy([
                { !it.running },
                { minutesUntilCharged(it.launchTime) }
        ])).first()
    }

    private SandboxSession reserveAndNotify(WorkerInstance instance, SandboxSession session, Closure<SandboxSession> callback) {
        provider.reserve(instance.id, session)
        fillIdlePool()
        def result = instance.running ? callback(instance) : session.starting(instance)
        return result
    }

    List<WorkerInstanceType> getInstanceTypes() {
        return provider.instanceTypes()
    }

    List<WorkerInstance> runningInstances(Collection<String> instanceIds) {
        return provider.runningInstances(instanceIds)
    }

    boolean isSessionInstanceAvailable(long sessionId) {
        return provider.isSessionInstanceAvailable(sessionId)
    }

    void updateInstances(Collection<SandboxSession> sessions) {
        def sessionsByInstanceId = sessions.groupBy { it.instanceId }
        def allInstances = provider.allInstances()

        allInstances.each { instance ->
            def used = sessionsByInstanceId.containsKey(instance.id)
            if (!used && !instance.idle && (!instance.reservedTime || minutesSince(instance.reservedTime) >= 5))  // TODO: Log warning?
                provider.idle(instance.id)
            if (used && instance.idle)
                provider.reserve(instance.id, sessionsByInstanceId[instance.id].first()) // TODO: Log warning
        }

        def unusedInstancesByType = allInstances
                .findAll { !sessionsByInstanceId.containsKey(it.id) }
                .groupBy { it.type }
        unusedInstancesByType.each { type, instances ->
            def expectedIdleCount = expectedIdleCountByType[type] ?: 0
            def toTerminate = instances.size() - expectedIdleCount
            if (toTerminate > 0) {
                potentiallyTerminatable(instances).take(toTerminate).each {
                    provider.terminate(it.id)
                }
            }
        }

        fillIdlePool()
    }

    List<WorkerInstance> potentiallyTerminatable(List<WorkerInstance> workerInstances) {
        workerInstances.findAll {
            def minutesUntilCharged = minutesUntilCharged(it.launchTime)
            minutesUntilCharged <= 5
        }.sort { minutesUntilCharged(it.launchTime) }
    }

    int minutesUntilCharged(Date launchTime) {
        return 60 - minutesSince(launchTime) % 60
    }

    int minutesSince(Date launchTime) {
        Duration.between(launchTime.toInstant(), clock.now().toInstant()).toMinutes()
    }


    private void fillIdlePool() {
        def idleCountByType = provider.idleCountByType()
        expectedIdleCountByType.each { type, expectedIdleCount ->
            def actualIdleCount = idleCountByType[type] ?: 0
            def instancesToStart = expectedIdleCount - actualIdleCount
            if (instancesToStart > 0) {
                launchIdle(instancesToStart, type)
            }
        }
    }

    private launchIdle(int instancesToStart, String type) {
        instancesToStart.times {
            def instance = provider.launch(type)
            provider.idle(instance.id)
        }
    }
}
