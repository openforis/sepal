package component.workersession

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED

class CloseTimedOutSessions_Test extends AbstractWorkerSessionTest {
    def 'Given a timed out session, when closing timed out sessions, session is closed and instance is released'() {
        timedOutSession()

        when:
        closeTimedOutSessions()

        then:
        oneSessionIs CLOSED
        instanceManager.releasedOne()
    }

    def 'Given a not timed out session, when closing timed out sessions, instance is not released'() {
        activeSession()

        when:
        closeTimedOutSessions()

        then:
        noSessionIs CLOSED
        instanceManager.releasedNone()
    }
}
