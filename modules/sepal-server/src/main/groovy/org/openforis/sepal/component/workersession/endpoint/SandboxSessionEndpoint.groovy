package org.openforis.sepal.component.workersession.endpoint

import groovymvc.Controller
import groovymvc.RequestContext
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.hostingservice.api.InstanceType
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
import static org.openforis.sepal.security.Roles.ADMIN
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
                currentUser(requestContext).generateReport()
            }
            get('/sandbox/{username}/report', [ADMIN]) {
                otherUser(requestContext).generateReport()
            }


            post('/sandbox/instance-type/{instanceType}') {
                currentUser(requestContext).requestSession()
            }
            post('/sandbox/{username}/instance-type/{instanceType}', [ADMIN]) {
                otherUser(requestContext).requestSession()
            }


            post('/sandbox/session/{sessionId}') {
                currentUser(requestContext).sendHeartbeat()
            }
            post('/sandbox/{username}/session/{sessionId}', [ADMIN]) {
                otherUser(requestContext).sendHeartbeat()
            }


            delete('/sandbox/session/{sessionId}') {
                currentUser(requestContext).closeSession()
                send toJson(status: 'OK')
            }
            delete('/sandbox/{username}/session/{sessionId}', [ADMIN]) {
                otherUser(requestContext).closeSession()
                send toJson(status: 'OK')
            }
        }
    }

    private Handler otherUser(RequestContext context) {
        new Handler(context, context.params.required('username', String), false)
    }

    private Handler currentUser(RequestContext context) {
        new Handler(context, context.currentUser.username, true)
    }

    class Handler {
        private final RequestContext context
        private final String username
        private final boolean forCurrentUser

        private Handler(RequestContext context, String username, boolean forCurrentUser) {
            this.context = context
            this.username = username
            this.forCurrentUser = forCurrentUser
        }

        void generateReport() {
            context.with {
                response.contentType = 'application/json'
                def report = component.submit(new GenerateUserSessionReport(
                        username: username,
                        workerType: SANDBOX))
                def map = reportAsMap(report)
                send toJson(map)
            }
        }

        void requestSession() {
            context.with {
                response.contentType = 'application/json'
                response.status = 201
                def session = component.submit(new RequestSession(
                        instanceType: params.required('instanceType'),
                        workerType: SANDBOX,
                        username: username
                ))
                send toJson([
                        id      : session.id,
                        path    : "sandbox/${forCurrentUser ? '' : "$username/"}session/$session.id",
                        username: username,
                        status  : sessionStatus(session),
                        host    : session.instance.host
                ])
            }
        }

        void sendHeartbeat() {
            context.with {
                response.contentType = 'application/json'
                def session = component.submit(new Heartbeat(
                        sessionId: params.required('sessionId'),
                        username: username
                ))
                send toJson([
                        id      : session.id,
                        path    : "sandbox/${forCurrentUser ? '' : "$username/"}session/$session.id",
                        username: username,
                        status  : sessionStatus(session),
                        host    : session.instance.host
                ])
            }
        }

        void closeSession() {
            context.with {
                response.status = 204
                component.submit(new CloseSession(
                        sessionId: params.required('sessionId'),
                        username: username
                ))
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
                    id               : session.id,
                    path             : "sandbox/${forCurrentUser ? '' : "$username/"}session/$session.id",
                    username         : username,
                    status           : sessionStatus(session),
                    host             : session.instance.host,
                    instanceType     : instanceTypeAsMap(instanceType),
                    creationTime     : session.creationTime.format("yyyy-MM-dd'T'HH:mm:ss"),
                    costSinceCreation: (instanceType.hourlyCost * hoursSince(session.creationTime)).round(2)
            ]
        }

        private Map instanceTypeAsMap(InstanceType instanceType) {
            [
                    id         : instanceType.id,
                    path       : "sandbox/${forCurrentUser ? '' : "$username/"}instance-type/$instanceType.id",
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

        private String sessionStatus(WorkerSession session) {
            session.state == WorkerSession.State.PENDING ? 'STARTING' : 'ACTIVE'
        }
    }
}
