package org.openforis.sepal.hostingservice

import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.WorkerInstanceProvider
import org.openforis.sepal.util.JobExecutor

class PoolingWorkerInstanceManager implements WorkerInstanceManager {
    private final WorkerInstanceProvider provider
    private final Map<String, Integer> expectedIdleCountByType
    private final JobExecutor jobExecutor

    PoolingWorkerInstanceManager(
            WorkerInstanceProvider provider,
            Map<String, Integer> expectedIdleCountByType,
            JobExecutor jobExecutor
    ) {
        this.provider = provider
        this.expectedIdleCountByType = expectedIdleCountByType
        this.jobExecutor = jobExecutor
    }

    SandboxSession allocate(SandboxSession pendingSession, Closure<SandboxSession> callback) {
        def idleInstances = provider.idleInstances(pendingSession.instanceType)
        if (idleInstances)
            return reserveAndNotify(idleInstances.first(), pendingSession, callback)

        jobExecutor.execute {
            def instance = provider.launch(pendingSession.instanceType)
            reserveAndNotify(instance, pendingSession, callback)
        }
        return null
    }

    private SandboxSession reserveAndNotify(WorkerInstance instance, SandboxSession session, Closure<SandboxSession> callback) {
        provider.reserve(instance.id, session)
        def result = callback(instance)
        fillIdlePool()
        return result
    }

    boolean terminate(String instanceId, String instanceType) {
        def idleCount = provider.idleInstances(instanceType).size()
        def expectedIdleCount = expectedIdleCountByType[instanceType] ?: 0
        if (idleCount < expectedIdleCount) {
            provider.idle(instanceId)
            return false
        }
        return provider.terminate(instanceId)
    }

    List<WorkerInstanceType> getInstanceTypes() {
        return provider.instanceTypes
    }

    PoolingWorkerInstanceManager start() {
        fillIdlePool()
        return this
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

    void stop() {

    }
}
