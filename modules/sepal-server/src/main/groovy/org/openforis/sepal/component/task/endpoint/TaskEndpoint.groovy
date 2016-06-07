package org.openforis.sepal.component.task.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.command.Command
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.query.UserTasks

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.user.User.Role.TASK_EXECUTOR

class TaskEndpoint {
    private final Component component

    TaskEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {

            get('/tasks') {
                response.contentType = 'application/json'
                def tasks = component.submit(new UserTasks(username: currentUser.username)).collect {
                    [
                            id               : it.id,
                            name             : it.operation,
                            status           : it.state,
                            statusDescription: it.statusDescription
                    ]
                }
                send toJson(tasks)
            }

            post('/tasks') {
                submit(new SubmitTask(
                        instanceType: params.required('instanceType'),
                        operation: params.required('operation'),
                        params: fromJson(params.required('params', String)),
                        username: currentUser.username
                ))
                response.status = 204
            }

            post('/tasks/task/{id}/cancel') {
                submit(new CancelTask(taskId: params.required('id', int), username: currentUser.username))
                response.status = 204
            }

            post('/tasks/task/{id}/remove') {
                submit(new RemoveTask(taskId: params.required('id', int), username: currentUser.username))
                response.status = 204
            }

            post('/tasks/task/{id}/execute') {
                submit(new ResubmitTask(
                        instanceType: params.required('instanceType'),
                        taskId: params.required('id', int),
                        username: currentUser.username
                ))
                response.status = 204
            }

            post('/tasks/remove') {
                submit(new RemoveUserTasks(username: currentUser.username))
                response.status = 204
            }

            post('/tasks/task/{id}/progress', [TASK_EXECUTOR.name()]) {
                submit(new UpdateTaskProgress(
                        taskId: params.required('id', int),
                        state: params.required('state', Task.State),
                        statusDescription: params.required('statusDescription'),
                        username: currentUser.username
                ))
                response.status = 204
            }
        }
    }

    private Map fromJson(String json) {
        new JsonSlurper().parseText(json) as Map
    }

    private void submit(Command command) {
        component.submit(command)
    }
}
