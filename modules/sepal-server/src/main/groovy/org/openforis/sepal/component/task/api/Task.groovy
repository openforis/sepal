package org.openforis.sepal.component.task.api

import groovy.json.JsonOutput
import groovy.transform.Immutable

import static org.openforis.sepal.component.task.api.Task.State.*

@Immutable
class Task {
    String id
    State state
    String recipeId
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

    Task update(State state) {
        update(state, state.description)
    }

    Task update(State state, String statusDescription) {
        new Task(
            id: id,
            state: state,
            recipeId: recipeId,
            username: username,
            operation: operation,
            params: params,
            sessionId: sessionId,
            statusDescription: statusDescription ?: state.description,
            creationTime: creationTime,
            updateTime: updateTime
        )
    }

    String getTitle() {
        switch (operation) {
            case 'landsat-scene-download':
                return "Retrieving ${params.sceneIds?.size()} Landsat scenes"
            default:
                return params.title ?: operation
        }
    }

    enum State {
        PENDING([defaultMessage: 'Initializing...', messageKey: 'tasks.status.initializing', messageArgs: [:]]),
        ACTIVE([defaultMessage: 'Executing...', messageKey: 'tasks.status.executing', messageArgs: [:]]),
        COMPLETED([defaultMessage: 'Completed!', messageKey: 'tasks.status.completed', messageArgs: [:]]),
        CANCELED([defaultMessage: 'Canceled.', messageKey: 'tasks.status.canceled', messageArgs: [:]]),
        FAILED([defaultMessage: 'Failed: Internal Error', messageKey: 'tasks.status.failed', messageArgs: [error: 'Internal Error']])

        final String description

        State(Map<String, String> description) {
            this.description = JsonOutput.toJson(description)
        }
    }
}
