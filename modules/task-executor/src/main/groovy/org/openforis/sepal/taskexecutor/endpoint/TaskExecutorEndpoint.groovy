package org.openforis.sepal.taskexecutor.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskManager

class TaskExecutorEndpoint implements EndpointRegistry {
    private final TaskManager taskManager

    TaskExecutorEndpoint(TaskManager taskManager) {
        this.taskManager = taskManager
    }

    void registerEndpointsWith(Controller controller) {
        controller.with {

            post('/tasks') {
                def task = new Task(
                        id: params.required('id', String),
                        operation: params.required('operation', String),
                        params: toMap(params.required('params', String))
                )
                taskManager.execute(task)
                response.status = 201
            }

            delete('/tasks/{taskId}') {
                def taskId = params.required('taskId', String)
                taskManager.cancel(taskId)
                response.status = 204
            }
        }
    }

    private Map toMap(String json) {
        new JsonSlurper().parseText(json) as Map
    }
}
