package org.openforis.sepal.component.task

import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.component.sandboxmanager.event.SessionClosed
import org.openforis.sepal.component.sandboxmanager.event.SessionCreated
import org.openforis.sepal.component.sandboxmanager.event.SessionDeployed
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.util.Clock
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.sandboxmanager.SessionStatus.ACTIVE

class TaskManager {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SessionRepository sessionRepository
    private final WorkerInstanceManager instanceManager
    private final SandboxSessionProvider sessionProvider
    private final EventDispatcher eventDispatcher
    private final Clock clock

    TaskManager(
            SessionRepository sessionRepository,
            WorkerInstanceManager instanceManager,
            SandboxSessionProvider sessionProvider,
            EventDispatcher eventDispatcher,
            Clock clock) {
        this.sessionRepository = sessionRepository
        this.instanceManager = instanceManager
        this.sessionProvider = sessionProvider
        this.eventDispatcher = eventDispatcher
        this.clock = clock
    }

    SandboxSession submit(Task task, String username, String instanceType) {
        def pendingSession = sessionRepository.create(username, instanceType)
        def session = instanceManager.allocate(pendingSession) { WorkerInstance instance ->
            deploy(pendingSession, instance)
        }
        sessionRepository.update(session)
        eventDispatcher.publish(new SessionCreated(session))
        if (session.status == ACTIVE)
            eventDispatcher.publish(new SessionDeployed(session))
        return session

    }

    private SandboxSession deploy(SandboxSession pendingSession, WorkerInstance instance) {
        try {
            return sessionProvider.deploy(pendingSession, instance)
        } catch (Exception e) {
            closeSilently(pendingSession.starting(instance))
            throw e
        }
    }

    private void closeSilently(SandboxSession session) {
        if (instanceManager.isSessionInstanceAvailable(session.id)) {
            undeploy(session)
            deallocate(session)
        }
        markAsClosedInRepository(session)
        eventDispatcher.publish(new SessionClosed(session))
    }

    private void undeploy(SandboxSession session) {
        try {
            sessionProvider.undeploy(session)
        } catch (Exception e) {
            LOG.warn("Closing session - Failed to undeploy session. Session: $session", e)
        }
    }

    private void deallocate(SandboxSession session) {
        if (!session.instanceId)
            return
        try {
            instanceManager.deallocate(session.instanceId)
        } catch (Exception e) {
            LOG.warn("Closing session - Failed to deallocate instance. Session: $session", e)
        }
    }

    private markAsClosedInRepository(SandboxSession session) {
        try {
            sessionRepository.close(session)
        } catch (Exception e) {
            LOG.warn("Closing session - Failed to mark session as closed in repository. Session: $session", e)
        }
    }
}
