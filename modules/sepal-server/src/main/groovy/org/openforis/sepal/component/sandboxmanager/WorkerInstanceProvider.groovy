package org.openforis.sepal.component.sandboxmanager

import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceType

interface WorkerInstanceProvider {
    List<WorkerInstance> idleInstances(String instanceType)

    WorkerInstance launch(String instanceType)

    void reserve(String instanceId, SandboxSession session)

    void idle(String instanceId)

    boolean terminate(String instanceId)

    List<WorkerInstanceType> getInstanceTypes()

    Map<String, Integer> idleCountByType()
}
