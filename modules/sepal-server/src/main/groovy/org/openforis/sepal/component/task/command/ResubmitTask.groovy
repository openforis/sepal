package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.InvalidCommand
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.annotation.Data

import static org.openforis.sepal.component.task.api.Task.State.*

@Data(callSuper = true)
class ResubmitTask extends AbstractCommand<Task> {
    String instanceType
    String taskId
}

class ResubmitTaskHandler implements CommandHandler<Task, ResubmitTask> {
    private final TaskRepository taskRepository
    private final SubmitTaskHandler submitTaskHandler

    ResubmitTaskHandler(
            TaskRepository taskRepository,
            WorkerSessionManager sessionManager,
            WorkerGateway workerGateway,
            Clock clock) {
        this.taskRepository = taskRepository
        submitTaskHandler = new SubmitTaskHandler(taskRepository, sessionManager, workerGateway, clock)
    }

    Task execute(ResubmitTask command) {
        def task = taskRepository.getTask(command.taskId)
        if (task.username != command.username)
            throw new Unauthorized("Task not owned by user: $task", command)
        if (![CANCELED, FAILED, COMPLETED].contains(task.state))
            throw new InvalidCommand("Only canceled, failed, and completed tasks can be resubmitted", command)
        taskRepository.remove(task)
        def resubmittedTask = submitTaskHandler.execute(new SubmitTask(
                username: command.username,
                instanceType: command.instanceType,
                operation: task.operation,
                params: task.params
        ))
        return resubmittedTask
    }
}
