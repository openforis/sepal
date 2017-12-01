package org.openforis.sepal.taskexecutor.manager

import org.openforis.sepal.taskexecutor.api.BackgroundExecutor
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskExecutorFactory
import org.openforis.sepal.taskexecutor.api.TaskManager

class BackgroundExecutingTaskManager implements TaskManager {
    private final TaskExecutorFactory defaultFactory
    private final Map<String, TaskExecutorFactory> factoryByOperation
    private final BackgroundExecutor backgroundExecutor

    BackgroundExecutingTaskManager(
            TaskExecutorFactory defaultFactory,
            Map<String, TaskExecutorFactory> factoryByOperation,
            BackgroundExecutor backgroundExecutor) {
        this.defaultFactory = defaultFactory
        this.factoryByOperation = factoryByOperation
        this.backgroundExecutor = backgroundExecutor
    }

    void execute(Task task) {
        if (!task) throw new IllegalArgumentException("Task must not be null")
        def factory = factoryByOperation[task.operation] ?: defaultFactory
        def taskExecutor = factory.create(task)
        backgroundExecutor.execute(taskExecutor)
    }

    void cancel(String taskId) {
        backgroundExecutor.cancel(taskId)
    }
}
