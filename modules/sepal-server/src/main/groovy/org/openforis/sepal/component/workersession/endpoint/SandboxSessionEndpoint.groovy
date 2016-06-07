package org.openforis.sepal.component.workersession.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.workersession.api.InstanceType
import org.openforis.sepal.component.workersession.api.Spending
import org.openforis.sepal.component.workersession.api.UserSessionReport
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.command.CloseSession
import org.openforis.sepal.component.workersession.command.Heartbeat
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.component.workersession.query.GenerateUserSessionReport
import org.openforis.sepal.util.Clock

import java.time.Duration

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.workertype.WorkerTypes.SANDBOX

class SandboxSessionEndpoint {
    private final Component component
    private final Clock clock

    SandboxSessionEndpoint(Component component, Clock clock) {
        this.component = component
        this.clock = clock
    }

    void registerWith(Controller controller) {
        controller.with {
            get('/sandbox/report') {
                response.contentType = 'application/json'
                def report = component.submit(new GenerateUserSessionReport(username: currentUser.username, workerType: SANDBOX))
                def map = reportAsMap(report)
                send toJson(map)
            }

            post('/sandbox/instance-type/{instanceType}') {
                response.contentType = 'application/json'
                response.status = 201
                def session = component.submit(new RequestSession(
                        instanceType: params.required('instanceType'),
                        workerType: SANDBOX,
                        username: currentUser.username
                ))
                send toJson([
                        path  : "sandbox/session/$session.id",
                        status: sessionStatus(session)
                ])
            }

            post('/sandbox/session/{sessionId}') {
                response.contentType = 'application/json'
                def session = component.submit(new Heartbeat(
                        sessionId: params.required('sessionId'),
                        username: currentUser.username
                ))
                send toJson([
                        path  : "sandbox/session/$session.id",
                        status: sessionStatus(session)
                ])
            }

            delete('/sandbox/session/{sessionId}') {
                response.status = 204
                component.submit(new CloseSession(
                        sessionId: params.required('sessionId'),
                        username: currentUser.username
                ))
            }
        }
    }

    private Map reportAsMap(UserSessionReport report) {
        def instanceTypeById = report.instanceTypes.collectEntries {
            [(it.id): it]
        } as Map<String, InstanceType>
        [
                sessions     : report.sessions.collect { sessionAsMap(it, instanceTypeById[it.instanceType]) },
                instanceTypes: report.instanceTypes.collect { instanceTypeAsMap(it) },
                spending     : spendingAsMap(report.spending)
        ]
    }

    private Map sessionAsMap(WorkerSession session, InstanceType instanceType) {
        [
                path             : "sandbox/session/$session.id",
                status           : sessionStatus(session),
                instanceType     : instanceTypeAsMap(instanceType),
                creationTime     : session.creationTime.format("yyyy-MM-dd'T'HH:mm:ss"),
                costSinceCreation: (instanceType.hourlyCost * hoursSince(session.creationTime)).round(2)
        ]
    }

    private String sessionStatus(WorkerSession session) {
        session.state == WorkerSession.State.PENDING ? 'STARTING' : 'ACTIVE'
    }

    private Map instanceTypeAsMap(InstanceType instanceType) {
        [
                id         : instanceType.id,
                path       : "sandbox/instance-type/$instanceType.id",
                name       : instanceType.name,
                description: instanceType.description,
                hourlyCost : instanceType.hourlyCost
        ]
    }

    private Map spendingAsMap(Spending spending) {
        [
                monthlyInstanceBudget  : spending.monthlyInstanceBudget,
                monthlyInstanceSpending: spending.monthlyInstanceSpending,
                monthlyStorageBudget   : spending.monthlyStorageBudget,
                monthlyStorageSpending : spending.monthlyStorageSpending,
                storageQuota           : spending.storageQuota,
                storageUsed            : spending.storageUsed
        ]
    }

    private int hoursSince(Date date) {
        Math.ceil(Duration.between(date.toInstant(), clock.now().toInstant()).toMinutes() / 60)
    }
}
