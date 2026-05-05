package component.workersession

import org.openforis.sepal.command.ExecutionFailed

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING
import static org.openforis.sepal.workertype.WorkerTypes.SANDBOX
import static org.openforis.sepal.workertype.WorkerTypes.TASK_EXECUTOR

class RequestSession_Test extends AbstractWorkerSessionTest {
    def 'When requesting session, budget is checked, instance is requested, a generated session id is returned, and session is pending'() {
        when:
        def session = requestSession()

        then:
        budgetManager.budgetChecked
        instanceManager.requestedOne()
        session
        oneSessionIs PENDING
    }

    def 'Given an exceeded budget, when requesting sandbox session, exception is thrown, user has no sessions, and no instance is requested'() {
        budgetManager.exceeded()

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

    def 'When requesting a SANDBOX session, an API key is minted and set on the returned session'() {
        when:
        def session = requestSession(workerType: SANDBOX)

        then:
        session.apiKey == 'test-api-key-1'
    }

    def 'When requesting a TASK_EXECUTOR session, no API key is minted'() {
        when:
        def session = requestSession(workerType: TASK_EXECUTOR)

        then:
        session.apiKey == null
    }
}
