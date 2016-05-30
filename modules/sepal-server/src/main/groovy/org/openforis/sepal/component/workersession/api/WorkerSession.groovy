package org.openforis.sepal.component.workersession.api

import groovy.transform.Immutable

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.*

@Immutable
class WorkerSession {
    String id
    State state
    String username
    String workerType
    String instanceType
    WorkerInstance instance
    Date creationTime
    Date updateTime

    boolean isPending() {
        state == PENDING
    }

    boolean isActive() {
        state == ACTIVE
    }

    WorkerSession activate() {
        update(ACTIVE)
    }

    boolean isClosed() {
        state == CLOSED
    }

    WorkerSession close() {
        update(CLOSED)
    }

    WorkerSession withInstance(WorkerInstance instance) {
        new WorkerSession(
                id: id,
                state: state,
                username: username,
                workerType: workerType,
                instanceType: instanceType,
                instance: instance,
                creationTime: creationTime,
                updateTime: updateTime
        )
    }

    WorkerSession update(State state) {
        new WorkerSession(
                id: id,
                state: state,
                username: username,
                workerType: workerType,
                instanceType: instanceType,
                instance: instance,
                creationTime: creationTime,
                updateTime: updateTime
        )
    }

    enum State {
        PENDING, ACTIVE, CLOSED
    }
}
