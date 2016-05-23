package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.TaskManager

class CancelTask extends AbstractCommand<Void> {
    long taskId
}

class CancelTaskHandler implements CommandHandler<Void, CancelTask> {
    private final TaskManager taskManager

    CancelTaskHandler(TaskManager taskManager) {
        this.taskManager = taskManager
    }

    Void execute(CancelTask command) {
        taskManager.cancel(command.taskId)
        return null
    }
}
