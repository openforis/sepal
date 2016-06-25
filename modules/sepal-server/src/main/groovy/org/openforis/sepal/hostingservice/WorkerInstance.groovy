package org.openforis.sepal.hostingservice

import groovy.transform.ToString

@ToString(includeSuperProperties = true, includePackage = false, includeNames = true)
class WorkerInstance {
    String id
    String host
    String type
    boolean running
    boolean idle
    Date launchTime
    Date reservedTime
}
