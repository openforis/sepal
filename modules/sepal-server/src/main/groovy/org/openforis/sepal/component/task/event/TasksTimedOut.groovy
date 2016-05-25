package org.openforis.sepal.component.task.event

import groovy.transform.Immutable
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.event.Event

@Immutable
class TasksTimedOut implements Event {
    List<Task> tasks
}
