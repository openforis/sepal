package org.openforis.sepal.component.task.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.command.Command
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.query.GetTask
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
                        id: it.id,
                        recipeId: it.recipeId,
                        name: it.title,
                        status: it.state,
                        statusDescription: it.statusDescription
                    ]
                }
                send toJson(tasks)
            }

            post('/tasks') {
                def task = fromJson(body)
                def submittedTask = submit(new SubmitTask(
                    recipeId: task.recipeId,
                    instanceType: task.instanceType,
                    operation: task.operation,
                    params: task.params,
                    username: currentUser.username
                ))
                send toJson(submittedTask)
            }

            get('/tasks/task/{id}') {
                def task = submit(
                    new GetTask(
                        taskId: params.required('id', String),
                        username: currentUser.username
                    )
                )
                send toJson(task)
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

    private <T> T submit(Command<T> command) {
        component.submit(command)
    }
}
