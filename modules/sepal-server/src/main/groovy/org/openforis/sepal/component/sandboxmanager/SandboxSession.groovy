package org.openforis.sepal.component.sandboxmanager

import groovy.transform.ToString
import org.openforis.sepal.hostingservice.Status
import org.openforis.sepal.hostingservice.WorkerInstance

@ToString
class SandboxSession {
    long id
    String username
    String instanceId
    String instanceType
    String host
    Integer port
    Status status
    Date creationTime
    Date updateTime
    Date terminationTime

    SandboxSession deployed(Status status, WorkerInstance instance, int port, Date date) {
        return new SandboxSession(
                id: id,
                username: username,
                instanceId: instance.id,
                instanceType: instance.type,
                host: instance.host,
                port: port,
                status: status,
                creationTime: creationTime,
                updateTime: date,
                terminationTime: null
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
                updateTime: date,
                terminationTime: null
        )
    }

}
