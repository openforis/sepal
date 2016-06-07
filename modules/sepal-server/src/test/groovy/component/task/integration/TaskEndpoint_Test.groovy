package component.task.integration

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.command.CancelTask
import org.openforis.sepal.component.task.command.SubmitTask
import org.openforis.sepal.component.task.endpoint.TaskEndpoint
import org.openforis.sepal.component.task.query.UserTasks
import util.AbstractComponentEndpointTest

import static groovy.json.JsonOutput.toJson

@SuppressWarnings("GroovyAssignabilityCheck")
class TaskEndpoint_Test extends AbstractComponentEndpointTest {
    void registerEndpoint(Controller controller) {
        new TaskEndpoint(component)
                .registerWith(controller)
    }

    def 'Given no tasks, GET /tasks, submits UserTasks returns empty array'() {
        when:
        def response = get(path: 'tasks')
        println response

        then:
        1 * component.submit(new UserTasks(username: testUsername)) >> []

        sameJson(response.data, [])
    }

    def 'Given a task, GET /tasks, submits UserTasks returns empty array'() {
        def task = task()
        when:
        def response = get(path: 'tasks')
        println response

        then:
        1 * component.submit(new UserTasks(username: testUsername)) >> [task]

        sameJson(response.data, [
                [
                        id               : task.id,
                        name             : task.operation,
                        status           : task.state.name(),
                        statusDescription: task.statusDescription
                ]])
    }

    def 'POST /tasks, submits SubmitTask'() {
        def query = [
                instanceType: 'some-instance-type',
                operation   : 'some-operation',
                params      : toJson(some: 'params'),
                username    : testUsername
        ]
        when:
        post(path: 'tasks', query: query)

        then:
        1 * component.submit(new SubmitTask(
                instanceType: query.instanceType,
                operation: query.operation,
                params: fromJson(query.params),
                username: query.username
        ))
    }

    def 'POST /tasks/task/{id}/cancel, submits CancelTask'() {
        def taskId = 123

        when:
        post(path: "tasks/task/$taskId/cancel")

        then:
        1 * component.submit(new CancelTask(taskId: taskId, username: testUsername))
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
