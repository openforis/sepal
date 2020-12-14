package component.workersession.integration

import fake.FakeClock
import groovymvc.Controller
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workersession.api.Spending
import org.openforis.sepal.component.workersession.api.UserSessionReport
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.command.CloseSession
import org.openforis.sepal.component.workersession.command.Heartbeat
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.component.workersession.endpoint.SandboxSessionEndpoint
import org.openforis.sepal.component.workersession.query.GenerateUserSessionReport
import org.openforis.sepal.util.DateTime
import spock.lang.Ignore
import util.AbstractComponentEndpointTest

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING
import static org.openforis.sepal.workertype.WorkerTypes.SANDBOX

@Ignore
@SuppressWarnings("GroovyAssignabilityCheck")
class SandboxSessionEndpoint_Test extends AbstractComponentEndpointTest {
    private final clock = new FakeClock()

    void registerEndpoint(Controller controller) {
        new SandboxSessionEndpoint(component, clock)
            .registerWith(controller)
    }

    def 'GET /sandbox/report, return well formatted JSON'() {
        clock.set('2016-01-03')
        def instanceType = new InstanceType(
            id: 'some-instance-type',
            name: 'Some instance type',
            tag: 't',
            hourlyCost: 0.1,
            cpuCount: 3,
            ramGiB: 123
        )
        def report = new UserSessionReport(
            sessions: [
                new WorkerSession(
                    id: 'some-session',
                    username: testUsername,
                    instance: new WorkerInstance(host: 'some-host'),
                    state: PENDING,
                    instanceType: 'some-instance-type',
                    creationTime: DateTime.parseDateString('2016-01-01')
                )
            ],
            instanceTypes: [instanceType],
            spending: new Spending(
                monthlyInstanceBudget: 1,
                monthlyInstanceSpending: 2,
                monthlyStorageBudget: 3,
                monthlyStorageSpending: 4,
                storageQuota: 5,
                storageUsed: 6,
                costPerGbMonth: 0
            ))

        when:
        get(path: 'sessions/report')

        then:
        status == 200
        1 * component.submit(new GenerateUserSessionReport(username: testUsername, workerType: SANDBOX)) >> report

        sameJson(response.data, [
            sessions: [[
                           id: 'some-session',
                           path: 'sessions/session/some-session',
                           username: testUsername,
                           status: 'STARTING',
                           host: 'some-host',
                           instanceType: [
                               cpuCount: 3,
                               ramGiB: 123,
                               path: "sessions/instance-type/$instanceType.id",
                               id: instanceType.id,
                               name: instanceType.name,
                               tag: 't',
                               description: instanceType.description,
                               hourlyCost: instanceType.hourlyCost
                           ],
                           earliestTimeoutHours: 0.0,
                           creationTime: '2016-01-01T00:00:00',
                           costSinceCreation: 0.1 * 2 * 24 // hourly cost * two days
                       ]],
            instanceTypes: [[
                                cpuCount: 3,
                                ramGiB: 123,
                                path: "sessions/instance-type/$instanceType.id",
                                id: instanceType.id,
                                name: instanceType.name,
                                tag: 't',
                                description: instanceType.description,
                                hourlyCost: instanceType.hourlyCost
                            ]],
            spending: [
                monthlyInstanceBudget: 1d,
                monthlyInstanceSpending: 2d,
                monthlyStorageBudget: 3d,
                monthlyStorageSpending: 4d,
                storageQuota: 5d,
                storageUsed: 6d,
                costPerGbMonth: 0d
            ]
        ])
    }

    def 'POST /sessions/instance-type/{instanceType}, session is requested and requested session is returned'() {
        def session = new WorkerSession(
            id: 'some-session',
            instance: new WorkerInstance(host: 'some-host'),
            instanceType: 'some-instance-type',
            state: PENDING
        )
        when:
        post(path: "sessions/instance-type/$session.instanceType")

        then:
        1 * component.submit(new RequestSession(
            instanceType: session.instanceType,
            workerType: SANDBOX,
            username: testUsername
        )) >> session
        status == 201
        sameJson(response.data, [
            id: 'some-session',
            path: 'sessions/session/some-session',
            username: testUsername,
            status: 'STARTING',
            host: 'some-host'
        ])
    }

    def 'POST /sessions/session/{sessionId}, heartbeat is sent and session is returned'() {
        def session = new WorkerSession(
            id: 'some-session',
            instance: new WorkerInstance(host: 'some-host'),
            instanceType: 'some-instance-type',
            state: ACTIVE
        )
        when:
        post(path: "sessions/session/some-session")

        then:
        1 * component.submit(new Heartbeat(
            sessionId: session.id,
            username: testUsername
        )) >> session
        status == 200
        sameJson(response.data, [
            id: 'some-session',
            path: "sessions/session/some-session",
            username: testUsername,
            status: 'ACTIVE',
            host: 'some-host'
        ])
    }

    def 'DELETE /sessions/session/{sessionId}, session is closed'() {
        when:
        delete(path: "sessions/session/some-session")

        then:
        1 * component.submit(new CloseSession(
            sessionId: 'some-session',
            username: testUsername
        ))
        status == 204
    }
}
