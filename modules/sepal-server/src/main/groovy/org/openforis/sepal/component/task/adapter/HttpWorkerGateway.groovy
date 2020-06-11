package org.openforis.sepal.component.task.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSession
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovy.json.JsonOutput.toJson
import static groovyx.net.http.ContentType.JSON
import static groovyx.net.http.ContentType.URLENC

class HttpWorkerGateway implements WorkerGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String sepalUsername
    private final String sepalPassword
    private final int workerPort

    HttpWorkerGateway(String sepalUsername, String sepalPassword, int workerPort) {
        this.sepalUsername = sepalUsername
        this.sepalPassword = sepalPassword
        this.workerPort = workerPort
    }

    void execute(Task task, WorkerSession session) {
        LOG.debug("Executing task. {defaultUrl: http://$session.host:$workerPort/api/, path: tasks, task: $task}")
        client(session).post(
            path: 'tasks',
            requestContentType: URLENC,
            contentType: JSON,
            body: [
                id: task.id,
                recipeId: task.recipeId,
                operation: task.operation,
                params: toJson(task.params)
            ])
    }

    void cancel(String taskId, WorkerSession session) {
        LOG.debug("Canceling task. {defaultUrl: http://$session.host:$workerPort/api/, path: tasks/$taskId}")
        client(session).delete(path: "tasks/$taskId")
    }

    private RESTClient client(WorkerSession session) {
        def client = new RESTClient("http://$session.host:$workerPort/api/")
        client.headers['Authorization'] = "Basic " + "$sepalUsername:$sepalPassword".bytes.encodeBase64()
        return client
    }
}
