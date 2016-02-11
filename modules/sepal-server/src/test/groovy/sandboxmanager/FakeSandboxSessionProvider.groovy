package sandboxmanager

import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.util.Clock

class FakeSandboxSessionProvider implements SandboxSessionProvider {
    Map<WorkerInstance, List<SandboxSession>> deployed = [:]
    boolean fail
    boolean notAvailable
    private final Clock clock

    FakeSandboxSessionProvider(Clock clock) {
        this.clock = clock
    }

    SandboxSession deploy(SandboxSession session, WorkerInstance instance) {
        if (fail)
            throw new RuntimeException('A test triggered sandbox deployment failure')
        def activeSession = session.deployed(instance, new Random().nextInt(), clock.now())
        if (!deployed[instance])
            deployed[instance] = []
        deployed[instance] << activeSession
        return activeSession
    }

    void undeploy(SandboxSession session) {
        deployed.values().each { sessions ->
            sessions.removeIf { it.id == session.id }
        }
    }

    void assertAvailable(SandboxSession sandboxSession) throws SandboxSessionProvider.NotAvailable {
        if (notAvailable)
            throw new SandboxSessionProvider.NotAvailable(sandboxSession.id, 'Sandbox is not available')
    }

    SandboxSession deployedOneTo(WorkerInstance instance) {
        def sessions = deployed[instance]
        assert sessions, "No sessions deployed to $instance"
        assert sessions.size() == 1
        return sessions.first()
    }

    void noneDeployed() {
        assert deployed.values().every { it.empty }
    }

    void failing() {
        fail = true
    }

    void notAvailable() {
        notAvailable = true
    }
}
