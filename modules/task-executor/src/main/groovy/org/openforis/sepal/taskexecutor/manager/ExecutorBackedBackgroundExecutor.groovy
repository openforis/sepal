package org.openforis.sepal.taskexecutor.manager

import org.openforis.sepal.taskexecutor.api.BackgroundExecutor
import org.openforis.sepal.taskexecutor.api.Progress
import org.openforis.sepal.taskexecutor.api.TaskExecution
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.util.NamedThreadFactory
import org.openforis.sepal.taskexecutor.util.Stoppable

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.Future

class ExecutorBackedBackgroundExecutor implements BackgroundExecutor, Stoppable {
    private List<Closure> completionListeners = new CopyOnWriteArrayList<>()
    private final executor = Executors.newCachedThreadPool(
            NamedThreadFactory.multipleThreadFactory('BackgroundExecutor')
    )

    TaskExecution execute(TaskExecutor taskExecutor) {
        def future = executor.submit {
            taskExecutor.execute()
            completionListeners*.call(taskExecutor.taskId)
        }
        return new FutureBackedTaskExecution(taskExecutor, future)
    }

    void onCompleted(Closure listener) {
        completionListeners << listener
    }

    void stop() {
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
