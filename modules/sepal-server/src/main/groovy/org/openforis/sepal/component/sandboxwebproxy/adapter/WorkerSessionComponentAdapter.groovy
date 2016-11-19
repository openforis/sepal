package org.openforis.sepal.component.sandboxwebproxy.adapter

import org.openforis.sepal.component.Component
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSession
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSessionManager
import org.openforis.sepal.component.workersession.api.InstanceType
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.command.Heartbeat
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.component.workersession.event.SessionClosed
import org.openforis.sepal.component.workersession.query.UserWorkerSessions

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.workertype.WorkerTypes.SANDBOX

class WorkerSessionComponentAdapter implements SandboxSessionManager {
    private final List<InstanceType> instanceTypes
    private final Component component

    WorkerSessionComponentAdapter(List<InstanceType> instanceTypes, Component component) {
        this.instanceTypes = instanceTypes
        this.component = component
    }

    SandboxSession requestSession(String username) {
        def instanceType = instanceTypes.first().id
        def session = component.submit(new RequestSession(
                instanceType: instanceType,
                workerType: SANDBOX,
                username: username
        ))
        return toSession(session)
    }

    SandboxSession heartbeat(String sessionId, String username) {
        def session = component.submit(new Heartbeat(
                sessionId: sessionId,
                username: username
        ))
        return toSession(session)
    }

    List<SandboxSession> findActiveSessions(String username) {
        def sessions = component.submit(new UserWorkerSessions(
                username: username,
                states: [ACTIVE],
                workerType: SANDBOX
        ))
        sessions.collect { toSession(it) }
    }

    private SandboxSession toSession(WorkerSession session) {
        return new SandboxSession(
                id: session.id,
                username: session.username,
                host: session.instance.host,
                active: session.active,
                closed: session.closed
        )
    }

    void onSessionClosed(Closure listener) {
        component.on(SessionClosed) {
            listener(it.sessionId)
        }
    }
}
