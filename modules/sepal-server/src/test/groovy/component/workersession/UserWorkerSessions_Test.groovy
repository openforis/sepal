package component.workersession

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING


class UserWorkerSessions_Test extends AbstractWorkerSessionTest {
    def 'Given a pending session, when listing sessions, session is returned'() {
        pendingSession()

        when:
        def sessions = userWorkerSessions()

        then:
        sessions.size() == 1
    }

    def 'Given a pending session and active session, when listing sessions, sessions are returned'() {
        pendingSession()
        activeSession()

        when:
        def sessions = userWorkerSessions()

        then:
        sessions.size() == 2
        sessions.first().pending
        sessions.last().active
    }

    def 'Given a pending session and active session, when listing pending sessions, only pending session is returned'() {
        pendingSession()
        activeSession()

        when:
        def sessions = userWorkerSessions(states: [PENDING])

        then:
        sessions.size() == 1
        sessions.first().pending
    }

    def 'Given a closed session, when listing sessions, session is returned and closed'() {
        closedSession()

        when:
        def sessions = userWorkerSessions()

        then:
        sessions.size() == 1
        sessions.first().closed
    }
}
