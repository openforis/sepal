package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.InstanceProvider
import org.openforis.sepal.component.task.TaskRepository
import org.openforis.sepal.event.EventDispatcher

class HandleTimedOutTasks extends AbstractCommand<Void> {
}

class HandleTimedOutTasksHandler implements CommandHandler<Void, HandleTimedOutTasks> {
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider

    HandleTimedOutTasksHandler(TaskRepository taskRepository, InstanceProvider instanceProvider) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
    }

    Void execute(HandleTimedOutTasks command) {
        def timedOutTasks = taskRepository.timedOutTasks()
//        instanceProvider.release()
        return null
    }
}
