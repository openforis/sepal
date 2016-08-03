package org.openforis.sepal.taskexecutor.manager

import org.jboss.logging.Logger
import org.openforis.sepal.taskexecutor.api.BackgroundExecutor
import org.openforis.sepal.taskexecutor.api.Progress
import org.openforis.sepal.taskexecutor.api.TaskExecution
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.util.NamedThreadFactory
import org.openforis.sepal.taskexecutor.util.lifecycle.Stoppable

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future

class ExecutorBackedBackgroundExecutor implements BackgroundExecutor, Stoppable {
    private static final Logger LOG = Logger.getLogger(this)
    private final TaskProgressMonitor progressMonitor
    private final Map<String, TaskExecution> taskExecutionByTaskId = new ConcurrentHashMap<>()
    private final executor = Executors.newCachedThreadPool(
            NamedThreadFactory.multipleThreadFactory('BackgroundExecutor')
    )

    ExecutorBackedBackgroundExecutor(TaskProgressMonitor progressMonitor) {
        this.progressMonitor = progressMonitor.start(taskExecutionByTaskId.values())
    }

    void execute(TaskExecutor taskExecutor) {
        def future = executor.submit {
            try {
                taskExecutor.execute()
                taskExecutionByTaskId.remove(taskExecutor.taskId)
                progressMonitor.completed(taskExecutor.taskId)
            } catch (Exception e) {
                taskExecutionByTaskId.remove(taskExecutor.taskId)
                progressMonitor.failed(taskExecutor.taskId, e.message)
            }
        }
        def taskExecution = new FutureBackedTaskExecution(taskExecutor, future)
        taskExecutionByTaskId[taskExecutor.taskId] = taskExecution
    }

    void cancel(String taskId) {
        taskExecutionByTaskId.remove(taskId)?.cancel()
        progressMonitor.canceled(taskId)
    }

    void stop() {
        taskExecutionByTaskId.values()*.cancel()
        executor.shutdownNow()
    }

    private static final class FutureBackedTaskExecution implements TaskExecution {
        private final TaskExecutor taskExecutor
        private final Future future

        FutureBackedTaskExecution(TaskExecutor taskExecutor, Future future) {
            this.taskExecutor = taskExecutor
            this.future = future
        }

        String getTaskId() {
            taskExecutor.taskId
        }

        Progress progress() {
            taskExecutor.progress()
        }

        void cancel() {
            taskExecutor.cancel()
            future.cancel(true)
        }
    }
}
