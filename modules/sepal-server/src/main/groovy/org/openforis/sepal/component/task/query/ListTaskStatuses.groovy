package org.openforis.sepal.component.task.query

import groovy.transform.Immutable
import org.openforis.sepal.component.task.TaskRepository
import org.openforis.sepal.component.task.TaskStatus
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class ListTaskStatuses implements Query<List<TaskStatus>> {
    String username
}

class ListTaskStatusesHandler implements QueryHandler<List<TaskStatus>, ListTaskStatuses> {
    private final TaskRepository taskRepository

    ListTaskStatusesHandler(TaskRepository taskRepository) {
        this.taskRepository = taskRepository
    }

    List<TaskStatus> execute(ListTaskStatuses query) {
        return taskRepository.userTasks(query.username)
    }
}
