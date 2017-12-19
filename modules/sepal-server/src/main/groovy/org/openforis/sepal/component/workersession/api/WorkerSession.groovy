package org.openforis.sepal.component.workersession.api

import org.openforis.sepal.util.annotation.ImmutableData

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.*

@ImmutableData
class WorkerSession {
    String id
    State state
    String username
    String workerType
    String instanceType
    WorkerInstance instance
    Date earliestTimeoutTime
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
                earliestTimeoutTime: earliestTimeoutTime,
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
                earliestTimeoutTime: earliestTimeoutTime,
                creationTime: creationTime,
                updateTime: updateTime
        )
    }

    WorkerSession withEarliestTimeoutTime(Date time) {
        new WorkerSession(
                id: id,
                state: state,
                username: username,
                workerType: workerType,
                instanceType: instanceType,
                instance: instance,
                earliestTimeoutTime: time,
                creationTime: creationTime,
                updateTime: updateTime
        )
    }

    enum State {
        PENDING, ACTIVE, CLOSED
    }
}
