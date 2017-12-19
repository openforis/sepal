package component.workersession

class SetEarliestTimeoutTime_Test extends AbstractWorkerSessionTest {
    def 'Earliest timeout time is included when listing sessions'() {
        def session = activeSession()
        def earliestTimeoutTime = clock.now() + 1

        when:
        setEarliestTimeoutTime(session, earliestTimeoutTime)

        then:
        def sessions = userWorkerSessions()
        sessions.size() == 1
        sessions.first().earliestTimeoutTime == earliestTimeoutTime
    }
}
