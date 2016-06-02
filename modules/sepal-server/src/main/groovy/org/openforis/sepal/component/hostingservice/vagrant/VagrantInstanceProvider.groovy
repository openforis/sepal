package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.hostingservice.internal.InstanceType
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance

class VagrantInstanceProvider implements InstanceProvider {
    private static final HOST = '172.28.128.3'
    private final InstanceType instanceType
    private WorkerInstance instance

    VagrantInstanceProvider(InstanceType instanceType) {
        this.instanceType = instanceType
    }

    WorkerInstance launchReserved(WorkerInstance instance) {
        this.instance = instance.launched(HOST, new Date()).reserve(instance.reservation).running()
        return this.instance
    }

    void launchIdle(List<WorkerInstance> instances) {
        if (instances)
            instance = instances.first().launched(HOST, new Date()).running()
    }

    void terminate(String instanceId) {
        if (instance.id == instanceId)
            instance = null
    }

    void reserve(WorkerInstance instance) {
        if (this.instance.id == instance.id)
            this.instance.reserve(instance.reservation).running()
    }

    void release(String instanceId) {
        if (instance.id == instanceId)
            instance = instance.release().running()
    }

    List<WorkerInstance> idleInstances(String instanceType) {
        [instance]
                .findAll { instance.type == instanceType }
                .findAll { !instance.reservation }
    }

    List<WorkerInstance> idleInstances() {
        [instance]
                .findAll { !instance.reservation }
    }

    List<WorkerInstance> reservedInstances() {
        [instance]
                .findAll { instance.reservation }
    }

    WorkerInstance getInstance(String instanceId) {
        instance.id == instanceId ? instance : null
    }
}
