package org.openforis.sepal.component.hostingservice.local

import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.api.WorkerReservation
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class LocalInstanceProvider implements InstanceProvider {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String host
    private final InstanceType instanceType
    private final Map<String, WorkerInstance> workerInstanceById = [:]
    private final List<Closure> launchListeners = []

    LocalInstanceProvider(String host, InstanceType instanceType) {
        this.host = host
        this.instanceType = instanceType
    }

    WorkerInstance launchReserved(String instanceType, WorkerReservation reservation) {
        LOG.info("launchReserved(instanceType: ${instanceType}, reservation: ${reservation})")
        def instance = new WorkerInstance(
                id: "instance-${UUID.randomUUID().toString()}",
                type: instanceType,
                host: host,
                launchTime: new Date(),
                running: true
        ).reserve(reservation)
        updateInstance(instance)
        notifyLaunchListeners(instance)
        return instance
    }

    List<WorkerInstance> launchIdle(String instanceType, int count) {
        LOG.info("launchIdle(instanceType: ${instanceType}, count: ${count})")
        def instance = new WorkerInstance(
                id: "instance-${UUID.randomUUID().toString()}",
                type: instanceType,
                host: host,
                launchTime: new Date(),
                running: true
        )
        updateInstance(instance)
        notifyLaunchListeners(instance)
        return [instance]
    }

    void terminate(String instanceId) {
        LOG.info("terminate(instanceId: ${instanceId})")
        workerInstanceById.remove(instanceId)
    }

    void reserve(WorkerInstance instance) {
        LOG.info("reserve(instance: ${instance})")
        updateInstance(instance)
    }

    void release(String instanceId) {
        LOG.info("release(instanceId: ${instanceId})")
        def instance = getInstance(instanceId)
        if (instance) {
            updateInstance(instance.release())
        }
    }

    List<WorkerInstance> idleInstances(String instanceType) {
        workerInstanceById.values().findAll() {it.isIdle() } as List
    }

    List<WorkerInstance> idleInstances() {
        workerInstanceById.values() as List
    }

    List<WorkerInstance> reservedInstances() {
        workerInstanceById.values().findAll() {it.isReserved() } as List
    }

    WorkerInstance getInstance(String instanceId) {
        workerInstanceById[instanceId]
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

    private void updateInstance(WorkerInstance instance) {
        if (instance) {
            workerInstanceById[instance.id] = instance
        }
    }
}
