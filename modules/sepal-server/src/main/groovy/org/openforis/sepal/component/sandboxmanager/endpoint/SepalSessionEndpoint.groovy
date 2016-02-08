package org.openforis.sepal.component.sandboxmanager.endpoint

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.command.CloseSession
import org.openforis.sepal.component.sandboxmanager.command.CreateSession
import org.openforis.sepal.component.sandboxmanager.command.JoinSession
import org.openforis.sepal.component.sandboxmanager.command.SessionHeartbeatReceived
import org.openforis.sepal.component.sandboxmanager.query.FindInstanceTypes
import org.openforis.sepal.component.sandboxmanager.query.LoadSandboxInfo
import org.openforis.sepal.component.sandboxmanager.query.LoadSession
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.QueryDispatcher
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.Clock

import java.time.Duration

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.hostingservice.Status.ACTIVE
import static org.openforis.sepal.hostingservice.Status.STARTING

class SepalSessionEndpoint {
    private final QueryDispatcher queryDispatcher
    private final CommandDispatcher commandDispatcher
    private final UserRepository userRepository
    private final Clock clock

    SepalSessionEndpoint(QueryDispatcher queryDispatcher,
                         CommandDispatcher commandDispatcher,
                         UserRepository userRepository,
                         Clock clock) {
        this.queryDispatcher = queryDispatcher
        this.commandDispatcher = commandDispatcher
        this.userRepository = userRepository
        this.clock = clock
    }

    void registerWith(Controller controller) {
        controller.with {
            constrain(CreateSession, CreateSession.constraints(userRepository))
            constrain(JoinSession, JoinSession.constraints(userRepository))
            constrain(LoadSandboxInfo, LoadSandboxInfo.constraints(userRepository))

            error(ExecutionFailed, SandboxSessionProvider.NotAvailable) {
                response.status = 404
                send(toJson(sessionId: it.sessionId, message: "sessionId $it.sessionId not available"))
            }

            get('sandbox/{user}') {
                response.contentType = "application/json"
                def query = new LoadSandboxInfo(username: params.user)
                validateRequest(query)
                def info = queryDispatcher.submit(query)
                def instanceTypes = info.instanceTypes
                def instanceTypeById = instanceTypesById(instanceTypes)
                def responseBodyMap = [
                        sessions: info.activeSessions.collect { toSessionMap(it, instanceTypeById) }
                                + info.startingSessions.collect { toSessionMap(it, instanceTypeById) },
                        instanceTypes: instanceTypes.collect {
                            [
                                    path: "sandbox/$query.username/instance-type/$it.id",
                                    id: it.id,
                                    name: it.name,
                                    description: it.description,
                                    hourlyCost: it.hourlyCost
                            ]
                        },
                        monthlyInstanceBudget: info.monthlyInstanceBudget,
                        monthlyInstanceSpending: info.monthlyInstanceSpending
                ]
                send(toJson(responseBodyMap))
            }

            get('sandbox/{user}/session/{sessionId}') {
                response.contentType = 'application/json'
                def query = new LoadSession(username: params.user, sessionId: params.required('sessionId', long))
                def session = queryDispatcher.submit(query)
                def sessionMap = toSessionMap(session, instanceTypesById())
                send(toJson(sessionMap))
            }

            post('sandbox/{user}/session/{sessionId}') {
                response.contentType = 'application/json'
                def command = new JoinSession(username: params.user, sessionId: params.required('sessionId', long))
                validateRequest(command)
                def session = commandDispatcher.submit(command)
                def sessionMap = toSessionMap(session, instanceTypesById())
                send(toJson(sessionMap))
            }

            delete('sandbox/{user}/session/{sessionId}') {
                response.status = 201
                def command = new CloseSession(username: params.user, sessionId: params.required('sessionId', long))
                commandDispatcher.submit(command)
            }

            post('sandbox/{user}/instance-type/{instanceType}') {
                response.contentType = "application/json"
                def command = new CreateSession(username: params.user, instanceType: params.instanceType)
                validateRequest(command)
                def session = commandDispatcher.submit(command) as SandboxSession
                switch (session.status) {
                    case ACTIVE:
                        response.status = 201
                        def sessionMap = toSessionMap(session, instanceTypesById())
                        return send(toJson(sessionMap))
                    case STARTING:
                        return response.status = 202
                    default:
                        throw new IllegalStateException("Expected session to be ACTIVE or STARTING after creation: $session")
                }
            }

            post('sandbox/{user}/session/{sessionId}/alive') {
                commandDispatcher.submit(new SessionHeartbeatReceived(username: params.user, sessionId: params.sessionId as long))
                response.status = 204
            }
        }
    }

    private Map<String, WorkerInstanceType> instanceTypesById(List<WorkerInstanceType> instanceTypes = queryDispatcher.submit(new FindInstanceTypes())) {
        instanceTypes.collectEntries {
            [it.id, it]
        } as Map<String, WorkerInstanceType>
    }

    private Map toSessionMap(SandboxSession session, Map<String, WorkerInstanceType> instanceTypeById) {
        def instanceType = instanceTypeById[session.instanceType]
        return [
                id: session.id,
                path: "sandbox/$session.username/session/$session.id",
                host: session.host,
                port: session.port,
                username: session.username,
                alivePath: "sandbox/$session.username/session/$session.id/alive",
                status: session.status.name(),
                instanceType: [
                        id: instanceType.id,
                        name: instanceType.name,
                        description: instanceType.description,
                        hourlyCost: instanceType.hourlyCost
                ],
                creationTime: session.creationTime.format("yyyy-MM-dd'T'HH:mm:ss"),
                costSinceCreation: (instanceType.hourlyCost * hoursSince(session.creationTime)).round(2)
        ]
    }

    int hoursSince(Date date) {
        Math.ceil(Duration.between(date.toInstant(), clock.now().toInstant()).toMinutes() / 60)
    }
}
