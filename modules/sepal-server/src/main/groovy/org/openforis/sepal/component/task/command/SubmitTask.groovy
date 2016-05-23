package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.TaskManager
import org.openforis.sepal.component.task.TaskRepository
import org.openforis.sepal.component.task.TaskStatus

class SubmitTask extends AbstractCommand<Void> {
    Task task
    String instanceType
}

class SubmitTaskHandler implements CommandHandler<Void, SubmitTask> {
    private final TaskRepository taskRepository
    private final TaskManager taskManager

    SubmitTaskHandler(TaskRepository taskRepository, TaskManager taskManager) {
        this.taskRepository = taskRepository
        this.taskManager = taskManager
    }

    Void execute(SubmitTask command) {
        taskRepository.insert(new TaskStatus(username: command.username, task: command.task))
        taskManager.submit(command.task, command.username, command.instanceType)
        return null
    }
}
