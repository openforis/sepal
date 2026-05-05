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
    Date earliestTimeoutTime
    Date creationTime
    Date updateTime
    // Credential — never include when serialising a WorkerSession (e.g. to JSON or to an event crossing RabbitMQ).
    String apiKey

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
                updateTime: updateTime,
                apiKey: apiKey
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
                updateTime: updateTime,
                apiKey: apiKey
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
                updateTime: updateTime,
                apiKey: apiKey
        )
    }

    WorkerSession withApiKey(String apiKey) {
        new WorkerSession(
                id: id,
                state: state,
                username: username,
                workerType: workerType,
                instanceType: instanceType,
                instance: instance,
                earliestTimeoutTime: earliestTimeoutTime,
                creationTime: creationTime,
                updateTime: updateTime,
                apiKey: apiKey
        )
    }

    enum State {
        PENDING, ACTIVE, CLOSED
    }
}
