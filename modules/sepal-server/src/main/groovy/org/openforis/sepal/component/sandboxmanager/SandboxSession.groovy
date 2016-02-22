package org.openforis.sepal.component.sandboxmanager

import groovy.transform.ToString
import org.openforis.sepal.hostingservice.WorkerInstance

import static org.openforis.sepal.component.sandboxmanager.SessionStatus.*

@ToString
class SandboxSession {
    long id
    String username
    String instanceId
    String instanceType
    String host
    Integer port
    SessionStatus status
    Date creationTime
    Date updateTime

    static pending(long id, String username, String instanceType, Date date) {
        return new SandboxSession(id: id,
                username: username,
                instanceType: instanceType,
                status: PENDING,
                creationTime: date,
                updateTime: date
        )
    }

    SandboxSession starting(WorkerInstance instance) {
        verifyStatus([PENDING, STARTING])
        return new SandboxSession(
                id: id,
                username: username,
                instanceId: instance.id,
                instanceType: instance.type,
                host: instance.host,
                port: port,
                status: STARTING,
                creationTime: creationTime,
                updateTime: updateTime
        )
    }

    SandboxSession active(WorkerInstance instance, int port, Date date) {
        verifyStatus([PENDING, STARTING])
        return new SandboxSession(
                id: id,
                username: username,
                instanceId: instance.id,
                instanceType: instance.type,
                host: instance.host,
                port: port,
                status: ACTIVE,
                creationTime: creationTime,
                updateTime: date
        )
    }

    private void verifyStatus(ArrayList<SessionStatus> expectedStatuses) {
        if (!expectedStatuses.contains(status))
            throw new IllegalStateException()
    }

    SandboxSession closed(Date date) {
        return new SandboxSession(
                id: id,
                username: username,
                instanceId: instanceId,
                instanceType: instanceType,
                host: host,
                port: port,
                status: CLOSED,
                creationTime: creationTime,
                updateTime: date
        )
    }

    SandboxSession alive(Date date) {
        return new SandboxSession(
                id: id,
                username: username,
                instanceId: instanceId,
                instanceType: instanceType,
                host: host,
                port: port,
                status: status,
                creationTime: creationTime,
                updateTime: date
        )
    }
}
