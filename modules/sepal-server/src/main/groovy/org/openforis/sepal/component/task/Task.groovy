package org.openforis.sepal.component.task

import groovy.transform.Immutable


@Immutable
class Task {
    Long id
    String username
    State state
    String instanceId
    Operation operation
    Date creationTime
    Date updateTime

    Task withId(long id, Date updateTime) {
        new Task(
                id: id,
                username: username,
                state: state,
                instanceId: instanceId,
                operation: operation,
                creationTime: updateTime,
                updateTime: updateTime
        )
    }
}

enum State {
    INSTANCE_STARTING, PROVISIONING, ACTIVE, CANCELED, FAILED
}