package sandboxmanager

import fake.FakeUserRepository
import groovy.json.JsonOutput
import groovyx.net.http.RESTClient
import org.openforis.sepal.command.Command
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.command.CloseSession
import org.openforis.sepal.component.sandboxmanager.command.CreateSession
import org.openforis.sepal.component.sandboxmanager.command.JoinSession
import org.openforis.sepal.component.sandboxmanager.endpoint.SepalSessionEndpoint
import org.openforis.sepal.component.sandboxmanager.query.FindInstanceTypes
import org.openforis.sepal.component.sandboxmanager.query.LoadSandboxInfo
import org.openforis.sepal.component.sandboxmanager.query.SandboxInfo
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.QueryDispatcher
import spock.lang.Specification
import util.Port

import static groovy.json.JsonOutput.prettyPrint
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.ACTIVE
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.STARTING

@SuppressWarnings("GroovyAssignabilityCheck")
class SepalSessionEndpointTest extends Specification {
    def port = Port.findFree()

    def queryDispatcher = Mock(QueryDispatcher)
    def commandDispatcher = Mock(CommandDispatcher)
    def userRepository = new FakeUserRepository()
    def clock = new FakeClock()

    def client = new RESTClient("http://localhost:$port/data/")

    def setup() {
        EndpointRegistry registry = {
            new SepalSessionEndpoint(queryDispatcher, commandDispatcher, userRepository, clock)
                    .registerWith(it)
        }
        Endpoints.deploy(port, registry)
        client.handler.failure = { resp -> return resp }
    }

    def cleanup() {
        Endpoints.undeploy()
    }

    def 'GET sandbox/{user} submits LoadSandboxInfo command and returns expected JSON'() {
        clock.set('2015-01-03')
        def info = new SandboxInfo(
                activeSessions: [
                        new SandboxSession(
                                id: 1,
                                host: 'some-host',
                                port: 123,
                                status: ACTIVE,
                                username: 'some-user',
                                instanceType: 'some_instance_type',
                                creationTime: Date.parse('yyyy-MM-dd', '2015-01-01'),
                        )
                ],
                startingSessions: [
                        new SandboxSession(
                                id: 2,
                                host: 'some-host',
                                port: 123,
                                status: STARTING,
                                username: 'some-user',
                                instanceType: 'another_instance_type',
                                creationTime: Date.parse('yyyy-MM-dd', '2015-01-02')
                        )
                ],
                instanceTypes: [
                        new WorkerInstanceType(
                                id: 'some_instance_type',
                                name: 'Some instance type',
                                description: 'Some description',
                                hourlyCost: 0.1
                        ),
                        new WorkerInstanceType(
                                id: 'another_instance_type',
                                name: 'Another instance type',
                                description: 'Another description',
                                hourlyCost: 0.2
                        )
                ],
                monthlyInstanceBudget: 123,
                monthlyInstanceSpending: 5,
                monthlyStorageBudget: 9d,
                monthlyStorageSpending: 8d,
                storageQuota: 7d,
                storageUsed: 6d,
        )

        def expectation = [
                sessions: [[
                        id: 1,
                        path: "sandbox/some-user/session/1",
                        host: "some-host",
                        port: 123,
                        username: "some-user",
                        status: 'ACTIVE',
                        instanceType: [
                                id: 'some_instance_type',
                                name: 'Some instance type',
                                description: 'Some description',
                                hourlyCost: 0.1,
                        ],
                        creationTime: '2015-01-01T00:00:00',
                        costSinceCreation: 0.1 * 2 * 24
                ], [
                        id: 2,
                        path: "sandbox/some-user/session/2",
                        host: "some-host",
                        port: 123,
                        username: "some-user",
                        status: 'STARTING',
                        instanceType: [
                                id: 'another_instance_type',
                                name: 'Another instance type',
                                description: 'Another description',
                                hourlyCost: 0.2,
                        ],
                        creationTime: '2015-01-02T00:00:00',
                        "costSinceCreation": 4.8
                ]],
                instanceTypes: [[
                        path: "sandbox/some-user/instance-type/some_instance_type",
                        id: 'some_instance_type',
                        name: 'Some instance type',
                        description: 'Some description',
                        hourlyCost: 0.1
                ], [path: "sandbox/some-user/instance-type/another_instance_type",
                        id: 'another_instance_type',
                        name: 'Another instance type',
                        description: 'Another description',
                        hourlyCost: 0.2
                ]],
                monthlyInstanceBudget: 123d,
                monthlyInstanceSpending: 5d,
                monthlyStorageBudget: 9d,
                monthlyStorageSpending: 8d,
                storageQuota: 7d,
                storageUsed: 6d,

        ]

        when:
        def response = client.get(path: 'sandbox/some-user')

        then:
        1 * queryDispatcher.submit(_ as LoadSandboxInfo) >> info
        def infoJson = response.data

        sameJson(infoJson, expectation)
    }

    def 'GET sandbox/{user} returns 400 for unknown users'() {
        userRepository.doesNotContainUser()

        when:
        def response = client.get(path: 'sandbox/some-user')

        then:
        0 * queryDispatcher.submit(_)
        response.status == 400
    }

    def 'POST sandbox/{user}/session/{sessionId} returns 400 for non-numeric sessionId'() {
        when:
        def response = client.post(path: 'sandbox/some-user/session/non-numeric-sessionId')

        then:
        0 * commandDispatcher.submit(_)
        response.status == 400
    }

    def 'POST sandbox/{user}/session/{sessionId} returns 404 for non-existing sessionId'() {
        when:
        def response = client.post(path: 'sandbox/some-user/session/999')

        then:
        1 * commandDispatcher.submit(_ as JoinSession) >> {
            failExecution(new SandboxSessionProvider.NotAvailable(it[0].sessionId, "Unable to join session, since it's not available"))
        }
        response.status == 404
    }

    def 'POST sandbox/{user}/session/{sessionId} for starting session returns 202'() {
        when:
        def response = client.post(path: 'sandbox/some-user/session/999')

        then:
        1 * queryDispatcher.submit(_ as FindInstanceTypes) >> [new WorkerInstanceType()]
        1 * commandDispatcher.submit(_ as JoinSession) >> startingSession()
        response.status == 202
    }

    def 'DELETE sandbox/{user}/session/{sessionId} closes session and returns 201'() {
        when:
        def response = client.delete(path: 'sandbox/some-user/session/999')

        then:
        1 * commandDispatcher.submit(_ as CloseSession)
        response.status == 201
    }


    def 'POST sandbox/{user}/instance-type/{instanceType} creates a session, returns the session and status of 201, if ACTIVE'() {
        when:
        def response = client.post(path: 'sandbox/some-user/instance-type/some-type')

        then:
        1 * queryDispatcher.submit(_ as FindInstanceTypes) >> [new WorkerInstanceType()]
        1 * commandDispatcher.submit(_ as CreateSession) >> activeSession()
        response.status == 201
        response.data.status == 'ACTIVE'
    }

    def 'POST sandbox/{user}/instance-type/{instanceType} creates a session and returns 202 if STARTING'() {
        when:
        def response = client.post(path: 'sandbox/some-user/instance-type/some-type')

        then:
        1 * queryDispatcher.submit(_ as FindInstanceTypes) >> [new WorkerInstanceType()]
        1 * commandDispatcher.submit(_ as CreateSession) >> startingSession()
        response.status == 202
    }

    SandboxSession startingSession(String username = 'some-user') {
        new SandboxSession(id: 999, status: STARTING, creationTime: new Date(), username: username)
    }

    SandboxSession activeSession(String username = 'some-user') {
        new SandboxSession(id: 999, status: ACTIVE, creationTime: new Date(), username: username)
    }

    def failExecution(Exception e) {
        throw new ExecutionFailed({} as CommandHandler, {} as Command, e)
    }

    private void sameJson(Map result, Map expectation) {
        def expectationString = prettyPrint(JsonOutput.toJson(recursiveSort(expectation)))
        def resultString = prettyPrint(JsonOutput.toJson(recursiveSort(result)))
        assert resultString == expectationString
    }

    private <T> T recursiveSort(T t) {
        if (t instanceof Map)
            t = t.each {
                t[it.key] = recursiveSort(it.value)
            }.sort()
        else if (t instanceof List)
            t.eachWithIndex { item, i ->
                t.set(i, recursiveSort(item))
            }
        return t
    }

}

