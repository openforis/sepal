package org.openforis.sepal.component.task.endpoint

import groovymvc.Controller
import org.openforis.sepal.command.Command
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.task.command.CancelTask
import org.openforis.sepal.component.task.command.RemoveTask
import org.openforis.sepal.component.task.command.RemoveUserTasks
import org.openforis.sepal.component.task.command.SubmitTask
import org.openforis.sepal.component.task.query.UserTasks

import static groovy.json.JsonOutput.toJson

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

            post('/tasks/task/{id}/cancel') {
                submit(new CancelTask(taskId: params.required('id', int), username: currentUser.username))
                response.status = 204
            }

            post('/tasks/task/{id}/remove') {
                submit(new RemoveTask(taskId: params.required('id', int), username: currentUser.username))
                response.status = 204
            }

            post('/tasks/task/{id}/execute') {
                submit(new SubmitTask(
                        instanceType: params.required('instanceType'),
                        operation: params.required('operation'),
                        params: params.required('params', Map),
                        username: currentUser.username
                ))
                response.status = 204
            }

            post('/tasks/remove') {
                submit(new RemoveUserTasks(username: currentUser.username))
                response.status = 204
            }
        }
    }

    private void submit(Command command) {
        component.submit(command)
    }
}
