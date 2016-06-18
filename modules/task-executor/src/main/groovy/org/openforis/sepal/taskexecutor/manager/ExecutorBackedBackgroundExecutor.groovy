package org.openforis.sepal.taskexecutor.manager

import org.openforis.sepal.taskexecutor.api.BackgroundExecutor
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskExecution
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.util.NamedThreadFactory
import org.openforis.sepal.taskexecutor.util.Stoppable

import java.util.concurrent.Executors
import java.util.concurrent.Future

class ExecutorBackedBackgroundExecutor implements BackgroundExecutor, Stoppable {
    private final executor = Executors.newCachedThreadPool(
            NamedThreadFactory.multipleThreadFactory('BackgroundExecutor')
    )

    TaskExecution execute(Task task, TaskExecutor taskExecutor) {
        def future = executor.submit {
            taskExecutor.execute(task)
        }
        return new FutureBackedTaskExecution(taskExecutor, future)
    }

    void stop() {
        executor.shutdown()
    }

    private static final class FutureBackedTaskExecution implements TaskExecution {
        private final TaskExecutor taskExecutor
        private final Future future

        FutureBackedTaskExecution(TaskExecutor taskExecutor, Future future) {
            this.taskExecutor = taskExecutor
            this.future = future
        }

        void cancel() {
            taskExecutor.cancel()
            future.cancel(true)
        }
    }
}
