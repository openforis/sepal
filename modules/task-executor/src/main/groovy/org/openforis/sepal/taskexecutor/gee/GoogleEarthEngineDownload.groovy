package org.openforis.sepal.taskexecutor.gee

import org.openforis.sepal.taskexecutor.api.Progress
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.api.TaskExecutorFactory
import org.openforis.sepal.taskexecutor.util.FileOwner
import org.openforis.sepal.taskexecutor.util.Scheduler
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.atomic.AtomicReference

import static org.openforis.sepal.taskexecutor.gee.Status.State.ACTIVE

class GoogleEarthEngineDownload implements TaskExecutor {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String geeTaskId
    private final File workingDir
    private final String username
    private final Scheduler scheduler
    private final GoogleEarthEngineGateway gateway
    private final status = new AtomicReference<Status>(new Status(state: ACTIVE))

    GoogleEarthEngineDownload(Task task, Factory factory) {
        this.geeTaskId = task.params.geeTaskId
        this.workingDir = factory.workingDir
        this.username = factory.username
        this.scheduler = factory.scheduler
        this.gateway = factory.gateway

        if (!this.geeTaskId)
            throw new IllegalArgumentException("Expected task parameter geeTaskId")
    }

    String getTaskId() {
        return null
    }

    void execute() {
        gateway.download(geeTaskId)
        scheduler.schedule {
            def status = gateway.status(geeTaskId)
            this.status.set(status)
            if (status.hasFailed())
                throw new Failed(status.message)
            return status.active
        }
        def status = this.status.get()
        if (status.hasCompleted()) {
            def file = new File(workingDir, status.filename)
            if (!file.exists()) {
                LOG.error('google-earth-engine-download says it completed successfully, but file is not there: ' + file)
                throw new Failed(status.message)
            }
            FileOwner.set(file, username)
        }
    }

    void cancel() {
        gateway.cancel(geeTaskId)
        scheduler.cancel()
    }

    Progress progress() {
        return new Progress(status.get().message)
    }

    static class Factory implements TaskExecutorFactory {
        final File workingDir
        final String username
        final Scheduler scheduler
        final GoogleEarthEngineGateway gateway

        Factory(File workingDir, String username, Scheduler scheduler, GoogleEarthEngineGateway gateway) {
            this.workingDir = workingDir
            this.username = username
            this.scheduler = scheduler
            this.gateway = gateway
        }

        TaskExecutor create(Task task) {
            return new GoogleEarthEngineDownload(task, this)
        }
    }

    static class Failed extends RuntimeException {
        Failed(String message) {
            super(message)
        }
    }

}
