package org.openforis.sepal.component.task

import groovy.transform.Immutable

import static org.openforis.sepal.component.task.Instance.State.ACTIVE
import static org.openforis.sepal.component.task.Instance.State.PROVISIONING

@Immutable
final class Instance {
    String id
    String host
    String type
    String username
    Role role
    State state

    Instance toProvisioning(String username, Role role) {
        new Instance(id: id, host: host, type: type, username: username, role: role, state: PROVISIONING)
    }

    Instance toProvisioning() {
        new Instance(id: id, host: host, type: type, username: username, role: role, state: PROVISIONING)
    }

    Instance toActive() {
        new Instance(id: id, host: host, type: type, username: username, role: Role.IDLE, state: ACTIVE)
    }

    Instance toIdle() {
        assert role != Role.IDLE, 'Did not expect instance to be idle before making it idle'
        new Instance(id: id, host: host, type: type, username: null, role: Role.IDLE, state: null)
    }

    enum Role {
        IDLE, SANDBOX, TASK_EXECUTOR
    }

    enum State {
        STARTING, PROVISIONING, ACTIVE
    }
}
