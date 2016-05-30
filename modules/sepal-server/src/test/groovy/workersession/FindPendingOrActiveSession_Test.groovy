package workersession

class FindPendingOrActiveSession_Test extends AbstractWorkerSessionTest {
    def 'Given pending session, when finding session, session is returned'() {
        def session = pendingSession()

        when:
        def foundSession = findActiveOrPendingSession()

        then:
        foundSession == session
    }

    def 'Given active session, when finding session, session is returned'() {
        def session = activeSession()

        when:
        def foundSession = findActiveOrPendingSession()

        then:
        foundSession == session
    }

    def 'Given closed session, when finding session, no session is returned'() {
        closedSession()

        expect:
        !findActiveOrPendingSession()
    }

    def 'Given both pending and active sessions, when finding session, active session is returned'() {
        pendingSession()
        def activeSession = activeSession()
        pendingSession()

        when:
        def foundSession = findActiveOrPendingSession()

        then:
        foundSession == activeSession
    }
}
