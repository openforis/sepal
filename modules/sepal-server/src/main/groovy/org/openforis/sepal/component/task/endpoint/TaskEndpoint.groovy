package org.openforis.sepal.component.task.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.command.Command
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.datasearch.api.AoiPolygon
import org.openforis.sepal.component.datasearch.api.DataSet
import org.openforis.sepal.component.datasearch.api.FusionTableShape
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.query.UserTasks

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.security.Roles.ADMIN
import static org.openforis.sepal.security.Roles.TASK_EXECUTOR

class TaskEndpoint {
    private static final FUSION_TABLE = '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F'
    private static final KEY_COLUMN = 'ISO'
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
                            name             : it.title,
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
                def sceneIds = fromJson(params.required('sceneIds', String)) as List<String>
                submit(new SubmitTask(
                        operation: 'landsat-scene-download',
                        params: [
                                dataSet : params.required('dataSet'),
                                sceneIds: sceneIds
                        ],
                        username: currentUser.username
                ))
                send toJson([status: 'OK'])
            }

            post('/data/mosaic/retrieve') {
                response.contentType = "application/json"
                submit(new SubmitTask(
                        operation: 'google-earth-engine-download',
                        params: [
                                name : params.required('name'),
                                image: [
                                        dataSet: params['dataSet'] as DataSet ?: DataSet.LANDSAT,
                                        type                 : 'manual',
                                        aoi                  : ((params.polygon as String) ?
                                                new AoiPolygon(
                                                        new JsonSlurper().parseText(
                                                                params.required('polygon', String)
                                                        ) as List
                                                ) :
                                                new FusionTableShape(
                                                        tableName: FUSION_TABLE,
                                                        keyColumn: KEY_COLUMN,
                                                        keyValue: params.required('countryIso', String))).params,
                                        bands                : params.required('bands', String).split(',')*.trim(),
                                        targetDayOfYear      : params.required('targetDayOfYear', int),
                                        targetDayOfYearWeight: params.required('targetDayOfYearWeight', double),
                                        sceneIds             : params.required('sceneIds', String).split(',')*.trim()
                                ]
                        ],
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
