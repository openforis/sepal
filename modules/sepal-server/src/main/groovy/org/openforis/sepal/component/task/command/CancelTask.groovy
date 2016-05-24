package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.InstanceProvider
import org.openforis.sepal.component.task.State
import org.openforis.sepal.component.task.TaskRepository
import org.openforis.sepal.component.task.TaskStatus
import org.openforis.sepal.event.EventDispatcher

import static org.openforis.sepal.component.task.State.CANCELED

class CancelTask extends AbstractCommand<Void> {
    long taskId
}

class CancelTaskHandler implements CommandHandler<Void, CancelTask> {
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider
    private final EventDispatcher eventDispatcher

    CancelTaskHandler(TaskRepository taskRepository, InstanceProvider instanceProvider, EventDispatcher eventDispatcher) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
        this.eventDispatcher = eventDispatcher
    }

    Void execute(CancelTask command) {
        def status = updateTaskStateInRepository(command.taskId, CANCELED)
        if (taskRepository.isInstanceIdle(status.instanceId))
            instanceProvider.release(status.instanceId)
        return null
    }

    private TaskStatus updateTaskStateInRepository(long taskId, State state) {
        taskRepository.updateStateAndReturnIt(taskId, state)
    }
}
