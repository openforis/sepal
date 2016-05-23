package org.openforis.sepal.component.task

import groovy.transform.Immutable

import static org.openforis.sepal.component.task.State.SUBMITTED

@Immutable
class TaskStatus {
    Long id
    String username
    State state = SUBMITTED
    Task task
}

enum State {
    SUBMITTED
}