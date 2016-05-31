package org.openforis.sepal.component.workerinstance.api

interface InstanceProvider {
    void launchReserved(WorkerInstance instance)

    void launchIdle(List<WorkerInstance> instances)

    void terminate(String instanceId)

    void reserve(WorkerInstance instance)

    void release(String instanceId)

    List<WorkerInstance> idleInstances(String instanceType)

    List<WorkerInstance> idleInstances()

    List<WorkerInstance> reservedInstances()

    WorkerInstance getInstance(String instanceId)
}