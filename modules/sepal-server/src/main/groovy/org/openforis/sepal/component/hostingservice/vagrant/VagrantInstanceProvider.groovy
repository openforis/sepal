package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance

class VagrantInstanceProvider implements InstanceProvider {
    String launchReserved(WorkerInstance instance) {
        return null
    }

    void launchIdle(List<WorkerInstance> instances) {

    }

    void terminate(String instanceId) {

    }

    void reserve(WorkerInstance instance) {

    }

    void release(String instanceId) {

    }

    List<WorkerInstance> idleInstances(String instanceType) {
        return null
    }

    List<WorkerInstance> idleInstances() {
        return null
    }

    List<WorkerInstance> reservedInstances() {
        return null
    }

    WorkerInstance getInstance(String instanceId) {
        return null
    }
}
