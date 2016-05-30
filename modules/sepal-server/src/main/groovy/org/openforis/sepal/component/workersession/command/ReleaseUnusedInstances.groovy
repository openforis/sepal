package org.openforis.sepal.component.workersession.command

import groovy.transform.Immutable
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

@Immutable
class ReleaseUnusedInstances extends AbstractCommand<Void> {

}

class ReleaseUnusedInstancesHandler implements CommandHandler<Void, ReleaseUnusedInstances> {
    private final WorkerSessionRepository repository
    private final InstanceManager instanceManager

    ReleaseUnusedInstancesHandler(WorkerSessionRepository repository, InstanceManager instanceManager) {
        this.repository = repository
        this.instanceManager = instanceManager
    }

    Void execute(ReleaseUnusedInstances command) {
        def sessions = repository.pendingOrActiveSessions()
        instanceManager.releaseUnused(sessions)
        return null
    }
}
