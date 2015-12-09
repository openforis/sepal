package org.openforis.sepal.session.model

import groovy.transform.ToString
import org.openforis.sepal.instance.Instance

@ToString
class SepalSession implements Serializable {
    int sessionId
    String username
    SessionStatus status
    String containerId
    String containerURI
    Date createdOn
    Date terminatedOn
    Date statusRefreshedOn
    Instance instance
    Long durationInSecs
    Double costs
    String requestUrl
    String connectionUrl

    SepalSession() {
        super()
    }

}

enum SessionStatus {
    REQUESTED,ALIVE,TERMINATED
}
