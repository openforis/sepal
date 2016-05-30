package workersession

import org.openforis.sepal.component.workersession.event.WorkerSessionActivated

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE

class InstanceActivation_Test extends AbstractWorkerSessionTest {
    def 'Given a pending session, when session instance is activated, session is active and event is published'() {
        def session = pendingSession()

        when:
        instanceManager.activate(session.instance.id)

        then:
        oneSessionIs ACTIVE
        published WorkerSessionActivated
    }
}
