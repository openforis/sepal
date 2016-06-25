package org.openforis.sepal.taskexecutor.manager

import org.openforis.sepal.taskexecutor.api.*

class BackgroundExecutingTaskManager implements TaskManager {
    private final Map<String, TaskExecutorFactory> factoryByOperation
    private final BackgroundExecutor backgroundExecutor

    BackgroundExecutingTaskManager(
            Map<String, TaskExecutorFactory> factoryByOperation,
            BackgroundExecutor backgroundExecutor) {
        this.factoryByOperation = factoryByOperation
        this.backgroundExecutor = backgroundExecutor
    }

    void execute(Task task) {
        if (!task) throw new IllegalArgumentException("Task must not be null")
        def factory = factoryByOperation[task.operation]
        if (!factory)
            throw new InvalidTask(task, "Unsupported operation: ${task.operation}. Expects one of ${factoryByOperation.keySet()}")
        def taskExecutor = factory.create(task)
        backgroundExecutor.execute(taskExecutor)
    }

    void cancel(String taskId) {
        backgroundExecutor.cancel(taskId)
    }
}
