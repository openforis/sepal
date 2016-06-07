package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.util.annotation.Data

import java.util.concurrent.TimeUnit

@Data(callSuper = true)
class ReleaseUnusedInstances extends AbstractCommand<Void> {
    int minAge
    TimeUnit timeUnit
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
        instanceManager.releaseUnusedInstances(sessions, command.minAge, command.timeUnit)
        return null
    }
}
