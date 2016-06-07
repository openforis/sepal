package org.openforis.sepal.component.task.query

import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class UserTasks implements Query<List<Task>> {
    String username
}

class UserTasksHandler implements QueryHandler<List<Task>, UserTasks> {
    private final TaskRepository taskRepository

    UserTasksHandler(TaskRepository taskRepository) {
        this.taskRepository = taskRepository
    }

    List<Task> execute(UserTasks query) {
        taskRepository.userTasks(query.username)
    }
}
