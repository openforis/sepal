package org.openforis.sepal.taskexecutor.python

import groovy.json.JsonSlurper
import groovy.transform.Immutable
import groovyx.net.http.RESTClient
import org.openforis.sepal.taskexecutor.api.Progress
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.api.TaskExecutorFactory
import org.openforis.sepal.taskexecutor.util.Scheduler
import org.openforis.sepal.taskexecutor.util.SleepingScheduler
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
                throw new Failed(status.defaultMessage)
            return status.active
        }
    }

    void cancel() {
        gateway.cancel(taskId)
        scheduler.cancel()
    }

    Progress progress() {
        return status.get().toProgress()
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
            super((String) message)
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
                    task: task.id,
                    module: task.operation,
                    spec: task.params
                ]
            )
        }

        Status status(String geeTaskId) {
            def response = http.get(
                path: 'status',
                contentType: JSON,
                query: [task: geeTaskId]
            )
            def progressText = response.data.progress
            def progress = new JsonSlurper().parseText(progressText)
            return new Status(
                state: response.data.state as Status.State,
                defaultMessage: progress.default_message,
                messageKey: progress.message_key,
                messageArgs: progress.message_args
            )
        }

        void cancel(String geeTaskId) {
            http.post(path: 'cancel', query: [task: geeTaskId])
        }

        private RESTClient getHttp() {
            new RESTClient(uri)
        }
    }

    @Immutable
    private static class Status {
        State state
        String defaultMessage
        String messageKey
        Map<String, String> messageArgs

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

        Progress toProgress() {
            return new Progress(defaultMessage, messageKey, messageArgs)
        }
    }
}
