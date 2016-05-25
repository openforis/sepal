package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.TaskRepository
import org.openforis.sepal.component.task.event.TasksTimedOut
import org.openforis.sepal.event.EventDispatcher

class HandleTimedOutTasks extends AbstractCommand<Void> {
}

class HandleTimedOutTasksHandler implements CommandHandler<Void, HandleTimedOutTasks> {
    private final TaskRepository taskRepository
    private final EventDispatcher eventDispatcher

    HandleTimedOutTasksHandler(TaskRepository taskRepository, EventDispatcher eventDispatcher) {
        this.taskRepository = taskRepository
        this.eventDispatcher = eventDispatcher
    }

    Void execute(HandleTimedOutTasks command) {
        def timedOutTasks = taskRepository.timedOutTasks()
        if (timedOutTasks)
            eventDispatcher.publish(new TasksTimedOut(timedOutTasks))
        return null
    }
}
