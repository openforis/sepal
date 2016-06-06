package org.openforis.sepal.component.task.api

import groovy.transform.Immutable

import static org.openforis.sepal.component.task.api.Task.State.*

@Immutable
class Task {
    String id
    State state
    String username
    String operation
    Map params
    String sessionId
    String statusDescription
    Date creationTime
    Date updateTime

    boolean isPending() {
        state == PENDING
    }

    boolean isActive() {
        state == ACTIVE
    }

    Task activate() {
        update(ACTIVE)
    }

    boolean isCompleted() {
        state == COMPLETED
    }

    Task complete() {
        update(COMPLETED)
    }

    boolean isCanceled() {
        state == CANCELED
    }

    Task cancel() {
        update(CANCELED)
    }

    boolean isFailed() {
        state == FAILED
    }

    Task fail(String statusDescription = FAILED.description) {
        update(FAILED, statusDescription)
    }

    boolean isNotPendingOrActive() {
        !pending && !active
    }

    Task update(State state) {
        update(state, state.description)
    }

    Task update(State state, String statusDescription) {
        new Task(
                id: id,
                state: state,
                username: username,
                operation: operation,
                params: params,
                sessionId: sessionId,
                statusDescription: statusDescription ?: state.description,
                creationTime: creationTime,
                updateTime: updateTime
        )
    }

    enum State {
        PENDING('Initializing'),
        ACTIVE('Executing'),
        COMPLETED('Completed'),
        CANCELED('Canceled'),
        FAILED('Failed')

        final String description

        State(String description) {
            this.description = description
        }
    }
}
