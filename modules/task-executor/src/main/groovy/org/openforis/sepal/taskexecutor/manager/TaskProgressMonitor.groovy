package org.openforis.sepal.taskexecutor.manager

import groovyx.net.http.RESTClient
import org.openforis.sepal.taskexecutor.api.TaskExecution
import org.openforis.sepal.taskexecutor.util.NamedThreadFactory
import org.openforis.sepal.taskexecutor.util.Stoppable
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

import static groovy.json.JsonOutput.toJson

interface TaskProgressMonitor extends Stoppable {
    TaskProgressMonitor start(Collection<TaskExecution> taskExecutions)

    void stop()
}

class SepalNotifyingTaskProgressMonitor implements TaskProgressMonitor {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final Collection<TaskExecution> taskExecutions
    private final SepalTaskProgressNotifier notifier
    private final executor = Executors.newSingleThreadScheduledExecutor(
            NamedThreadFactory.singleThreadFactory('task-progress-monitor')
    )

    SepalNotifyingTaskProgressMonitor(String sepalEndpoint) {
        this.taskExecutions = taskExecutions
        notifier = new SepalTaskProgressNotifier(sepalEndpoint)
    }

    TaskProgressMonitor start(Collection<TaskExecution> taskExecutions) {
        executor.scheduleWithFixedDelay({
            notifySepalOnTaskProgress(taskExecutions)
        }, 0, 5, TimeUnit.SECONDS)
        return this
    }

    private void notifySepalOnTaskProgress(Collection<TaskExecution> taskExecutions) {
        try {
            notifier.notifyOnProgress(taskExecutions)
        } catch (Exception e) {
            LOG.error('Failed to notify sepal on progress', e)
        }
    }

    void stop() {
        executor.shutdownNow()
    }
}

class SepalTaskProgressNotifier {
    private final RESTClient sepal

    SepalTaskProgressNotifier(String sepalEndpoint) {
        sepal = new RESTClient(sepalEndpoint)
    }

    void notifyOnProgress(Collection<TaskExecution> taskExecutions) {
        def progress = taskExecutions.collectEntries {
            [(it.taskId): it.progress()]
        }
        if (progress)
            sepal.post(path: '/tasks/progress', query: [progress: toJson(progress)])
    }
}