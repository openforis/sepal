package workersession

import org.openforis.sepal.command.ExecutionFailed

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

class RequestSession_Test extends AbstractWorkerSessionTest {
    def 'When requesting sandbox session, budget is checked, instance is requested, a generated session id is returned, and session is pending'() {
        when:
        def sessionId = requestSession()

        then:
        budgetChecker.budgetChecked
        instanceManager.requestedOne()
        sessionId
        oneSessionIs PENDING
    }

    def 'Given an exceeded budget, when requesting sandbox session, exception is thrown, user has no sessions, and no instance is requested'() {
        budgetChecker.exceeded()

        when:
        requestSession()

        then:
        thrown ExecutionFailed
        noSessions()
        instanceManager.releasedNone()
    }

    def 'Given failing to request instance, when requesting sandbox session, exception is thrown, and user nas no sessions'() {
        instanceManager.fail()

        when:
        requestSession()

        then:
        thrown ExecutionFailed
        noSessions()
    }
}
