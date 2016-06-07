package org.openforis.sepal.component.workersession.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class UserSessionReport {
    List<WorkerSession> sessions
    List<InstanceType> instanceTypes
    Spending spending
}
