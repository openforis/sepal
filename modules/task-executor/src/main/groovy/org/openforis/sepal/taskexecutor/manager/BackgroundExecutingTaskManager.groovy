package org.openforis.sepal.taskexecutor.manager

import org.openforis.sepal.taskexecutor.api.*
import org.openforis.sepal.taskexecutor.util.Stoppable

import java.util.concurrent.ConcurrentHashMap

class BackgroundExecutingTaskManager implements TaskManager, Stoppable {
    private final Map<String, TaskExecutorFactory> factoryByOperation
    private final BackgroundExecutor backgroundExecutor
    private final ConcurrentHashMap<String, TaskExecution> taskExecutionByTaskId = new ConcurrentHashMap()
    private final TaskProgressMonitor progressMonitor

    BackgroundExecutingTaskManager(
            Map<String, TaskExecutorFactory> factoryByOperation,
            BackgroundExecutor backgroundExecutor,
            TaskProgressMonitor progressMonitor) {
        this.factoryByOperation = factoryByOperation
        this.backgroundExecutor = backgroundExecutor
        backgroundExecutor.onCompleted {
            taskExecutionByTaskId.remove(it)
        }
        this.progressMonitor = progressMonitor.start(taskExecutionByTaskId.values())
    }

    void execute(Task task) {
        if (!task) throw new IllegalArgumentException("Task must not be null")
        def factory = factoryByOperation[task.operation]
        if (!factory)
            throw new InvalidTask(task, "Unsupported operation: ${task.operation}. Expects one of ${taskExecutionByTaskId.keySet()}")
        def taskExecutor = factory.create(task)
        def previousExecution = taskExecutionByTaskId.putIfAbsent(task.id,
                backgroundExecutor.execute(taskExecutor)
        )
        if (previousExecution)
            previousExecution.cancel()
    }

    void cancel(String taskId) {
        def taskExecution = taskExecutionByTaskId[taskId]
        if (!taskExecution)
            return
        taskExecution.cancel()
        taskExecutionByTaskId.remove(taskId)
    }

    void stop() {
        taskExecutionByTaskId.values()*.cancel()
    }
}
