package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
class CancelUserTasks extends AbstractCommand<Void> {
}

class CancelUserTasksHandler implements CommandHandler<Void, CancelUserTasks> {
    private final TaskRepository taskRepository
    private final CommandHandler<Task, CancelTask> cancelTaskHandler

    CancelUserTasksHandler(TaskRepository taskRepository, CommandHandler<Task, CancelTask> cancelTaskHandler) {
        this.taskRepository = taskRepository
        this.cancelTaskHandler = cancelTaskHandler
    }

    Void execute(CancelUserTasks command) {
        def tasks = taskRepository.pendingOrActiveUserTasks(command.username)
        tasks.each {
            cancelTaskHandler.execute(new CancelTask(taskId: it.id, username: command.username))
        }
        return null
    }
}
