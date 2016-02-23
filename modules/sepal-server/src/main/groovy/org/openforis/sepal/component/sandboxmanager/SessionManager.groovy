package org.openforis.sepal.component.sandboxmanager

import org.openforis.sepal.component.sandboxmanager.event.SessionAlive
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
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.STARTING

class SessionManager {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SessionRepository sessionRepository
    private final WorkerInstanceManager instanceManager
    private final SandboxSessionProvider sessionProvider
    private final EventDispatcher eventDispatcher
    private final Clock clock

    SessionManager(
            SessionRepository sessionRepository,
            WorkerInstanceManager instanceManager,
            SandboxSessionProvider sessionProvider,
            EventDispatcher eventDispatcher,
            Clock clock
    ) {
        this.sessionRepository = sessionRepository
        this.instanceManager = instanceManager
        this.sessionProvider = sessionProvider
        this.eventDispatcher = eventDispatcher
        this.clock = clock
    }

    SandboxSession load(long sessionId) {
        sessionRepository.getById(sessionId)
    }

    SandboxSession create(String username, String instanceType) {
        def pendingSession = sessionRepository.create(username, instanceType)
        withSession(pendingSession) {
            def session = instanceManager.allocate(pendingSession) { WorkerInstance instance ->
                deploy(pendingSession, instance)
            }
            sessionRepository.update(session)
            eventDispatcher.publish(new SessionCreated(session))
            if (session.status == ACTIVE)
                eventDispatcher.publish(new SessionDeployed(session))
            return session
        }
    }

    SandboxSession alive(SandboxSession session) throws SessionFailed {
        withSession(session) {
            assertInstanceAvailable(session)
            assertSandboxAvailable(session)
            def aliveSession = session.alive(clock.now())
            sessionRepository.alive(aliveSession.id, aliveSession.updateTime)
            eventDispatcher.publish(new SessionAlive(aliveSession))
            return aliveSession
        }
    }

    void close(SandboxSession session) {
        closeSilently(session)
    }

    void closeTimedOut(Date updatedBefore) {
        sessionRepository.closeAllTimedOut(updatedBefore) { SandboxSession session ->
            closeSilently(session)
        }
    }

    void deployStartingSessions() {
        def startingSessions = sessionRepository.findStartingSessions()
        if (!startingSessions)
            return
        def sessionsByInstanceId = startingSessions.groupBy { it.instanceId }
        def runningInstances = instanceManager.runningInstances(sessionsByInstanceId.keySet())
        runningInstances.each { instance ->
            sessionsByInstanceId[instance.id].each { session ->
                withSession(session) {
                    def deployedSession = sessionProvider.deploy(session, instance)
                    sessionRepository.update(deployedSession)
                    eventDispatcher.publish(new SessionDeployed(session))
                }
            }
        }
    }

    void updateInstanceStates() {
        def sessions = sessionRepository.findAllWithStatus([STARTING, ACTIVE])
        instanceManager.updateInstances(sessions)
    }

    private void closeSilently(SandboxSession session) {
        if (instanceManager.isSessionInstanceAvailable(session.id)) {
            undeploy(session)
            deallocate(session)
        }
        markAsClosedInRepository(session)
        eventDispatcher.publish(new SessionClosed(session))
    }

    private SandboxSession deploy(SandboxSession pendingSession, WorkerInstance instance) {
        try {
            return sessionProvider.deploy(pendingSession, instance)
        } catch (Exception e) {
            closeSilently(pendingSession.starting(instance))
            throw e
        }
    }

    private markAsClosedInRepository(SandboxSession session) {
        try {
            sessionRepository.close(session)
        } catch (Exception e) {
            LOG.warn("Closing session - Failed to mark session as closed in repository. Session: $session", e)
        }
    }

    private void undeploy(SandboxSession session) {
        try {
            sessionProvider.undeploy(session)
        } catch (Exception e) {
            LOG.warn("Closing session - Failed to undeploy session. Session: $session", e)
        }
    }

    private void deallocate(SandboxSession session) {
        try {
            instanceManager.deallocate(session.instanceId)
        } catch (Exception e) {
            LOG.warn("Closing session - Failed to deallocate instance. Session: $session", e)
        }
    }

    private <T> T withSession(SandboxSession session, Closure closure) {
        try {
            closure.call(session)
        } catch (Exception e) {
            closeSilently(session)
            throw new SessionFailed(session, e)
        }
    }

    private void assertSandboxAvailable(SandboxSession session) {
        if (session.status == ACTIVE)
            sessionProvider.assertAvailable(session)
    }

    private void assertInstanceAvailable(SandboxSession session) {
        if (!instanceManager.isSessionInstanceAvailable(session.id)) {
            throw new SessionFailed(session, "Instance not available for session $session")
        }
    }
}
