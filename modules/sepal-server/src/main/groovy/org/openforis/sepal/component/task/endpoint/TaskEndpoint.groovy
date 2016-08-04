package org.openforis.sepal.component.task.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.command.Command
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.query.UserTasks

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.security.Roles.ADMIN
import static org.openforis.sepal.security.Roles.TASK_EXECUTOR

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
                        params: fromJson(params.required('params', String)) as Map,
                        username: currentUser.username
                ))
                response.status = 204
            }

            post('/data/scenes/retrieve') {
                response.contentType = "application/json"
                def sceneMap = fromJson(params.required('scenes', String)) as List<Map>
                def scenes = sceneMap.collect { it.sceneId }
                submit(new SubmitTask(
                        operation: 'landsat-scene-download',
                        params: [sceneIds: scenes],
                        username: currentUser.username
                ))
                send toJson([status: 'OK'])
            }

            post('/tasks/task/{id}/cancel') {
                submit(new CancelTask(taskId: params.required('id', String), username: currentUser.username))
                response.status = 204
            }

            post('/tasks/task/{id}/remove') {
                submit(new RemoveTask(taskId: params.required('id', String), username: currentUser.username))
                response.status = 204
            }

            post('/tasks/task/{id}/execute') {
                submit(new ResubmitTask(
                        taskId: params.required('id', String),
                        username: currentUser.username
                ))
                response.status = 204
            }

            post('/tasks/remove') {
                submit(new RemoveUserTasks(username: currentUser.username))
                response.status = 204
            }

            post('/tasks/task/{id}/state-updated', [ADMIN, TASK_EXECUTOR]) {
                submit(new UpdateTaskProgress(
                        taskId: params.required('id', String),
                        state: params.required('state', Task.State),
                        statusDescription: params.required('statusDescription'),
                        username: currentUser.username
                ))
                response.status = 204
            }

            post('/tasks/active', [ADMIN, TASK_EXECUTOR]) {
                def progress = new JsonSlurper().parseText(params.required('progress', String)) as Map
                progress.each { taskId, description ->
                    submit(new UpdateTaskProgress(
                            taskId: taskId,
                            state: Task.State.ACTIVE,
                            statusDescription: description,
                            username: currentUser.username
                    ))
                }
                response.status = 204
            }
        }
    }

    private fromJson(String json) {
        new JsonSlurper().parseText(json)
    }

    private void submit(Command command) {
        component.submit(command)
    }
}
