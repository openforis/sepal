package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class RemoveUserTasks extends AbstractCommand<Void> {

}

class RemoveUserTasksHandler implements CommandHandler<Void, RemoveUserTasks> {
    private final TaskRepository taskRepository

    RemoveUserTasksHandler(TaskRepository taskRepository) {
        this.taskRepository = taskRepository
    }

    Void execute(RemoveUserTasks command) {
        taskRepository.removeNonPendingOrActiveUserTasks(command.username)
        return null
    }
}
