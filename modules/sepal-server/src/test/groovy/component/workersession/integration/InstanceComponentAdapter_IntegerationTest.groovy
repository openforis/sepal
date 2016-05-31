package component.workersession.integration

import component.workerinstance.AbstractWorkerInstanceTest
import org.openforis.sepal.component.workersession.adapter.InstanceComponentAdapter
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSession

class InstanceComponentAdapter_IntegerationTest extends AbstractWorkerInstanceTest {
    def adapter = new InstanceComponentAdapter(component)

    def 'When requesting instance, instance is requested'() {
        when:
        def instance = adapter.requestInstance(session())

        then:
        def launchedInstance = instanceProvider.launchedOne()
        instance == new WorkerInstance(id: launchedInstance.id, host: launchedInstance.host)
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
