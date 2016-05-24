package org.openforis.sepal.component.task.event

import groovy.transform.Immutable
import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.event.Event

@Immutable
class TaskExecutorStarted implements Event {
    Instance instance
}
