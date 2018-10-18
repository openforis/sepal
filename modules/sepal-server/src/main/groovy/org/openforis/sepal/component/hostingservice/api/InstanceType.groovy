package org.openforis.sepal.component.hostingservice.api

import groovy.transform.Immutable

@Immutable
class InstanceType {
    String id
    String name
    int cpuCount
    double ramGiB
    double hourlyCost
    int idleCount

    String getDescription() {
        return "$cpuCount CPU / $ramGiB GiB"
    }


    double getRamBytes() {
        return ramGiB * Math.pow(2, 30)
    }
}
