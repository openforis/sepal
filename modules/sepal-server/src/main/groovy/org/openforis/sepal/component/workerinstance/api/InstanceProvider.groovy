package org.openforis.sepal.component.workerinstance.api

interface InstanceProvider {
    WorkerInstance launchReserved(String instanceType, WorkerReservation reservation)

    void launchIdle(String instanceType, int count)

    void terminate(String instanceId)

    void reserve(WorkerInstance instance)

    void release(String instanceId)

    List<WorkerInstance> idleInstances(String instanceType)

    List<WorkerInstance> idleInstances()

    List<WorkerInstance> reservedInstances()

    WorkerInstance getInstance(String instanceId)

    void onInstanceLaunched(Closure listener)

    void start()

    void stop()
}