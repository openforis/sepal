package workersession

import org.openforis.sepal.command.ExecutionFailed

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED

class CloseSession_Test extends AbstractWorkerSessionTest {
    def 'When closing a session, session is closed and instance is released'() {
        def session = requestSession()

        when:
        closeSession(session)

        then:
        oneSessionIs CLOSED
        instanceManager.releasedOne()
    }

    def 'Given a session, when other user close the session, session is not closed, and execution fails'() {
        def session = requestSession(username: 'another-username')

        when:
        closeSession(session)

        then:
        noSessionIs CLOSED
        thrown ExecutionFailed
    }
}
