package component.workersession

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED

class CloseTimedOutSessions_Test extends AbstractWorkerSessionTest {
    def 'Given a timed out session with no earliest timeout set, when closing timed out sessions, session is closed and instance is released'() {
        timedOutActiveSession()

        when:
        closeTimedOutSessions()

        then:
        oneSessionIs CLOSED
        instanceManager.releasedOne()
    }

    def 'Given a timed out session and earliest timeout time is in the past, when closing timed out sessions, session is closed and instance is released'() {
        timedOutActiveSession(earliestTimeoutTime: clock.now() - 1)

        when:
        closeTimedOutSessions()

        then:
        oneSessionIs CLOSED
        instanceManager.releasedOne()
    }

    def 'Given a timed out session with earliest timeout time in the future, when closing timed out sessions, session is not closed, instance is not released'() {
        timedOutActiveSession(earliestTimeoutTime: clock.now() + 1)

        when:
        closeTimedOutSessions()

        then:
        oneSessionIs ACTIVE
        instanceManager.releasedNone()
    }

    def 'Given a not timed out session with no earliest timeout set, when closing timed out sessions, instance is not released'() {
        activeSession()

        when:
        closeTimedOutSessions()

        then:
        noSessionIs CLOSED
        instanceManager.releasedNone()
    }

    def 'Given a not timed out session but active with earliest timeout in past, when closing timed out sessions, instance is not released'() {
        activeSession(earliestTimeoutTime: clock.now() - 1)

        when:
        closeTimedOutSessions()

        then:
        noSessionIs CLOSED
        instanceManager.releasedNone()
    }
}
