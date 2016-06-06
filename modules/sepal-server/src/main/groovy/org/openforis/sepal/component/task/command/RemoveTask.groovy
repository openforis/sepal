package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.task.api.TaskRepository

import static org.openforis.sepal.component.task.api.Task.State.*

class RemoveTask extends AbstractCommand<Void> {
    String taskId
}

class RemoveTaskHandler implements CommandHandler<Void, RemoveTask> {
    private final TaskRepository taskRepository

    RemoveTaskHandler(TaskRepository taskRepository) {
        this.taskRepository = taskRepository
    }

    Void execute(RemoveTask command) {
        def task = taskRepository.getTask(command.taskId)
        if (task.username != command.username)
            throw new Unauthorized("Task not owned by user: $task", command)
        if (![CANCELED, FAILED, COMPLETED].contains(task.state))
            throw new IllegalStateException("Only canceled, failed and completed tasks can be removed")
        taskRepository.remove(task)
        return null
    }
}
