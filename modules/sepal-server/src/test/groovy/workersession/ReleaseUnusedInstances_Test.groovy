package workersession

class ReleaseUnusedInstances_Test extends AbstractWorkerSessionTest {
    def 'Given a session, when releasing unused instances, instance manager gets '() {
        def session = activeSession()

        when:
        releaseUnusedInstances()

        then:
        instanceManager.releasedUnused(session)
    }
}
