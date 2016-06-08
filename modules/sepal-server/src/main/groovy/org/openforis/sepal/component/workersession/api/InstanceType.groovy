package org.openforis.sepal.component.workersession.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class InstanceType {
    String id
    String name
    String description
    double hourlyCost
    int idleCount
}
