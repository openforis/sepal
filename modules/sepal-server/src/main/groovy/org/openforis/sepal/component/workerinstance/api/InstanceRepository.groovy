package org.openforis.sepal.component.workerinstance.api

interface InstanceRepository {

    void launched(Collection<WorkerInstance> instances)

    boolean reserved(String id, String state)

    boolean released(String id)

    void terminated(String id)

    List<String> idleInstances(String instanceType)
}
