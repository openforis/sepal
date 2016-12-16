package component.workersession.integration

import component.workerinstance.AbstractWorkerInstanceTest
import org.openforis.sepal.component.workersession.adapter.InstanceComponentAdapter
import org.openforis.sepal.component.workersession.api.InstanceType
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSession

import static java.util.concurrent.TimeUnit.MINUTES

@SuppressWarnings("GrReassignedInClosureLocalVar")
class InstanceComponentAdapter_IntegerationTest extends AbstractWorkerInstanceTest {
    def instanceTypes = []
    def adapter = new InstanceComponentAdapter(instanceTypes, component)

    def 'When requesting instance, instance is requested'() {
        when:
        def instance = adapter.requestInstance(session())

        then:
        def launchedInstance = instanceProvider.launchedOne()
        instance == new WorkerInstance(id: launchedInstance.id, host: launchedInstance.host)
    }

    def 'When releasing instance, instance is released'() {
        def instance = provisionedInstance()

        when:
        adapter.releaseInstance(instance.id)

        then:
        instanceProvider.oneIdle()
    }

    def 'When releasing unused instances, unused instance is released'() {
        ago(2, MINUTES) {
            requestInstance()
        }

        when:
        adapter.releaseUnusedInstances([], 1, MINUTES)

        then:
        instanceProvider.oneIdle()
    }

    def 'When instance is provisioned, instance activated callback is invoked'() {
        def activatedInstance = null
        adapter.onInstanceActivated { activatedInstance = it }

        when:
        def instance = provisionedInstance()

        then:
        activatedInstance == new WorkerInstance(id: instance.id, host: instance.host)
    }

    def 'When getting instance types, instance types are returned'() {
        instanceTypes << new InstanceType(id: 'some-instance-type')

        expect:
        adapter.instanceTypes == instanceTypes
    }

    def 'When provisioning fails, instance request failure callback is invoked'() {
        def instance = requestInstance()
        instanceProvisioner.fail()

        def failedInstance = null
        adapter.onFailedToProvisionInstance { failedInstance = it }

        when:
        provisionInstance(instance)

        then:
        failedInstance == new WorkerInstance(id: instance.id, host: instance.host)
        thrown Exception
    }

    def 'Given session without instance, when getting sessions without instance, session is returned'() {
        def sessions = [session(instance: new WorkerInstance('instance-id', 'instance-host'))]

        when:
        def result = adapter.sessionsWithoutInstance(sessions)

        then:
        result == sessions
    }

    def 'Given session with instance, when getting sessions without instance, session is not returned'() {
        def session = session()
        instanceProvider.launchIdle(session.instanceType, 1)
        def instance = adapter.requestInstance(session)
        session = session.withInstance(instance)

        when:
        def result = adapter.sessionsWithoutInstance([session])

        then:
        !result
    }


    private WorkerSession session(Map args = [:]) {
        new WorkerSession(
                id: UUID.randomUUID().toString(),
                state: WorkerSession.State.PENDING,
                workerType: args.workerType ?: testWorkerType,
                instanceType: args.instanceType ?: testInstanceType,
                instance: args.instance,
                username: username(args),
                creationTime: clock.now(),
                updateTime: clock.now()
        )
    }
}
