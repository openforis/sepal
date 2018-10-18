package org.openforis.sepal.component.workersession.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

import java.util.concurrent.TimeUnit

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
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
        def sessions = repository.sessions([PENDING, ACTIVE])
        instanceManager.releaseUnusedInstances(sessions, command.minAge, command.timeUnit)
        return null
    }
}
