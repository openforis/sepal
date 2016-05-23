package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.TaskManager
import org.openforis.sepal.component.task.TaskStatus

class SubmitTask extends AbstractCommand<TaskStatus> {
    Task task
    String instanceType
}

class SubmitTaskHandler implements CommandHandler<TaskStatus, SubmitTask> {
    private final TaskManager taskManager

    SubmitTaskHandler(TaskManager taskManager) {
        this.taskManager = taskManager
    }

    TaskStatus execute(SubmitTask command) {
        taskManager.submitTask(command.username, command.task, command.instanceType)
    }
}
