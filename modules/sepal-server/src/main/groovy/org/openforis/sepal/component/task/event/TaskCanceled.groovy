package org.openforis.sepal.component.task.event

import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.event.Event

class TaskCanceled implements Event {
    Task task
    Instance instance
}
