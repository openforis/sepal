package component.workerinstance

import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.api.WorkerReservation
import org.openforis.sepal.util.Clock

class FakeInstanceProvider implements InstanceProvider {
    private final Clock clock
    private final Map<String, WorkerInstance> launchedById = [:]
    private final Map<String, WorkerInstance> reservedById = [:]
    private final Map<String, WorkerInstance> idleById = [:]
    private final List<WorkerInstance> terminated = []
    private final List<Closure> launchListeners = []
    private boolean failing

    FakeInstanceProvider(Clock clock) {
        this.clock = clock
    }

    WorkerInstance launchReserved(String instanceType, WorkerReservation reservation) {
        if (failing)
            throw new IllegalStateException("Failed to launch instance")
        def instance = new WorkerInstance(
                id: UUID.randomUUID().toString(),
                type: instanceType,
                host: UUID.randomUUID().toString(),
                launchTime: clock.now(),
                reservation: reservation)
        launchedById[instance.id] = instance
        reservedById[instance.id] = instance
        return instance
    }

    void launchIdle(String instanceType, int count) {
        if (failing)
            throw new IllegalStateException("Failed to launch instance")
        count.times { launchOneIdle(instanceType) }
    }

    private void launchOneIdle(String instanceType) {
        def instance = new WorkerInstance(
                id: UUID.randomUUID().toString(),
                type: instanceType,
                host: UUID.randomUUID().toString(),
                launchTime: clock.now())
        launchedById[instance.id] = instance
        idleById[instance.id] = instance
    }

    void terminate(String instanceId) {
        if (failing)
            throw new IllegalStateException("Failed to terminate instance")
        def instance = launchedById.remove(instanceId)
        reservedById.remove(instanceId)
        idleById.remove(instanceId)
        terminated << instance
    }

    void reserve(WorkerInstance instance) {
        if (failing)
            throw new IllegalStateException("Failed to reserve instance")
        assert instance.reservation
        assert idleById.remove(instance.id),
                "Instance must be idle before it can be reserved"
        reservedById[instance.id] = instance
        launchedById[instance.id] = instance
    }

    void release(String instanceId) {
        if (failing)
            throw new IllegalStateException("Failed to release instance")
        def instance = reservedById.remove(instanceId)
        assert instance,
                "Instance must be reserved before it can be idle. Reserved instances: ${reservedById.values()}"
        def releasedInstance = instance.release()
        idleById[instanceId] = releasedInstance
        launchedById[instanceId] = releasedInstance
    }

    List<WorkerInstance> idleInstances(String instanceType) {
        idleInstances().findAll { it.type == instanceType }
    }

    List<WorkerInstance> idleInstances() {
        idleById.values().toList()
    }

    List<WorkerInstance> reservedInstances() {
        reservedById.values().toList()
    }

    WorkerInstance getInstance(String instanceId) {
        launchedById[instanceId]
    }

    void fail() {
        failing = true
    }

    void signalLaunched(WorkerInstance instance) {
        launchListeners*.call(instance)
    }

    WorkerInstance launchedOne() {
        assert allInstances().size() == 1,
                "Expected one instance to have been launched. Actually launched ${allInstances().size()}: ${allInstances()}"
        return allInstances().first()
    }

    WorkerInstance reservedOne() {
        assert reservedById.size() == 1,
                "Expected one instance to have been reserved. Actually reserved ${reservedById.size()}: ${reservedById.values()}"
        return reservedById.values().first()
    }

    void noIdle() {
        assert idleById.isEmpty(),
                "Expected no instance to be idle. Actually has ${idleById.size()} idle: ${idleById.values()}"
    }

    WorkerInstance oneIdle() {
        assert idleById.size() == 1,
                "Expected one instance to be idle. Actually has ${idleById.size()} idle: ${idleById.values()}"
        return idleById.values().first()
    }

    WorkerInstance terminatedOne() {
        assert terminated.size() == 1,
                "Expected one instance to be terminated. Actually terminated ${terminated.size()}: ${terminated}"
        return terminated.first()
    }

    void onInstanceLaunched(Closure listener) {
        launchListeners << listener
    }

    void start() {

    }

    void stop() {

    }

    private List<WorkerInstance> allInstances() {
        launchedById.values().toList()
    }
}
