package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.WorkerInstanceManager

import static org.openforis.sepal.component.sandboxmanager.SessionStatus.ACTIVE
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.STARTING

@ToString
class UpdateInstances extends AbstractCommand<Void> {

}

@ToString
class UpdateInstancesHandler implements CommandHandler<Void, UpdateInstances> {
    private final SessionRepository sessionRepository
    private final WorkerInstanceManager workerInstanceManager
    private final SandboxSessionProvider sandboxSessionProvider

    UpdateInstancesHandler(SessionRepository sessionRepository,
                           WorkerInstanceManager workerInstanceManager,
                           SandboxSessionProvider sandboxSessionProvider) {
        this.sessionRepository = sessionRepository
        this.workerInstanceManager = workerInstanceManager
        this.sandboxSessionProvider = sandboxSessionProvider
    }

    Void execute(UpdateInstances command) {
        def sessions = sessionRepository.findAllWithStatus([STARTING, ACTIVE])
        workerInstanceManager.updateInstances(sessions)
        return null
    }
}
