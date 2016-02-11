package org.openforis.sepal.component.sandboxmanager.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.hostingservice.WorkerInstanceManager

class DeployStartingSessions extends AbstractCommand<Void> {

}

class DeployStartingSessionsHandler implements CommandHandler<Void, DeployStartingSessions> {
    private final SessionRepository sessionRepository
    private final WorkerInstanceManager instanceManager
    private final SandboxSessionProvider sandboxProvider

    DeployStartingSessionsHandler(SessionRepository sessionRepository, WorkerInstanceManager instanceManager, SandboxSessionProvider sandboxProvider) {
        this.sessionRepository = sessionRepository
        this.instanceManager = instanceManager
        this.sandboxProvider = sandboxProvider
    }

    Void execute(DeployStartingSessions command) {
        def startingSessions = sessionRepository.findStartingSessions()
        def sessionsByInstanceId = startingSessions.groupBy { it.instanceId }
        def runningInstances = instanceManager.runningInstances(sessionsByInstanceId.keySet())
        runningInstances.each { instance ->
            sessionsByInstanceId[instance.id].each { session ->
                sandboxProvider.deploy(session, instance)
            }
        }
        return null
    }
}
