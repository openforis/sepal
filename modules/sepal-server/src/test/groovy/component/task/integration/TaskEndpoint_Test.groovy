package component.task.integration

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.endpoint.TaskEndpoint
import org.openforis.sepal.component.task.query.UserTasks
import util.AbstractComponentEndpointTest

import static groovy.json.JsonOutput.toJson
import static groovyx.net.http.ContentType.JSON
import static org.openforis.sepal.security.Roles.TASK_EXECUTOR

@SuppressWarnings("GroovyAssignabilityCheck")
class TaskEndpoint_Test extends AbstractComponentEndpointTest {
    void registerEndpoint(Controller controller) {
        new TaskEndpoint(component)
            .registerWith(controller)
    }

    def 'Given no tasks, GET /tasks, queries UserTasks and returns empty array'() {
        when:
        get(path: 'tasks')

        then:
        1 * component.submit(new UserTasks(username: testUsername)) >> []
        sameJson(response.data, [])
    }

    def 'Given a task, GET /tasks, queries UserTasks returns the task'() {
        def task = task()
        when:
        def response = get(path: 'tasks')
        println response

        then:
        status == 200
        1 * component.submit(new UserTasks(username: testUsername)) >> [task]

        sameJson(response.data, [
            [
                id: task.id,
                recipeId: null,
                name: task.operation,
                status: task.state.name(),
                statusDescription: task.statusDescription
            ]])
    }

    def 'POST /tasks, submits SubmitTask'() {
        def body = [
            instanceType: 'some-instance-type',
            operation: 'some-operation',
            params: toJson(some: 'params'),
            username: testUsername
        ]
        when:
        post(path: 'tasks', body: body, contentType: JSON)

        then:
        status == 200
        1 * component.submit(new SubmitTask(
            instanceType: body.instanceType,
            operation: body.operation,
            params: fromJson(body.params),
            username: body.username
        ))
    }

    def 'POST /tasks/task/{id}/cancel, submits CancelTask'() {
        def taskId = 123

        when:
        post(path: "tasks/task/$taskId/cancel")

        then:
        status == 204
        1 * component.submit(new CancelTask(taskId: taskId, username: testUsername))
    }

    def 'POST /tasks/task/{id}/remove, submits RemoveTask'() {
        def taskId = 123

        when:
        post(path: "tasks/task/$taskId/remove")

        then:
        status == 204
        1 * component.submit(new RemoveTask(taskId: taskId, username: testUsername))
    }

    def 'POST /tasks/task/{id}/execute, submits ResubmitTask'() {
        def taskId = 123


        when:
        post(path: "tasks/task/$taskId/execute")

        then:
        status == 204
        1 * component.submit(new ResubmitTask(
            taskId: taskId,
            username: testUsername))
    }

    def 'POST /tasks/remove, submits RemoveUserTasks'() {
        when:
        post(path: "tasks/remove")

        then:
        status == 204
        1 * component.submit(new RemoveUserTasks(username: testUsername))
    }

    def 'Given TASK_EXECUTOR, POST /tasks/task/{id}/state-updated, submits UpdateTaskProgress'() {
        inRole(TASK_EXECUTOR)
        def taskId = 123
        def query = [
            instanceType: 'some-instance-type',
            state: 'PENDING',
            statusDescription: 'some-status-description'
        ]


        when:
        post(path: "tasks/task/$taskId/state-updated", query: query)

        then:
        status == 204
        1 * component.submit(new UpdateTaskProgress(
            taskId: taskId,
            state: query.state as Task.State,
            statusDescription: query.statusDescription,
            username: testUsername))
    }

    def 'Given not TASK_EXECUTOR, POST /tasks/task/{id}/state-updated, return 403'() {
        def taskId = 123
        def query = [
            instanceType: 'some-instance-type',
            state: 'PENDING',
            statusDescription: 'some-status-description'
        ]


        when:
        post(path: "tasks/task/$taskId/state-updated", query: query)

        then:
        status == 403
    }

    Task task() {
        new Task(
            id: 'some-task-id',
            state: Task.State.ACTIVE,
            username: testUsername,
            operation: 'some-operation',
            params: [some: 'parameters'],
            sessionId: 'some-session-id',
            statusDescription: 'some-status-description',
            creationTime: new Date(),
            updateTime: new Date()

        )
    }

    private Map fromJson(String json) {
        new JsonSlurper().parseText(json) as Map
    }
}
