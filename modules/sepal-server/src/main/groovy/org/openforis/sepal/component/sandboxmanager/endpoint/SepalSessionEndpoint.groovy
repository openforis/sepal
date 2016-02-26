package org.openforis.sepal.component.sandboxmanager.endpoint

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.sandboxmanager.command.CloseSession
import org.openforis.sepal.component.sandboxmanager.command.CreateSession
import org.openforis.sepal.component.sandboxmanager.command.JoinSession
import org.openforis.sepal.component.sandboxmanager.query.FindInstanceTypes
import org.openforis.sepal.component.sandboxmanager.query.LoadSandboxInfo
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.QueryDispatcher
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.Clock

import java.time.Duration

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.*

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
                        monthlyInstanceSpending: info.monthlyInstanceSpending,
                        monthlyStorageBudget: info.monthlyStorageBudget,
                        monthlyStorageSpending: info.monthlyStorageSpending,
                        storageQuota: info.storageQuota,
                        storageUsed: info.storageUsed
                ]
                send(toJson(responseBodyMap))
            }

            post('sandbox/{user}/session/{sessionId}') {
                response.contentType = 'application/json'
                def command = new JoinSession(username: params.user, sessionId: params.required('sessionId', long))
                validateRequest(command)
                def session = commandDispatcher.submit(command)
                if (session.status == ACTIVE)
                    response.status = 201
                else if (session.status == STARTING)
                    response.status = 202
                else
                    throw new IllegalStateException("Expected session to be ACTIVE or STARTING after joining: $session")
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
                def session = commandDispatcher.submit(command)
                if (session.status == ACTIVE)
                    response.status = 201
                else if (session.status == STARTING)
                    response.status = 202
                else
                    throw new IllegalStateException("Expected session to be ACTIVE or STARTING after creation: $session")
                def sessionMap = toSessionMap(session, instanceTypesById())
                return send(toJson(sessionMap))
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
                status: toStatus(session),
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

    private String toStatus(SandboxSession session) {
        def status = session.status
        if (session.status == PENDING)
            status = STARTING
        return status.name()
    }

    int hoursSince(Date date) {
        Math.ceil(Duration.between(date.toInstant(), clock.now().toInstant()).toMinutes() / 60)
    }
}
