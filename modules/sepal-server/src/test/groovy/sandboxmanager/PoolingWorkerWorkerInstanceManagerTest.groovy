package sandboxmanager

import fake.SynchronousJobExecutor
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceType
import spock.lang.Specification
import spock.lang.Unroll

import static org.openforis.sepal.component.sandboxmanager.SessionStatus.*

class PoolingWorkerWorkerInstanceManagerTest extends Specification {
    def clock = new FakeClock()
    def instanceTypes = [
            new WorkerInstanceType(id: 'type0', hourlyCost: 1),
            new WorkerInstanceType(id: 'type1', hourlyCost: 1),
            new WorkerInstanceType(id: 'type2', hourlyCost: 1),
    ]
    def provider = new FakeWorkerInstanceProvider(instanceTypes: instanceTypes, clock: clock)


    def 'Given no idle instances, when updating instances, the idle instances is allocated'() {
        def idleCountByType = [type0: 2, type1: 1]

        when:
        instanceManager(idleCountByType).updateInstances([])

        then:
        provider.has 'type0', [idle: 2]
        provider.has 'type1', [idle: 1]
        provider.has 'type2', [:]
    }

    def 'Given already idle instances, when updating instances, no instance is allocated'() {
        def idleCountByType = [type0: 2, type1: 1]
        2.times { provider.launchIdle('type0') }
        1.times { provider.launchIdle('type1') }

        when:
        instanceManager(idleCountByType).updateInstances([])

        then:
        provider.has 'type0', [idle: 2]
        provider.has 'type1', [idle: 1]
        provider.has 'type2', [:]
    }

    def 'When instance is reserved, a new idle instance is started'() {
        def instanceManager = instanceManager(type0: 1)
        instanceManager.updateInstances([])
        provider.launchIdle('type0')

        when:
        instanceManager.allocate(pendingSession('type0'), { return null })

        then:
        provider.has 'type0', [idle: 1, reserved: 1]
    }

    def 'Given fewer idle instances than expected and one reserved but unused for 5 minutes, when updating instances, reserved instance is turned idle'() {
        clock.set('2016-01-01', '00:00:00')
        def instanceManager = instanceManager(type0: 1)
        launchReserved()
        clock.set('2016-01-01', '00:05:00')

        when:
        instanceManager.updateInstances([])

        then:
        provider.has(idle: 1)
    }

    def 'Given fewer idle instances than expected and one reserved but unused less than 5 minutes, when updating instances, reserved instance says reserved'() {
        clock.set('2016-01-01', '00:00:00')
        def instanceManager = instanceManager(type0: 1)
        launchReserved()
        clock.set('2016-01-01', '00:04:59')

        when:
        instanceManager.updateInstances([])

        then:
        provider.has(idle: 1, reserved: 1,)
    }

    def 'Given fewer idle instances than expected and one reserved, when updating instances, there still is one reserved instance and an idle is launched'() {
        def instanceManager = instanceManager(type0: 1)
        def session = launchReserved()

        when:
        instanceManager.updateInstances([session])

        then:
        provider.has(idle: 1, reserved: 1)
    }

    def 'Given a starting and running idle instance, when allocating an instance, the running instance is used'() {
        def startingInstance = provider.launchIdle('type0')
        startingInstance.running = false
        def runningInstance = provider.launchIdle('type0')
        runningInstance.running = true


        when:
        def session = instanceManager([:]).allocate(pendingSession()) {
            new SandboxSession(status: ACTIVE, instanceId: it.id)
        }

        then:
        session.instanceId == runningInstance.id
    }

    def 'Given no idle instances, when updating instances, one idle is started'() {
        provider.launchIdle('type0')

        when:
        instanceManager([type0: 1]).updateInstances([])

        then:
        provider.has(idle: 1)
    }

    private SandboxSession pendingSession(String instanceType = 'type0') {
        new SandboxSession(status: PENDING, instanceType: instanceType)
    }

    @Unroll
    def 'Launched #launchTime and updated #updateTime is #terminated'(String launchTime, String updateTime, String terminated) {
        def instanceManager = instanceManager([type0: 0])
        clock.set('2016-01-01', launchTime)
        provider.launchIdle('type0')
        clock.set('2016-01-01', updateTime)


        when:
        instanceManager.updateInstances([])

        then:
        if (terminated == 'terminated')
            provider.has([terminated: 1])
        else
            provider.has([idle: 1])

        where:
        launchTime | updateTime || terminated
        '00:00:00' | '00:00:00' || 'not terminated'
        '00:00:00' | '05:00:01' || 'not terminated'
        '00:00:00' | '05:54:59' || 'not terminated'
        '00:00:00' | '05:55:00' || 'terminated'
        '00:00:00' | '05:59:59' || 'terminated'
        '01:01:00' | '05:55:59' || 'not terminated'
        '01:01:00' | '05:56:00' || 'terminated'
    }

    private SandboxSession launchReserved() {
        def instance = provider.launchIdle('type0')
        def session = startingSession(instance)
        provider.reserve(instance.id, session)
        return session
    }

    private SandboxSession startingSession(WorkerInstance instance) {
        new SandboxSession(status: STARTING, instanceId: instance.id, instanceType: instance.type)
    }

    private PoolingWorkerInstanceManager instanceManager(LinkedHashMap<String, Integer> idleInstanceCountByInstanceType) {
        new PoolingWorkerInstanceManager(provider, idleInstanceCountByInstanceType, new SynchronousJobExecutor(), clock)
    }
}
