package org.openforis.sepal.hostingservice

import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.WorkerInstanceProvider
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.JobExecutor

class PoolingWorkerInstanceManager implements WorkerInstanceManager {
    private final WorkerInstanceProvider provider
    private final Map<String, Integer> expectedIdleCountByType
    private final JobExecutor jobExecutor
    private final Clock clock

    PoolingWorkerInstanceManager(
            WorkerInstanceProvider provider,
            Map<String, Integer> expectedIdleCountByType,
            JobExecutor jobExecutor
    ) {
        this.provider = provider
        this.expectedIdleCountByType = expectedIdleCountByType
        this.jobExecutor = jobExecutor
        this.clock = clock
    }

    SandboxSession allocate(SandboxSession pendingSession, Closure<SandboxSession> callback) {
        def idleInstances = provider.idleInstances(pendingSession.instanceType)
        def instance = idleInstances ? firstIdle(idleInstances) : provider.launch(pendingSession.instanceType)
        return reserveAndNotify(instance, pendingSession, callback)
    }

    private WorkerInstance firstIdle(List<WorkerInstance> idleInstances) {
        idleInstances.sort { !it.running }.first()
    }

    private SandboxSession reserveAndNotify(WorkerInstance instance, SandboxSession session, Closure<SandboxSession> callback) {
        provider.reserve(instance.id, session)
        def result = instance.running ? callback(instance) : session.starting(instance)
        fillIdlePool()
        return result
    }

    void terminate(String instanceId, String instanceType) {
        def idleCount = provider.idleInstances(instanceType).size()
        def expectedIdleCount = expectedIdleCountByType[instanceType] ?: 0
        if (idleCount < expectedIdleCount)
            provider.idle(instanceId)
        else
            provider.terminate(instanceId)
    }

    List<WorkerInstanceType> getInstanceTypes() {
        return provider.instanceTypes()
    }

    List<WorkerInstance> runningInstances(Collection<String> instanceIds) {
        return provider.runningInstances(instanceIds)
    }

    PoolingWorkerInstanceManager start() {
        fillIdlePool()
        return this
    }

    void stop() {
        jobExecutor.stop()
    }

    private void fillIdlePool() {
        def idleCountByType = provider.idleCountByType()
        expectedIdleCountByType.each { type, expectedIdleCount ->
            def actualIdleCount = idleCountByType[type] ?: 0
            def instancesToStart = expectedIdleCount - actualIdleCount
            if (instancesToStart > 0) {
                instancesToStart.times {
                    jobExecutor.execute {
                        def instance = provider.launch(type)
                        provider.idle(instance.id)
                    }
                }
            }
        }
    }
}
