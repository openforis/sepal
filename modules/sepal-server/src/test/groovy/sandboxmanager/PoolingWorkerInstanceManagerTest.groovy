package sandboxmanager

import fake.SynchronousJobExecutor
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceType
import spock.lang.Specification

class PoolingWorkerInstanceManagerTest extends Specification {
    def instanceTypes = [
            new WorkerInstanceType(id: 'type0', hourlyCost: 1),
            new WorkerInstanceType(id: 'type1', hourlyCost: 1),
            new WorkerInstanceType(id: 'type2', hourlyCost: 1),
    ]
    def provider = new FakeWorkerInstanceProvider(instanceTypes: instanceTypes)


    def 'Given no idle instances, when starting provider, the idle instances is allocated'() {
        def idleCountByType = [type0: 2, type1: 1]

        when:
        instanceManager(idleCountByType).start()

        then:
        provider.has 'type0', [idle: 2]
        provider.has 'type1', [idle: 1]
        provider.has 'type2', [:]
    }

    def 'Given already idle instances, when starting provider, no instance is allocated'() {
        def idleCountByType = [type0: 2, type1: 1]
        2.times { provider.launchIdle('type0') }
        1.times { provider.launchIdle('type1') }

        when:
        instanceManager(idleCountByType).start()

        then:
        provider.has 'type0', [idle: 2]
        provider.has 'type1', [idle: 1]
        provider.has 'type2', [:]
    }

    def 'When instance is reserved, a new idle instance is started'() {
        def idleCountByType = [type0: 1]
        provider.launchIdle('type0')
        def instanceManager = instanceManager(idleCountByType).start()

        when:
        instanceManager.allocate(new SandboxSession(instanceType: 'type0'), { return null })

        then:
        provider.has 'type0', [idle: 1, reserved: 1]
    }

    def 'Given enough idle instances, when instance is offered for termination, it is terminated'() {
        def idleCountByType = [type0: 1]
        def instanceManager = instanceManager(idleCountByType).start()
        def instance = provider.launchIdle('type0')

        when:
        instanceManager.terminate(instance.id, instance.type)

        then:
        provider.has 'type0', [idle: 1, terminated: 1]
    }

    def 'Given lack of idle instances, when instance is offered for termination, it is marked as idle'() {
        def idleCountByType = [type0: 1]
        def instanceManager = instanceManager(idleCountByType).start()
        def instance = provider.launchIdle('type0')
        def instance2 = provider.launchIdle('type0')
        provider.terminate(instance.id)

        when:
        instanceManager.terminate(instance2.id, instance.type)

        then:
        provider.has 'type0', [idle: 1, terminated: 2]
    }

    private PoolingWorkerInstanceManager instanceManager(LinkedHashMap<String, Integer> idleInstanceCountByInstanceType) {
        new PoolingWorkerInstanceManager(provider, idleInstanceCountByInstanceType, new SynchronousJobExecutor())
    }
}
