package org.openforis.sepal.hostingservice

import org.openforis.sepal.component.sandboxmanager.SandboxSession

interface WorkerInstanceManager {
    SandboxSession allocate(SandboxSession pendingSession, Closure<SandboxSession> callback)

    void terminate(String instanceId, String instanceType)

    List<WorkerInstanceType> getInstanceTypes()

    List<WorkerInstance> runningInstances(Collection<String> instanceIds)

    WorkerInstanceManager start()

    void stop()
}
