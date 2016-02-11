package sandboxmanager

import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.WorkerInstanceProvider
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceType

class FakeWorkerInstanceProvider implements WorkerInstanceProvider {
    private final Map<String, WorkerInstance> instanceById = [:]
    private final Map<WorkerInstance, String> statusByInstance = [:]
    private boolean noIdle
    private String useId
    int terminationRequests

    List<WorkerInstanceType> instanceTypes = [new WorkerInstanceType(id: 'an-instance-type', hourlyCost: 1)]

    List<WorkerInstanceType> instanceTypes() {
        return instanceTypes
    }

    List<WorkerInstance> idleInstances(String instanceType) {
        if (noIdle)
            return []
        instanceById.values().findAll { statusByInstance[it] == 'idle' }
    }

    Map<String, Integer> idleCountByType() {
        def countByType = [:]
        def idleInstances = statusByInstance.findAll { it.value == 'idle' }.keySet()
        idleInstances.each {
            if (!countByType.containsKey(it.type))
                countByType[it.type] = 0
            countByType[it.type] = countByType[it.type] + 1
        }
        return countByType
    }

    WorkerInstance launch(String instanceType) {
        if (instanceById.containsKey(useId))
            return instanceById[useId]
        def instance = new WorkerInstance(
                id: useId ?: UUID.randomUUID().toString(),
                type: instanceType,
                host: UUID.randomUUID().toString()
        )
        instanceById[instance.id] = instance
        statusByInstance[instance] = 'uninitialized'
        return instance
    }

    void reserve(String instanceId, SandboxSession session) {
        changeState(instanceId, 'reserved', ['terminated', 'reserved'])
    }

    void idle(String instanceId) {
        changeState(instanceId, 'idle', ['idle', 'terminated'])
    }

    void terminate(String instanceId) {
        changeState(instanceId, 'terminated', ['terminated'])
        terminationRequests++
    }

    List<WorkerInstance> runningInstances(Collection<String> instanceIds) {
        return instanceIds
                .findAll { instanceById[it]?.running }
                .collect { instanceById[it] }
    }

    void addType(WorkerInstanceType instanceType) {
        if (!instanceTypes.find { it.id == instanceType.id })
            instanceTypes << instanceType
    }

    WorkerInstance launchedOne() {
        assert instanceById.size() == 1
        return instanceById.values().first()
    }

    void has(String instanceType, LinkedHashMap<String, Integer> expectedCountByStatus) {
        assertCountByStatus(statusByInstance.findAll { it.key.type == instanceType }, expectedCountByStatus)
    }

    void has(LinkedHashMap<String, Integer> expectedCountByStatus) {
        assertCountByStatus(statusByInstance, expectedCountByStatus)
    }

    private void assertCountByStatus(
            Map<WorkerInstance, String> statusByInstance,
            LinkedHashMap<String, Integer> expectedCountByStatus
    ) {
        def countByStatus = [:]
        statusByInstance.each { instance, status ->
            if (!countByStatus.containsKey(status))
                countByStatus[status] = 0
            countByStatus[status] = countByStatus[status] + 1
        }

        assert countByStatus == expectedCountByStatus

    }

    private void changeState(String instanceId, String state, ArrayList<String> disallowedStates) {
        def instance = instanceById[instanceId]
        if (!instance)
            throw new IllegalStateException("Instance doesn't exist: $instanceId")
        if (statusByInstance[instance] in disallowedStates)
            throw new IllegalStateException("Unexpected instance state: ${statusByInstance[instance]}")
        statusByInstance[instance] = state
    }

    void noIdle() {
        noIdle = true
    }

    WorkerInstance launchIdle(String instanceType) {
        def instance = launch(instanceType)
        idle(instance.id)
        instance.running = true
        return instance
    }

    WorkerInstance launchReserved(String instanceType, SandboxSession session) {
        def instance = launch(instanceType)
        reserve(instance.id, session)
        instance.running = true
        return instance
    }

    void useId(String instanceId) {
        useId = instanceId
    }

    WorkerInstance runningIdle(String instanceType) {
        def instance = launch(instanceType)
        idle(instance.id)
        instance.running = true
        return instance
    }

    WorkerInstance started(String instanceId) {
        def instance = instanceById[instanceId]
        instance.running = true
        return instance
    }
}