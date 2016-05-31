package component.workersession.integration

import component.workerinstance.AbstractWorkerInstanceTest
import org.openforis.sepal.component.workersession.adapter.InstanceComponentAdapter
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSession

import static java.util.concurrent.TimeUnit.MINUTES

class InstanceComponentAdapter_IntegerationTest extends AbstractWorkerInstanceTest {
    def adapter = new InstanceComponentAdapter(component)

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

    @SuppressWarnings("GrReassignedInClosureLocalVar")
    def 'When instance is provisioned, instance activated callback is invoked'() {
        def activatedInstance = null
        adapter.onInstanceActivated { activatedInstance = it }

        when:
        def instance = provisionedInstance()

        then:
        activatedInstance == new WorkerInstance(id: instance.id, host: instance.host)
    }

    private WorkerSession session(Map args = [:]) {
        new WorkerSession(
                id: UUID.randomUUID().toString(),
                state: WorkerSession.State.PENDING,
                workerType: args.workerType ?: testWorkerType,
                instanceType: args.instanceType ?: testInstanceType,
                username: username(args),
                creationTime: clock.now(),
                updateTime: clock.now()
        )
    }
}
