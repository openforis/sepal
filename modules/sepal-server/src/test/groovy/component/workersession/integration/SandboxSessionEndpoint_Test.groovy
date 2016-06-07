package component.workersession.integration

import groovymvc.Controller
import org.openforis.sepal.component.workersession.api.InstanceType
import org.openforis.sepal.component.workersession.api.Spending
import org.openforis.sepal.component.workersession.api.UserSessionReport
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.command.CloseSession
import org.openforis.sepal.component.workersession.command.Heartbeat
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.component.workersession.endpoint.SandboxSessionEndpoint
import org.openforis.sepal.component.workersession.query.GenerateUserSessionReport
import org.openforis.sepal.util.DateTime
import sandboxmanager.FakeClock
import util.AbstractComponentEndpointTest

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING
import static org.openforis.sepal.workertype.WorkerTypes.SANDBOX

@SuppressWarnings("GroovyAssignabilityCheck")
class SandboxSessionEndpoint_Test extends AbstractComponentEndpointTest {
    private final clock = new FakeClock()

    void registerEndpoint(Controller controller) {
        new SandboxSessionEndpoint(component, clock)
                .registerWith(controller)
    }

    def 'GET /sandbox/report, return well formatted JSON'() {
        clock.set('2016-01-03')
        def report = new UserSessionReport(
                sessions: [
                        new WorkerSession(
                                id: 'some-session',
                                state: PENDING,
                                instanceType: 'some-instance-type',
                                creationTime: DateTime.parseDateString('2016-01-01')
                        )
                ],
                instanceTypes: [
                        new InstanceType(
                                id: 'some-instance-type',
                                name: 'Some instance type',
                                description: 'Some instance type description',
                                hourlyCost: 0.1
                        )
                ],
                spending: new Spending(
                        monthlyInstanceBudget: 1,
                        monthlyInstanceSpending: 2,
                        monthlyStorageBudget: 3,
                        monthlyStorageSpending: 4,
                        storageQuota: 5,
                        storageUsed: 6
                ))

        when:
        get(path: 'sandbox/report')

        then:
        status == 200
        1 * component.submit(new GenerateUserSessionReport(username: testUsername, workerType: SANDBOX)) >> report

        sameJson(response.data, [
                sessions     : [[
                                        path             : 'sandbox/session/some-session',
                                        status           : 'STARTING',
                                        instanceType     : [
                                                path       : "sandbox/instance-type/some-instance-type",
                                                id         : 'some-instance-type',
                                                name       : 'Some instance type',
                                                description: 'Some instance type description',
                                                hourlyCost : 0.1
                                        ],
                                        creationTime     : '2016-01-01T00:00:00',
                                        costSinceCreation: 0.1 * 2 * 24 // hourly cost * two days
                                ]],
                instanceTypes: [[
                                        path       : "sandbox/instance-type/some-instance-type",
                                        id         : 'some-instance-type',
                                        name       : 'Some instance type',
                                        description: 'Some instance type description',
                                        hourlyCost : 0.1
                                ]],
                spending     : [
                        monthlyInstanceBudget  : 1d,
                        monthlyInstanceSpending: 2d,
                        monthlyStorageBudget   : 3d,
                        monthlyStorageSpending : 4d,
                        storageQuota           : 5d,
                        storageUsed            : 6d
                ]
        ])
    }

    def 'POST /sandbox/instance-type/{instanceType}, session is requested and requested session is returned'() {
        def session = new WorkerSession(
                id: 'some-session',
                instanceType: 'some-instance-type',
                state: PENDING
        )
        when:
        post(path: "sandbox/instance-type/$session.instanceType")

        then:
        1 * component.submit(new RequestSession(
                instanceType: session.instanceType,
                workerType: SANDBOX,
                username: testUsername
        )) >> session
        status == 201
        sameJson(response.data, [
                path  : "sandbox/session/$session.id",
                status: 'STARTING'
        ])
    }

    def 'POST /sandbox/session/{sessionId}, heartbeat is sent and session is returned'() {
        def session = new WorkerSession(
                id: 'some-session',
                instanceType: 'some-instance-type',
                state: ACTIVE
        )
        when:
        post(path: "sandbox/session/$session.id")

        then:
        1 * component.submit(new Heartbeat(
                sessionId: session.id,
                username: testUsername
        )) >> session
        status == 200
        sameJson(response.data, [
                path  : "sandbox/session/$session.id",
                status: 'ACTIVE'
        ])
    }

    def 'DELETE /sandbox/session/{sessionId}, session is closed'() {
        when:
        delete(path: "sandbox/session/some-session")

        then:
        1 * component.submit(new CloseSession(
                sessionId: 'some-session',
                username: testUsername
        ))
        status == 204
    }
}
