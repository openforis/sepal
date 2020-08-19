package org.openforis.sepal.component.hostingservice.api

import groovy.transform.Immutable

@Immutable
class InstanceType {
    String id
    String name
    String tag
    int cpuCount
    double ramGiB
    double hourlyCost
    int idleCount
    List<String> devices

    String getDescription() {
        return "$cpuCount CPU / $ramGiB GiB"
    }


    double getRamBytes() {
        return ramGiB * Math.pow(2, 30)
    }
}
