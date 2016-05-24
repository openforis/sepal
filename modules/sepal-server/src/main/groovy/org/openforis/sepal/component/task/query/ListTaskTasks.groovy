package org.openforis.sepal.component.task.query

import groovy.transform.Immutable
import org.openforis.sepal.component.task.TaskRepository
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class ListTaskTasks implements Query<List<Task>> {
    String username
}

class ListTasksHandler implements QueryHandler<List<Task>, ListTaskTasks> {
    private final TaskRepository taskRepository

    ListTasksHandler(TaskRepository taskRepository) {
        this.taskRepository = taskRepository
    }

    List<Task> execute(ListTaskTasks query) {
        return taskRepository.userTasks(query.username)
    }
}
