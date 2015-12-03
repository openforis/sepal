package org.openforis.sepal.instance

import groovy.transform.ToString


@ToString
class InstanceType {

    Long id
    String name
    String description
    Double hourlyCosts
    Double cpuCount
    Long ramMemory
    String notes
    Boolean enabled

    String requestUrl
}
