package component.task.integration

import component.workersession.AbstractWorkerSessionTest
import org.openforis.sepal.component.task.adapter.SessionComponentAdapter
import org.openforis.sepal.component.task.api.WorkerSession

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@SuppressWarnings("GrReassignedInClosureLocalVar")
class SessionComponentAdapter_IntegrationTest extends AbstractWorkerSessionTest {
    def adapter = new SessionComponentAdapter(component)

    def 'When requesting session, session is requested'() {
        when:
        def session = adapter.requestSession(testUsername, testInstanceType)

        then:
        budgetManager.budgetChecked
        def requestedInstance = instanceManager.requestedOne()
        def workerSession = oneSessionIs PENDING
        session == new WorkerSession(
                id: workerSession.id,
                instanceType: session.instanceType,
                username: session.username,
                host: requestedInstance.host,
                state: WorkerSession.State.PENDING
        )
    }

    def 'Given non-existing session, when finding pending or active session, null is returned'() {
        when:
        def session = adapter.findPendingOrActiveSession(testUsername, testInstanceType)

        then:
        session == null
    }

    def 'Given an existing session, when finding pending or active session, session is returned'() {
        def existingSession = adapter.requestSession(testUsername, testInstanceType)

        when:
        def session = adapter.findPendingOrActiveSession(testUsername, testInstanceType)

        then:
        existingSession == session
    }

    def 'When finding session by id, session is returned'() {
        def session = adapter.requestSession(testUsername, testInstanceType)

        when:
        def foundSession = adapter.findSessionById(session.id)

        then:
        foundSession == session
    }

    def 'When closing session, session is closed'() {
        def session = adapter.requestSession(testUsername, testInstanceType)

        when:
        adapter.closeSession(session.id)

        then:
        instanceManager.releasedOne()
        oneSessionIs CLOSED
    }

    def 'Given timed out session, when sending heartbeat, session is not considered timed out'() {
        def session = timedOutActiveSession()

        when:
        adapter.heartbeat(session.id)

        then:
        closeTimedOutSessions()
        oneSessionIs ACTIVE
    }

    def 'When session activates, session activated callback is invoked'() {
        def activatedSession = null
        adapter.onSessionActivated { activatedSession = it }


        when:
        def sessionId = activeSession().id

        then:
        activatedSession?.id == sessionId
    }
}
