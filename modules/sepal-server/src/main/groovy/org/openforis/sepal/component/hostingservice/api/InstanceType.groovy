package org.openforis.sepal.component.hostingservice.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
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
