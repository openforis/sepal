package org.openforis.sepal.component.hostingservice.gcp

import groovy.time.TimeCategory
import org.openforis.sepal.component.workerinstance.WorkerInstanceConfig
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.api.WorkerReservation
import org.openforis.sepal.util.DateTime
import org.openforis.sepal.util.JobScheduler
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.TimeUnit

final class GcpInstanceProvider implements InstanceProvider {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String SECURITY_GROUP = 'Sandbox'
    private static final int PUBLIC_IP_RETRIES = 300
    private final JobScheduler jobScheduler
    private final String currentSepalVersion
    private final String region
    private final String availabilityZone
    private final String environment
    // private final AmazonEC2Client client
    private final String imageId
    private final List<Closure> launchListeners = []

    GcpInstanceProvider(JobScheduler jobScheduler, GcpConfig config) {
    }

    List<WorkerInstance> launchIdle(String instanceType, int count) {
        return launch(instanceType, count).collect {
            tagInstance(it.instanceId, launchTags(), idleTags())
            return toWorkerInstance(it)
        }
    }

    WorkerInstance launchReserved(String instanceType, WorkerReservation reservation) {
        return null
    }

    void terminate(String instanceId) {
    }

    void reserve(WorkerInstance instance) {
    }

    void release(String instanceId) {
    }

    List<WorkerInstance> idleInstances(String instanceType) {
        return []
    }

    List<WorkerInstance> idleInstances() {
        return []
    }

    List<WorkerInstance> reservedInstances() {
        return []
    }

    WorkerInstance getInstance(String instanceId) {
        return null
    }

    void onInstanceLaunched(Closure listener) {
    }

    void start() {
    }

    void stop() {
    }

    void terminateUntagged() {
    }

    class UnableToGetImageId extends RuntimeException {
        UnableToGetImageId(String message) {
            super(message)
        }
    }

    class FailedToLaunchInstance extends RuntimeException {
        FailedToLaunchInstance(String message) {
            super(message)
        }
    }

    class FailedToTagInstance extends RuntimeException {
        FailedToTagInstance(String message, Exception e) {
            super(message, e)
        }
    }
}
