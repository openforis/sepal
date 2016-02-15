package org.openforis.sepal.hostingservice

import org.openforis.sepal.component.sandboxmanager.SandboxSession

interface WorkerInstanceManager {
    SandboxSession allocate(SandboxSession pendingSession, Closure<SandboxSession> callback)

    List<WorkerInstanceType> getInstanceTypes()

    List<WorkerInstance> runningInstances(Collection<String> instanceIds)

    void updateInstances(Collection<SandboxSession> sandboxSessions)

    WorkerInstanceManager start()

    void stop()
}
