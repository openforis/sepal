package endpoint

import fake.FakeUserProvider
import fake.FakeUsernamePasswordVerifier
import groovymvc.Controller
import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import groovyx.net.http.RESTClient
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.endpoint.ResourceServer
import org.openforis.sepal.endpoint.Server
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskManager
import org.openforis.sepal.taskexecutor.endpoint.Endpoints
import org.openforis.sepal.taskexecutor.endpoint.TaskExecutorEndpoint
import spock.lang.Specification
import util.Port

import static groovy.json.JsonOutput.toJson

class TaskExecutorEndpointTest extends Specification {
    final passwordVerifier = new FakeUsernamePasswordVerifier()
    final userProvider = new FakeUserProvider()
    final taskManager = Mock(TaskManager)

    final server = new ResourceServer(Port.findFree(), '/api', new Endpoints(
            new PathRestrictions(userProvider, new BasicRequestAuthenticator('Sepal', passwordVerifier)),
            { registerEndpoint(it) } as EndpointRegistry))
    final client = new RESTClient("http://$server.host/api/")

    def setup() {
        server.start()
        client.handler.failure = { resp -> return resp }
        client.auth.basic 'some-user', 'some-password'
        userProvider.addRole('ADMIN')
    }

    def cleanup() {
        server.stop()
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
        response.status == 201
        1 * taskManager.execute(task)
    }

    def 'DELETE /tasks/{taskId}'() {
        def taskId = 'some-id'

        when:
        def response = client.delete(path: "tasks/$taskId")

        then:
        response.status == 204
        1 * taskManager.cancel(taskId)
    }
}
