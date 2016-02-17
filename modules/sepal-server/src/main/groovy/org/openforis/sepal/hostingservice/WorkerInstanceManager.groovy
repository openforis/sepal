package org.openforis.sepal.hostingservice

import org.openforis.sepal.component.sandboxmanager.SandboxSession

interface WorkerInstanceManager {
    SandboxSession allocate(SandboxSession pendingSession, Closure<SandboxSession> callback)

    void deallocate(String instanceId)

    void updateInstances(Collection<SandboxSession> sandboxSessions)

    List<WorkerInstanceType> getInstanceTypes()

    List<WorkerInstance> runningInstances(Collection<String> instanceIds)

    boolean isSessionInstanceAvailable(long sessionId)
}
