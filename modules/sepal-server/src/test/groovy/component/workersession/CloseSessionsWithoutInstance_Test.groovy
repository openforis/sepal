package component.workersession

import org.openforis.sepal.component.workersession.event.SessionClosed

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED

class CloseSessionsWithoutInstance_Test extends AbstractWorkerSessionTest {
    def 'Given an active session without instance, when executing, session is closed and event is published'() {
        def session = activeSession()
        instanceManager.releaseInstance(session.instance.id)

        when:
        closeSessionsWithoutInstances()

        then:
        oneSessionIs CLOSED
        published SessionClosed
    }

    def 'Given an active session with instance, when executing, session is not closed'() {
        activeSession()

        when:
        closeSessionsWithoutInstances()

        then:
        oneSessionIs ACTIVE
    }
}
