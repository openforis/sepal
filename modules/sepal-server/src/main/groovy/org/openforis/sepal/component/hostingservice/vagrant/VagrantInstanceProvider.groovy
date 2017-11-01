package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.api.WorkerReservation

class VagrantInstanceProvider implements InstanceProvider {
    private final InstanceType instanceType
    private WorkerInstance instance
    private final List<Closure> launchListeners = []

    VagrantInstanceProvider(String host, InstanceType instanceType) {
        instance = new WorkerInstance(
                id: 'vagrant-box',
                type: instanceType.id,
                host: host,
                launchTime: new Date())
        this.instanceType = instanceType
    }

    WorkerInstance launchReserved(String instanceType, WorkerReservation reservation) {
        instance = instance.reserve(reservation)
        notifyLaunchListeners(instance)
        return instance
    }

    List<WorkerInstance> launchIdle(String instanceType, int count) {
        instance = instance.release()
        notifyLaunchListeners(instance)
        return [instance]
    }

    void terminate(String instanceId) {
        // Do nothing
    }

    void reserve(WorkerInstance instance) {
        this.instance = instance
    }

    void release(String instanceId) {
        instance = instance.release()
    }

    List<WorkerInstance> idleInstances(String instanceType) {
        idleInstances()
                .findAll { instance.type == instanceType }
    }

    List<WorkerInstance> idleInstances() {
        [instance].findAll()
                .findAll { it.idle }
    }

    List<WorkerInstance> reservedInstances() {
        [instance].findAll()
                .findAll { instance.reserved }
    }

    WorkerInstance getInstance(String instanceId) {
        instance.id == instanceId ? instance : null
    }

    void onInstanceLaunched(Closure listener) {
        launchListeners << listener
    }

    void start() {
        // Nothing to start
    }

    void stop() {
        // Nothing to stop
    }

    private Thread notifyLaunchListeners(instance) {
        Thread.start {
            launchListeners*.call(instance)
        }
    }
}
