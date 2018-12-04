package org.openforis.sepal.component.task.query

import org.openforis.sepal.command.Unauthorized
import groovy.transform.Immutable
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

class GetTask implements Query<Task> {
    String taskId
    String username
}

class GetTaskHandler implements QueryHandler<Task, GetTask> {
    private final TaskRepository taskRepository

    GetTaskHandler(TaskRepository taskRepository) {
        this.taskRepository = taskRepository
    }

    Task execute(GetTask query) {
        def task = taskRepository.getTask(query.taskId)
        if (task.username != query.username)
            throw new Unauthorized("Task not owned by user: $task", command)
        return task
    }
}
