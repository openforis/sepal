package workersession

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED

class CloseUserSessions_Test extends AbstractWorkerSessionTest {
    def 'Given a session, when closing sessions for the user, session is closed and instance is released'() {
        pendingSession()

        when:
        closeUserSessions()

        then:
        oneSessionIs CLOSED
        instanceManager.releasedOne()
    }

    def 'Given two sessions for different users, when closing session for one user, session is closed and instance is released'() {
        pendingSession()
        pendingSession(username: 'another-username')

        when:
        closeUserSessions()

        then:
        oneSessionIs CLOSED
        instanceManager.releasedOne()
    }
}
