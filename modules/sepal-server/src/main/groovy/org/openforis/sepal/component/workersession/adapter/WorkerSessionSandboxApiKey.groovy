package org.openforis.sepal.component.workersession.adapter

import org.openforis.sepal.component.workerinstance.api.SandboxSessionApiKey
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

class WorkerSessionSandboxApiKey implements SandboxSessionApiKey {
    private final WorkerSessionRepository sessionRepository

    WorkerSessionSandboxApiKey(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    // Retries cover the reserveIdle race: InstancePendingProvisioning fires before RequestSessionHandler commits the row.
    String apiKeyForInstance(String instanceId) {
        for (int attempt = 0; attempt < 5; attempt++) {
            def session = sessionRepository.sessionOnInstance(instanceId, [WorkerSession.State.PENDING, WorkerSession.State.ACTIVE])
            if (session) return session.apiKey
            Thread.sleep(50)
        }
        null
    }
}
