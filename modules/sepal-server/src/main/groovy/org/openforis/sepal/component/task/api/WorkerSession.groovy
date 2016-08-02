package org.openforis.sepal.component.task.api

import org.openforis.sepal.util.annotation.ImmutableData

import static org.openforis.sepal.component.task.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.task.api.WorkerSession.State.CLOSED

@ImmutableData
class WorkerSession {
    String id
    String instanceType
    String username
    String host
    State state

    boolean isActive() {
        state == ACTIVE
    }

    WorkerSession activate() {
        return update(ACTIVE)
    }

    WorkerSession close() {
        return update(CLOSED)
    }

    private WorkerSession update(State state) {
        return new WorkerSession(
                id: id,
                instanceType: instanceType,
                username: username,
                host: host,
                state: state)
    }

    enum State {
        PENDING, ACTIVE, CLOSED
    }
}
