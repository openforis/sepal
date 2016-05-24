package org.openforis.sepal.component.task

import groovy.transform.Immutable


@Immutable
class TaskStatus {
    Long id
    String username
    State state
    String instanceId
    Task task

    TaskStatus withId(long id) {
        new TaskStatus(
                id: id,
                username: username,
                state: state,
                instanceId: instanceId,
                task: task
        )
    }

    TaskStatus toActive() {
        new TaskStatus(
                id: id,
                username: username,
                state: State.ACTIVE,
                instanceId: instanceId,
                task: task
        )
    }
}

enum State {
    INSTANCE_STARTING, PROVISIONING, ACTIVE, CANCELED
}