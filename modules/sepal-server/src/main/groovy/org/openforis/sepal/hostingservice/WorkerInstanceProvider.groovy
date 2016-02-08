package org.openforis.sepal.hostingservice

interface WorkerInstanceProvider {
    WorkerInstance allocate(String instanceType)

    boolean terminate(String instanceId)

    List<WorkerInstanceType> getInstanceTypes()
}
