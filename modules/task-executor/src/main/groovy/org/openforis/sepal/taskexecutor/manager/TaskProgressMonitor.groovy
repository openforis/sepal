package org.openforis.sepal.taskexecutor.manager

import groovyx.net.http.RESTClient
import org.openforis.sepal.taskexecutor.api.TaskExecution
import org.openforis.sepal.taskexecutor.util.NamedThreadFactory
import org.openforis.sepal.taskexecutor.util.lifecycle.Stoppable
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

import static groovy.json.JsonOutput.toJson

interface TaskProgressMonitor extends Stoppable {
    TaskProgressMonitor start(Collection<TaskExecution> taskExecutions)

    void completed(String taskId)

    void canceled(String taskId)

    void failed(String taskId, String message)

    void stop()
}

class SepalNotifyingTaskProgressMonitor implements TaskProgressMonitor {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SepalTaskProgressNotifier notifier
    private final executor = Executors.newSingleThreadScheduledExecutor(
            NamedThreadFactory.singleThreadFactory('task-progress-monitor')
    )

    SepalNotifyingTaskProgressMonitor(String sepalEndpoint, String taskExecutorUsername, String taskExecutorPassword) {
        notifier = new SepalTaskProgressNotifier(sepalEndpoint, taskExecutorUsername, taskExecutorPassword)
    }

    TaskProgressMonitor start(Collection<TaskExecution> taskExecutions) {
        executor.scheduleWithFixedDelay({
            notifyAboutActiveTasks(taskExecutions)
        }, 0, 5, TimeUnit.SECONDS)
        return this
    }

    void completed(String taskId) {
        notifier.notifyStateChange(taskId, 'COMPLETED', 'Completed')
    }

    void canceled(String taskId) {
        notifier.notifyStateChange(taskId, 'CANCELED', 'Canceled')
    }

    void failed(String taskId, String message) {
        notifier.notifyStateChange(taskId, 'FAILED', message)
    }

    void stop() {
        executor.shutdownNow()
    }

    private void notifyAboutActiveTasks(Collection<TaskExecution> taskExecutions) {
        notifier.notifyAboutActiveTasks(taskExecutions)
    }
}

class SepalTaskProgressNotifier {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String sepalEndpoint
    private final String taskExecutorUsername
    private final String taskExecutorPassword


    SepalTaskProgressNotifier(String sepalEndpoint, String taskExecutorUsername, String taskExecutorPassword) {
        this.sepalEndpoint = sepalEndpoint
        this.taskExecutorUsername = taskExecutorUsername
        this.taskExecutorPassword = taskExecutorPassword
    }

    void notifyAboutActiveTasks(Collection<TaskExecution> taskExecutions) {
        try {
            def progress = taskExecutions.collectEntries {
                [(it.taskId): it.progress().message]
            }
            if (progress)
                sepal.post(path: 'tasks/active', query: [progress: toJson(progress)])
        } catch (Exception e) {
            LOG.error("Failed to notify $sepal.uri on progress. taskIds: ${taskExecutions.collect { it.taskId }}", e)
        }
    }

    void notifyStateChange(String taskId, String state, String message) {
        try {
            sepal.post(
                    path: "tasks/task/$taskId/state-updated",
                    query: [
                            state            : state,
                            statusDescription: message
                    ])
        } catch (Exception e) {
            LOG.error("Failed to notify $sepal.uri on progress. taskId: $taskId, state: $state, message: $message", e)
        }
    }

    private RESTClient getSepal() {
        def sepal = new RESTClient(sepalEndpoint)
        sepal.ignoreSSLIssues()
        sepal.headers['Authorization'] = "Basic " + "$taskExecutorUsername:$taskExecutorPassword".bytes.encodeBase64()
        return sepal
    }
}