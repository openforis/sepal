package org.openforis.sepal.hostingservice

import org.openforis.sepal.component.sandboxmanager.SandboxSession

interface WorkerInstanceManager {
    SandboxSession allocate(SandboxSession pendingSession, Closure<SandboxSession> callback)

    boolean terminate(String instanceId, String instanceType)

    List<WorkerInstanceType> getInstanceTypes()
}
