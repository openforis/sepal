package org.openforis.sepal.sandbox

import groovy.transform.ToString


@ToString
class SandboxData implements Serializable {
    int sandboxId
    String username
    SandboxStatus status
    String containerId
    String uri
    Date createdOn
    Date terminatedOn
    Date statusRefreshedOn

    SandboxData() {
        super()
    }

}

enum SandboxStatus {
    REQUESTED,CREATED, STOPPED, ALIVE, TERMINATED
}
