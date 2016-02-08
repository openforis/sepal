package org.openforis.sepal.component.sandboxmanager

import org.openforis.sepal.hostingservice.WorkerInstance

interface SandboxSessionProvider {
    SandboxSession deploy(SandboxSession session, WorkerInstance workerInstance)

    void undeploy(SandboxSession session)

    void assertAvailable(SandboxSession sandboxSession) throws NotAvailable

    static class NotAvailable extends RuntimeException {
        final long sessionId

        NotAvailable(long sessionId, String message) {
            super(message)
            this.sessionId = sessionId
        }
    }
}