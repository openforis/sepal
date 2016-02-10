package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.WorkerInstanceManager

@ToString
class TerminateRedundantInstances extends AbstractCommand<Void> {

}

@ToString
class TerminateRedundantInstancesHandler implements CommandHandler<Void, TerminateRedundantInstances> {
    private final SessionRepository sessionRepository
    private final WorkerInstanceManager workerInstanceManager
    private final SandboxSessionProvider sandboxes

    TerminateRedundantInstancesHandler(SessionRepository sessionRepository,
                                       WorkerInstanceManager workerInstanceManager,
                                       SandboxSessionProvider sandboxes) {
        this.sessionRepository = sessionRepository
        this.workerInstanceManager = workerInstanceManager
        this.sandboxes = sandboxes
    }

    Void execute(TerminateRedundantInstances command) {
        sessionRepository.terminate { String instanceId, String instanceType ->
            workerInstanceManager.terminate(instanceId, instanceType)
        }
        return null
    }
}
