package endpoint

import fake.FakeUserProvider
import fake.FakeUsernamePasswordVerifier
import groovymvc.Controller
import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import groovyx.net.http.RESTClient
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.endpoint.EndpointRegistry
import org.openforis.sepal.taskexecutor.endpoint.Endpoints
import org.openforis.sepal.taskexecutor.endpoint.TaskExecutorEndpoint
import org.openforis.sepal.taskexecutor.api.TaskManager
import spock.lang.Specification
import util.Port

import static groovy.json.JsonOutput.toJson

class TaskExecutorEndpointTest extends Specification {
    final port = Port.findFree()

    final passwordVerifier = new FakeUsernamePasswordVerifier()
    final userProvider = new FakeUserProvider()
    final taskManager = Mock(TaskManager)

    final client = new RESTClient("http://localhost:$port/api/")

    def setup() {
        def pathRestrictions = new PathRestrictions(userProvider, new BasicRequestAuthenticator('Sepal', passwordVerifier))
        EndpointRegistry registry = { registerEndpoint(it) }
        Endpoints.deploy(port, pathRestrictions, registry)
        client.handler.failure = { resp -> return resp }
        client.auth.basic 'some-user', 'some-password'
    }

    void registerEndpoint(Controller controller) {
        new TaskExecutorEndpoint(taskManager)
                .registerEndpointsWith(controller)
    }

    def 'POST /tasks'() {
        def task = new Task(id: 'some-id', operation: 'some-operation', params: [some: 'params'])

        when:
        def response = client.post(path: 'tasks', query: [
                id       : task.id,
                operation: task.operation,
                params   : toJson(task.params)
        ])

        then:
        1 * taskManager.execute(task)
        response.status == 201
    }

    def 'DELETE /tasks/{taskId}'() {
        def taskId = 'some-id'

        when:
        def response = client.delete(path: "tasks/$taskId")

        then:
        1 * taskManager.cancel(taskId)
        response.status == 204
    }
}
