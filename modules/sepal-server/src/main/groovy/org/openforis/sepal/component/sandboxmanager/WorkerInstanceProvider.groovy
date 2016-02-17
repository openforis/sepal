package org.openforis.sepal.component.sandboxmanager

import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceType

interface WorkerInstanceProvider {

    WorkerInstance launch(String instanceType)

    void reserve(String instanceId, SandboxSession session)

    void idle(String instanceId)

    void terminate(String instanceId)

    List<WorkerInstanceType> instanceTypes()

    List<WorkerInstance> runningInstances(Collection<String> instanceIds)

    List<WorkerInstance> allInstances()

    List<WorkerInstance> idleInstances(String instanceType)

    boolean isSessionInstanceAvailable(long sessionId)

    boolean isInstanceAvailable(String instanceId)

    Map<String, Integer> idleCountByType()
}
