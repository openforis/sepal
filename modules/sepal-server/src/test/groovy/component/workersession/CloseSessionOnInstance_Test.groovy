package component.workersession

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED

class CloseSessionOnInstance_Test extends AbstractWorkerSessionTest {
    def 'Given a session, when closing session on instance, session is closed and instance is released'() {
        def session = pendingSession()

        when:
        closeSessionOnInstance(session.instance.id)

        then:
        oneSessionIs CLOSED
        instanceManager.releasedOne()
    }

    def 'Given closed session, when closing session on instance, no more session is closed or instance released'() {
        def session = closedSession()

        when:
        closeSessionOnInstance(session.instance.id)

        then:
        oneSessionIs CLOSED
        instanceManager.releasedOne()
    }
}
