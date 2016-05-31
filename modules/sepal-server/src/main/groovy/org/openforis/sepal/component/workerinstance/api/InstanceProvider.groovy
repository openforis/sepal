package org.openforis.sepal.component.workerinstance.api

interface InstanceProvider {
    /**
     * Launch a reserved instance.
     * @param instance specification of the instance to launch.
     * @return the instance host
     */
    String launchReserved(WorkerInstance instance)

    /**
     * Launch an idle instance.
     * @param instance specification of the instance to launch.
     */
    void launchIdle(List<WorkerInstance> instances)

    void terminate(String instanceId)

    void reserve(WorkerInstance instance)

    void release(String instanceId)

    List<WorkerInstance> idleInstances(String instanceType)

    List<WorkerInstance> idleInstances()

    List<WorkerInstance> reservedInstances()

    WorkerInstance getInstance(String instanceId)
}