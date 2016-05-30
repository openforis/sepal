package org.openforis.sepal.component.task.api

import groovy.transform.Immutable

@Immutable
class WorkerSession {
    String id
    String instanceType
    String username
    State state

    boolean isActive() {
        state == State.ACTIVE
    }

    WorkerSession activate() {
        return new WorkerSession(id: id, instanceType: instanceType, username: username, state: State.ACTIVE)
    }

    enum State {
        PENDING, ACTIVE, CLOSED
    }
}
