package org.openforis.sepal.component.sandboxmanager

import groovy.transform.ToString

@ToString
class PendingSession {
    long id
    String username
    String instanceType
    Date creationTime
}
