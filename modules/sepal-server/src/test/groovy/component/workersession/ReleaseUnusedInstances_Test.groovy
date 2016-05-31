package component.workersession

import static java.util.concurrent.TimeUnit.MINUTES

class ReleaseUnusedInstances_Test extends AbstractWorkerSessionTest {
    def 'Given a session, when releasing unused instances, instance manager gets '() {
        def session = ago(2, MINUTES) {
            activeSession()
        }

        when:
        releaseUnusedInstances(1, MINUTES)

        then:
        instanceManager.releasedUnused(session)
    }
}
