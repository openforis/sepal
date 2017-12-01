package org.openforis.sepal.taskexecutor.python

import groovyx.net.http.RESTClient
import org.openforis.sepal.taskexecutor.api.Progress
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.api.TaskExecutorFactory
import org.openforis.sepal.taskexecutor.util.Scheduler
import org.openforis.sepal.taskexecutor.util.SleepingScheduler
import org.openforis.sepal.util.annotation.ImmutableData
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.atomic.AtomicReference

import static groovyx.net.http.ContentType.JSON
import static java.util.concurrent.TimeUnit.SECONDS

class PythonModuleExecutor implements TaskExecutor {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final Task task
    private final Scheduler scheduler = new SleepingScheduler(5, SECONDS)
    private final Gateway gateway
    private final status = new AtomicReference<Status>(new Status(state: Status.State.ACTIVE))

    PythonModuleExecutor(Task task, Factory factory) {
        this.task = task
        this.gateway = new Gateway(factory.pythonEndpoint)
        gateway.submit(task)
    }

    String getTaskId() {
        return task.id
    }

    void execute() {
        scheduler.schedule {
            def status = gateway.status(taskId)
            LOG.info("Status of task $taskId: $status")
            this.status.set(status)
            if (status.hasFailed())
                throw new Failed(status.message as String)
            return status.active
        }
    }

    void cancel() {
        gateway.cancel(taskId)
        scheduler.cancel()
    }

    Progress progress() {
        return new Progress(status.get().message)
    }

    static class Factory implements TaskExecutorFactory {
        final URI pythonEndpoint

        Factory(URI pythonEndpoint) {
            this.pythonEndpoint = pythonEndpoint
        }

        TaskExecutor create(Task task) {
            return new PythonModuleExecutor(task, this)
        }
    }

    static class Failed extends RuntimeException {
        Failed(String message) {
            super(message)
        }
    }

    private static class Gateway {
        private final URI uri

        Gateway(URI uri) {
            this.uri = uri
        }

        void submit(Task task) {
            http.post(
                    path: 'submit',
                    requestContentType: JSON,
                    body: [
                            task  : task.id,
                            module: task.operation,
                            spec  : task.params
                    ]
            )
        }

        Status status(String geeTaskId) {
            def response = http.get(
                    path: 'status',
                    contentType: JSON,
                    query: [task: geeTaskId]
            )
            return new Status(
                    state: response.data.state as Status.State,
                    message: response.data.message)
        }

        void cancel(String geeTaskId) {
            http.post(path: 'cancel', query: [task: geeTaskId])
        }

        private RESTClient getHttp() {
            new RESTClient(uri)
        }
    }

    @ImmutableData
    private static class Status {
        State state
        String message

        boolean isActive() {
            state == State.ACTIVE
        }

        boolean hasCompleted() {
            state == State.COMPLETED
        }

        boolean hasFailed() {
            state == State.FAILED
        }

        enum State {
            ACTIVE, COMPLETED, CANCELED, FAILED
        }
    }
}
