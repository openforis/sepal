package org.openforis.sepal.component.task.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSession

import static groovy.json.JsonOutput.toJson

class HttpWorkerGateway implements WorkerGateway {
    private final String sepalUsername
    private final String sepalPassword
    private final int workerPort

    HttpWorkerGateway(String sepalUsername, String sepalPassword, int workerPort) {
        this.sepalUsername = sepalUsername
        this.sepalPassword = sepalPassword
        this.workerPort = workerPort
    }

    void execute(Task task, WorkerSession session) {
        client(session).post(path: 'tasks', query: [
                id       : task.id,
                operation: task.operation,
                params   : toJson(task.params)
        ])
    }

    void cancel(String taskId, WorkerSession session) {
        client(session).delete(path: "tasks/$taskId")
    }

    private RESTClient client(WorkerSession session) {
        def client = new RESTClient("http://$session.host:$workerPort/api/")
        client.headers['Authorization'] = "Basic " + "$sepalUsername:$sepalPassword".bytes.encodeBase64()
        return client
    }
}
