package org.openforis.sepal.component.workersession.api

import groovy.transform.Immutable
import org.openforis.sepal.component.hostingservice.api.InstanceType

@Immutable
class UserSessionReport {
    List<WorkerSession> sessions
    List<InstanceType> instanceTypes
    Spending spending
}
